"""Учебный Telegram-бот Макса. Токен задаётся через BOT_TOKEN."""

import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

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
PRICE_TIMEZONE = timezone(timedelta(hours=7))
HELP_MESSAGE = (
    "/start — приветствие.\n"
    "/help — объяснение команд.\n"
    "/price — текущая цена BTC/USDT на MEXC (спот).\n"
    "/change — расчёт количества BTC (пока настраивается).\n"
    "Отправь обычный текст, и я отвечу: «Ты написал: …», повторив сообщение."
)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message is not None:
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


async def change_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message is not None:
        await update.message.reply_text(
            "Расчёт количества BTC пока настраивается. Формула ещё не задана."
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
            BotCommand("change", "Расчёт количества BTC (скоро)"),
        ]
    )
    await application.bot.set_chat_menu_button(menu_button=MenuButtonCommands())


def build_application(token: str) -> Application:
    application = Application.builder().token(token).post_init(setup_menu).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("price", price_command))
    application.add_handler(CommandHandler("change", change_command))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))
    return application


def main() -> None:
    token = os.environ.get("BOT_TOKEN", "").strip()
    if not token:
        raise SystemExit("Задайте секрет BOT_TOKEN в переменных окружения перед запуском.")
    application = build_application(token)
    application.run_polling()


if __name__ == "__main__":
    main()
