"""Учебный Telegram-бот Макса. Токен задаётся через BOT_TOKEN."""

import os

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

START_MESSAGE = "Привет! Я учебный бот Макса"
HELP_MESSAGE = (
    "/start — приветствие.\n"
    "/help — объяснение команд.\n"
    "Отправь обычный текст, и я отвечу: «Ты написал: …», повторив сообщение."
)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message is not None:
        await update.message.reply_text(START_MESSAGE)


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message is not None:
        await update.message.reply_text(HELP_MESSAGE)


async def echo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message is None or update.message.text is None:
        return
    reply = f"Ты написал: {update.message.text}"
    # Telegram принимает не более 4096 символов в одном текстовом ответе.
    for offset in range(0, len(reply), 4096):
        await update.message.reply_text(reply[offset : offset + 4096])


def build_application(token: str) -> Application:
    application = Application.builder().token(token).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
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
