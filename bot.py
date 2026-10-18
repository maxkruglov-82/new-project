"""Учебный Telegram-бот Макса. Токен задаётся через BOT_TOKEN."""

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_UP
from html.parser import HTMLParser
from time import time_ns

import httpx

from telegram import BotCommand, MenuButtonCommands, Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

START_MESSAGE = "Привет, Макс, я твой бот."
MEXC_PRICE_URL = "https://api.mexc.com/api/v3/ticker/price"
BINANCE_USDT_RUB_URL = "https://www.binance.com/ru/price/tether/RUB"
MAX_RATE_AGE_SECONDS = 900
QUOTE_ATTEMPTS = 3
QUOTE_RETRY_DELAYS = (0.5, 1.0)
QUOTE_FETCH_BUDGET_SECONDS = 18
QUOTE_REQUEST_TIMEOUT = httpx.Timeout(5.0, connect=3.0)
logger = logging.getLogger(__name__)
PRICE_TIMEZONE = timezone(timedelta(hours=7))
HELP_MESSAGE = (
    "/start — приветствие.\n"
    "/help — объяснение команд.\n"
    "/price — текущая цена BTC/USDT на MEXC (спот).\n"
    "/change — сколько BTC нужно: сумма в рублях + 8,5%, курсы Binance и MEXC.\n"
    "Отправь обычный текст, и я отвечу: «Ты написал: …», повторив сообщение."
)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message is not None:
        if context is not None and context.user_data is not None:
            context.user_data.pop("change_waiting_amount", None)
        await update.message.reply_text(START_MESSAGE)


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message is not None:
        await update.message.reply_text(HELP_MESSAGE)


class TemporaryQuoteError(ValueError):
    """Временный пустой/повреждённый ответ или устаревшая копия котировки."""


async def fetch_quote_with_retries(source, fetch_once):
    """Повторяет временные сбои одного источника в пределах общего срока."""
    async def attempts():
        for attempt in range(QUOTE_ATTEMPTS):
            try:
                return await fetch_once()
            except (httpx.HTTPError, ValueError, InvalidOperation) as error:
                status = error.response.status_code if isinstance(error, httpx.HTTPStatusError) else None
                retryable = (
                    isinstance(error, (httpx.TransportError, TemporaryQuoteError))
                    or status in (408, 425, 429)
                    or (status is not None and 500 <= status <= 599)
                )
                # Только источник, тип ошибки и статус: без URL, токена и содержимого ответа.
                logger.warning(
                    "Курс %s: попытка %d/%d, %s, HTTP=%s",
                    source, attempt + 1, QUOTE_ATTEMPTS, type(error).__name__, status,
                )
                if not retryable or attempt == QUOTE_ATTEMPTS - 1:
                    raise
                await asyncio.sleep(QUOTE_RETRY_DELAYS[attempt])

    try:
        return await asyncio.wait_for(attempts(), timeout=QUOTE_FETCH_BUDGET_SECONDS)
    except asyncio.TimeoutError as error:
        logger.warning("Курс %s: истёк общий срок получения котировки", source)
        raise httpx.ReadTimeout(f"Истёк срок получения курса {source}") from error


def parse_btc_price(data) -> Decimal:
    if not isinstance(data, dict) or data.get("symbol") != "BTCUSDT":
        raise ValueError("Неожиданный ответ MEXC")
    raw_price = data.get("price")
    if not isinstance(raw_price, str):
        raise ValueError("В ответе MEXC нет цены")
    price = Decimal(raw_price)
    if not price.is_finite() or price <= 0:
        raise ValueError("Некорректная цена MEXC")
    return price


async def fetch_btc_price() -> Decimal:
    """Последняя цена BTCUSDT с повтором временных сбоев публичного API."""
    async with httpx.AsyncClient(timeout=QUOTE_REQUEST_TIMEOUT) as client:
        async def fetch_once():
            response = await client.get(MEXC_PRICE_URL, params={"symbol": "BTCUSDT"})
            response.raise_for_status()
            try:
                data = response.json()
            except ValueError as error:
                raise TemporaryQuoteError("Ответ MEXC не содержит JSON") from error
            return parse_btc_price(data)

        return await fetch_quote_with_retries("MEXC", fetch_once)


async def price_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message is None:
        return
    try:
        price = await fetch_btc_price()
    except (httpx.HTTPError, ValueError, InvalidOperation):
        await update.message.reply_text(
            "Не удалось получить курс MEXC. Попробуй /price чуть позже."
        )
        return
    received_at = datetime.now(PRICE_TIMEZONE).strftime("%d.%m.%Y %H:%M:%S")
    formatted_price = f"{price:,.2f}".replace(",", " ")
    await update.message.reply_text(
        f"BTC/USDT — MEXC (спот)\n"
        f"1 BTC = {formatted_price} USDT\n"
        f"Получено: {received_at} (Красноярск, UTC+7)"
    )


@dataclass(frozen=True)
class UsdtRubQuote:
    rate: Decimal
    updated_at: datetime


class BinancePageDataParser(HTMLParser):
    """Читает только JSON состояния страницы, не выполняя её JavaScript."""

    def __init__(self):
        super().__init__()
        self.reading = False
        self.payloads = []

    def handle_starttag(self, tag, attrs):
        if tag == "script" and dict(attrs).get("id") == "__APP_DATA":
            self.reading = True
            self.payloads.append("")

    def handle_data(self, data):
        if self.reading:
            self.payloads[-1] += data

    def handle_endtag(self, tag):
        if tag == "script":
            self.reading = False


def validate_quote_time(updated: datetime) -> None:
    age = (datetime.now(timezone.utc) - updated).total_seconds()
    if age > MAX_RATE_AGE_SECONDS:
        raise TemporaryQuoteError("Котировка Binance устарела")
    if age < -60:
        raise ValueError("Дата котировки Binance некорректна")


def parse_usdt_rub_quote(html: str) -> UsdtRubQuote:
    parser = BinancePageDataParser()
    parser.feed(html)
    if not parser.payloads:
        raise TemporaryQuoteError("На странице Binance временно нет данных курса")
    if len(parser.payloads) != 1:
        raise ValueError("На странице Binance нет однозначных данных курса")
    try:
        data = json.loads(parser.payloads[0], parse_float=Decimal)
    except ValueError as error:
        raise TemporaryQuoteError("Повреждён JSON страницы Binance") from error
    try:
        routes = data["appState"]["loader"]["dataByRouteId"]
        if not isinstance(routes, dict):
            raise ValueError("Некорректные данные страницы Binance")
        candidates = [
            route for route in routes.values()
            if isinstance(route, dict)
            and isinstance(route.get("coin"), dict)
            and route["coin"].get("symbol") == "USDT"
            and route["coin"].get("slug") == "tether"
            and route.get("paramCurrency") == "RUB"
        ]
        if len(candidates) != 1:
            raise ValueError("На странице Binance нет однозначной пары USDT/RUB")
        route = candidates[0]
        if route.get("c2cConvertPriceEnabled") is not False:
            raise ValueError("На странице Binance используется другой режим конвертации")
        currency = route["currencyData"]
        if currency["value"] != "RUB" or currency["pair"] != "RUB_USD":
            raise ValueError("На странице Binance выбрана другая валюта")
        quote = route["coin"]["quote"]["USD"]
        prices = (quote["price"], currency["rate"])
        if any(isinstance(value, bool) or not isinstance(value, (Decimal, int, str)) for value in prices):
            raise ValueError("В данных Binance нет числового курса")
        usdt_usd, usd_rub = (Decimal(value) for value in prices)
        if any(not value.is_finite() or value <= 0 for value in (usdt_usd, usd_rub)):
            raise ValueError("Некорректный курс Binance")
        updated_at = quote["last_updated"]
        if not isinstance(updated_at, str):
            raise ValueError("В данных Binance нет времени обновления")
        updated = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        if updated.tzinfo is None:
            raise ValueError("В дате Binance нет часового пояса")
        validate_quote_time(updated)
        # Конвертер Binance умножает цену USDT в USD на курс RUB за 1 USD.
        return UsdtRubQuote(rate=usdt_usd * usd_rub, updated_at=updated)
    except (KeyError, TypeError) as error:
        raise ValueError("Изменился формат данных страницы Binance") from error


async def fetch_usdt_rub_quote() -> UsdtRubQuote:
    """Курс из конвертера Binance USDT/RUB; старая копия страницы не используется."""
    async with httpx.AsyncClient(timeout=QUOTE_REQUEST_TIMEOUT) as client:
        async def fetch_once():
            response = await client.get(
                BINANCE_USDT_RUB_URL,
                # Новый адрес даже при повторе в ту же секунду: старая CDN-копия не переиспользуется.
                params={"_": time_ns()},
                headers={"Cache-Control": "no-cache"},
            )
            response.raise_for_status()
            return parse_usdt_rub_quote(response.text)

        return await fetch_quote_with_retries("Binance", fetch_once)


async def fetch_usdt_rub_rate() -> Decimal:
    return (await fetch_usdt_rub_quote()).rate


async def change_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message is not None:
        context.user_data["change_waiting_amount"] = True
        context.user_data.pop("change_amount_rub", None)
        await update.message.reply_text(
            "Введи сумму в рублях, например: 100000, 150 000 или 300 тысяч.\n"
            "Для отмены отправь /start."
        )


def parse_rub_amount(text: str) -> Decimal:
    normalized = re.sub(r"\s+", "", text.lower())
    match = re.fullmatch(r"([0-9]+(?:[.,][0-9]{1,2})?)(тыс\.?|тысяч[аи]?|руб\.?|₽)?", normalized)
    if match is None:
        raise ValueError("Некорректная сумма")
    amount = Decimal(match.group(1).replace(",", "."))
    if match.group(2) and match.group(2).startswith("тыс"):
        amount *= 1000
    if amount <= 0:
        raise ValueError("Сумма должна быть положительной")
    return amount


def calculate_usdt_amount(amount_rub: Decimal, usdt_rub_rate: Decimal) -> Decimal:
    """Сумма в USDT: к рублям прибавить 8,5% и разделить на RUB за 1 USDT."""
    if any(not value.is_finite() or value <= 0 for value in (amount_rub, usdt_rub_rate)):
        raise ValueError("Сумма и курс должны быть положительными")
    return amount_rub * Decimal("1.085") / usdt_rub_rate


def calculate_btc_amount(amount_rub: Decimal, usdt_rub_rate: Decimal, btc_usdt_price: Decimal) -> Decimal:
    if not btc_usdt_price.is_finite() or btc_usdt_price <= 0:
        raise ValueError("Цена BTC должна быть положительной")
    usdt_amount = calculate_usdt_amount(amount_rub, usdt_rub_rate)
    return (usdt_amount / btc_usdt_price).quantize(Decimal("0.00000001"), rounding=ROUND_UP)


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message is None or update.message.text is None:
        return
    if not context.user_data.get("change_waiting_amount"):
        await echo(update, context)
        return
    try:
        amount = parse_rub_amount(update.message.text)
    except (ValueError, InvalidOperation):
        await update.message.reply_text(
            "Введи положительную сумму в рублях, например: 100000 или 100 тысяч.\n"
            "Для отмены отправь /start."
        )
        return
    context.user_data["change_amount_rub"] = amount
    quotes = await asyncio.gather(fetch_usdt_rub_quote(), fetch_btc_price(), return_exceptions=True)
    if not isinstance(quotes[0], BaseException):
        try:
            # Курс мог устареть, пока второй источник выполнял повторы.
            validate_quote_time(quotes[0].updated_at)
        except (ValueError, InvalidOperation) as error:
            quotes[0] = error
    failed_sources = []
    for source, result in zip(("Binance (USDT/RUB)", "MEXC (BTC/USDT)"), quotes):
        if isinstance(result, BaseException):
            if not isinstance(result, (httpx.HTTPError, ValueError, InvalidOperation)):
                raise result
            failed_sources.append(source)
    if failed_sources:
        await update.message.reply_text(
            f"Не удалось получить свежие курсы: {', '.join(failed_sources)}.\n"
            "Для повтора отправь сумму ещё раз. Для отмены — /start."
        )
        return
    try:
        fiat_quote, btc_usdt = quotes
        usdt_rub = fiat_quote.rate
        btc_amount = calculate_btc_amount(amount, usdt_rub, btc_usdt)
    except (httpx.HTTPError, ValueError, InvalidOperation):
        await update.message.reply_text(
            "Не удалось получить свежие курсы Binance и MEXC.\n"
            "Для повтора отправь сумму ещё раз. Для отмены — /start."
        )
        return
    context.user_data.pop("change_waiting_amount", None)
    amount_text = f"{amount:,.2f}".replace(",", " ").replace(".", ",")
    if amount_text.endswith(",00"):
        amount_text = amount_text[:-3]
    displayed_btc = btc_amount.quantize(Decimal("0.000001"), rounding=ROUND_UP)
    btc_price_text = f"{btc_usdt:,.2f}".replace(",", " ")
    source_time = fiat_quote.updated_at.astimezone(PRICE_TIMEZONE).strftime("%d.%m.%Y %H:%M:%S")
    quote_age = max(0, (datetime.now(timezone.utc) - fiat_quote.updated_at).total_seconds())
    delay_notice = (
        f"; котировка Binance: {source_time} (Красноярск, UTC+7), {int(quote_age // 60)} мин. назад"
        if quote_age > 300 else ""
    )
    await update.message.reply_text(
        f"Для суммы {amount_text} руб необходимо {displayed_btc:.6f} btc "
        f"(курс USDT: {usdt_rub:.4f} руб — Binance; "
        f"курс BTC: {btc_price_text} USDT — MEXC{delay_notice})."
    )


async def echo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message is None or update.message.text is None:
        return
    reply = f"Ты написал: {update.message.text}"
    # Telegram принимает не более 4096 символов в одном текстовом ответе.
    for offset in range(0, len(reply), 4096):
        await update.message.reply_text(reply[offset : offset + 4096])


async def setup_menu(application: Application) -> None:
    """Регистрирует команды и кнопку меню при каждом запуске бота."""
    await application.bot.set_my_commands(
        [
            BotCommand("start", "Приветствие"),
            BotCommand("help", "Список команд и помощь"),
            BotCommand("price", "Цена BTC/USDT на MEXC"),
            BotCommand("change", "Сколько BTC нужно за сумму в рублях"),
        ]
    )
    await application.bot.set_chat_menu_button(menu_button=MenuButtonCommands())


def build_application(token: str) -> Application:
    application = Application.builder().token(token).post_init(setup_menu).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("price", price_command))
    application.add_handler(CommandHandler("change", change_command))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    return application


def main() -> None:
    token = os.environ.get("BOT_TOKEN", "").strip()
    if not token:
        raise SystemExit("Задайте секрет BOT_TOKEN в переменных окружения перед запуском.")
    application = build_application(token)
    application.run_polling()


if __name__ == "__main__":
    main()
