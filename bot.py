"""Учебный Telegram-бот Макса. Токен задаётся через BOT_TOKEN."""

import asyncio
import os
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_UP

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
COINGECKO_PRICE_URL = "https://api.coingecko.com/api/v3/simple/price"
MAX_RATE_AGE_SECONDS = 300
PRICE_TIMEZONE = timezone(timedelta(hours=7))
HELP_MESSAGE = (
    "/start — приветствие.\n"
    "/help — объяснение команд.\n"
    "/price — текущая цена BTC/USDT на MEXC (спот).\n"
    "/change — сколько BTC нужно: сумма в рублях + 8,5%, курсы CoinGecko и MEXC.\n"
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


async def fetch_btc_price() -> Decimal:
    """Последняя цена сделки BTCUSDT; публичный API, без ключа и кеша."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(MEXC_PRICE_URL, params={"symbol": "BTCUSDT"})
        response.raise_for_status()
        data = response.json()
    if not isinstance(data, dict) or data.get("symbol") != "BTCUSDT":
        raise ValueError("Неожиданный ответ MEXC")
    raw_price = data.get("price")
    if not isinstance(raw_price, str):
        raise ValueError("В ответе MEXC нет цены")
    price = Decimal(raw_price)
    if not price.is_finite() or price <= 0:
        raise ValueError("Некорректная цена MEXC")
    return price


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


async def fetch_usdt_rub_rate() -> Decimal:
    """Рыночный курс RUB за 1 USDT из CoinGecko, с проверкой свежести."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            COINGECKO_PRICE_URL,
            params={"ids": "tether", "vs_currencies": "rub", "include_last_updated_at": "true"},
        )
        response.raise_for_status()
        data = response.json(parse_float=Decimal)
    if not isinstance(data, dict) or not isinstance(data.get("tether"), dict):
        raise ValueError("Неожиданный ответ CoinGecko")
    quote = data["tether"]
    raw_rate = quote.get("rub")
    if isinstance(raw_rate, bool) or not isinstance(raw_rate, (Decimal, int, str)):
        raise ValueError("В ответе CoinGecko нет курса USDT/RUB")
    rate = Decimal(raw_rate)
    if not rate.is_finite() or rate <= 0:
        raise ValueError("Некорректный курс CoinGecko")
    updated_at = quote.get("last_updated_at")
    if isinstance(updated_at, bool) or not isinstance(updated_at, int):
        raise ValueError("В ответе CoinGecko нет времени обновления")
    age = datetime.now(timezone.utc).timestamp() - updated_at
    if not -60 <= age <= MAX_RATE_AGE_SECONDS:
        raise ValueError("Курс CoinGecko устарел или время обновления некорректно")
    return rate


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
    try:
        usdt_rub, btc_usdt = await asyncio.gather(fetch_usdt_rub_rate(), fetch_btc_price())
        usdt_amount = calculate_usdt_amount(amount, usdt_rub)
        btc_amount = calculate_btc_amount(amount, usdt_rub, btc_usdt)
    except (httpx.HTTPError, ValueError, InvalidOperation):
        await update.message.reply_text(
            "Не удалось получить свежие курсы CoinGecko и MEXC.\n"
            "Для повтора отправь сумму ещё раз. Для отмены — /start."
        )
        return
    context.user_data.pop("change_waiting_amount", None)
    amount_with_markup = amount * Decimal("1.085")
    amount_text = f"{amount:,.2f}".replace(",", " ").replace(".", ",")
    markup_text = f"{amount_with_markup:,.2f}".replace(",", " ").replace(".", ",")
    btc_price_text = f"{btc_usdt:,.2f}".replace(",", " ")
    received_at = datetime.now(PRICE_TIMEZONE).strftime("%d.%m.%Y %H:%M:%S")
    await update.message.reply_text(
        f"Сумма: {amount_text} ₽\n"
        f"С учётом 8,5%: {markup_text} ₽\n"
        f"USDT/RUB (CoinGecko): {usdt_rub:.4f} ₽ за 1 USDT\n"
        f"Получается: {usdt_amount:.6f} USDT\n"
        f"BTC/USDT (MEXC): {btc_price_text} USDT за 1 BTC\n"
        f"Нужно: {btc_amount:.8f} BTC\n"
        f"Получено: {received_at} (Красноярск, UTC+7)\n"
        "BTC округлён вверх до 8 знаков."
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
