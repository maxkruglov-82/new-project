"""Проверки без настоящего токена и без запросов к Telegram."""

import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from telegram import Chat, Message, MessageEntity, Update
from telegram.ext import CommandHandler, MessageHandler

import bot


OFFLINE_TOKEN = "123456:OFFLINE_TEST_TOKEN"


class ReplyTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.message = SimpleNamespace(text="Привет, Макс!", reply_text=AsyncMock())
        self.update = SimpleNamespace(message=self.message)

    async def test_start(self):
        await bot.start(self.update, None)
        self.message.reply_text.assert_awaited_once_with("Привет! Я учебный бот Макса")

    async def test_help(self):
        await bot.help_command(self.update, None)
        text = self.message.reply_text.await_args.args[0]
        self.assertIn("/start", text)
        self.assertIn("/help", text)
        self.assertIn("Ты написал:", text)

    async def test_echo_preserves_text(self):
        self.message.text = "Привет!\n<Макс> & друзья 👋"
        await bot.echo(self.update, None)
        self.message.reply_text.assert_awaited_once_with(
            "Ты написал: Привет!\n<Макс> & друзья 👋"
        )

    async def test_long_echo_is_split_without_losing_text(self):
        self.message.text = "я" * 4096
        await bot.echo(self.update, None)
        replies = [call.args[0] for call in self.message.reply_text.await_args_list]
        self.assertEqual(len(replies), 2)
        self.assertTrue(all(0 < len(text) <= 4096 for text in replies))
        self.assertEqual("".join(replies), "Ты написал: " + self.message.text)

    async def test_updates_without_message_are_ignored(self):
        update = SimpleNamespace(message=None)
        for callback in (bot.start, bot.help_command, bot.echo):
            await callback(update, None)

    async def test_non_text_is_ignored(self):
        self.message.text = None
        await bot.echo(self.update, None)
        self.message.reply_text.assert_not_awaited()


class ApplicationTests(unittest.TestCase):
    def setUp(self):
        # Любая случайная попытка сетевого соединения должна провалить тест.
        network = patch("socket.socket.connect", side_effect=AssertionError("Сеть запрещена"))
        network.start()
        self.addCleanup(network.stop)

    def make_update(self, text, is_command=False):
        entities = (
            [MessageEntity(MessageEntity.BOT_COMMAND, offset=0, length=len(text))]
            if is_command
            else []
        )
        message = Message(
            message_id=1,
            date=datetime.now(timezone.utc),
            chat=Chat(id=1, type=Chat.PRIVATE),
            text=text,
            entities=entities,
        )
        message.set_bot(Mock(username="MaxStudyBot"))
        return Update(update_id=1, message=message)

    def test_command_and_text_routing(self):
        application = bot.build_application(OFFLINE_TOKEN)
        start_handler, help_handler, echo_handler = application.handlers[0]
        self.assertIsInstance(start_handler, CommandHandler)
        self.assertIsInstance(help_handler, CommandHandler)
        self.assertIsInstance(echo_handler, MessageHandler)
        self.assertIs(start_handler.callback, bot.start)
        self.assertIs(help_handler.callback, bot.help_command)
        self.assertIs(echo_handler.callback, bot.echo)
        for command, handler in (("/start", start_handler), ("/help", help_handler)):
            update = self.make_update(command, is_command=True)
            match = handler.check_update(update)
            self.assertIsNotNone(match)
            self.assertIsNot(match, False)
            self.assertFalse(echo_handler.check_update(update))
        self.assertTrue(echo_handler.check_update(self.make_update("Обычный текст")))
        unknown = self.make_update("/unknown", is_command=True)
        for handler in application.handlers[0]:
            self.assertIn(handler.check_update(unknown), (None, False))

    def test_missing_token_stops_before_startup(self):
        with patch.dict(os.environ), patch("bot.build_application") as build:
            os.environ.pop("BOT_TOKEN", None)
            with self.assertRaisesRegex(SystemExit, "BOT_TOKEN"):
                bot.main()
            build.assert_not_called()

    def test_empty_token_stops_before_startup(self):
        with patch.dict(os.environ, {"BOT_TOKEN": "  "}), patch("bot.build_application") as build:
            with self.assertRaisesRegex(SystemExit, "BOT_TOKEN"):
                bot.main()
            build.assert_not_called()

    def test_main_reads_token_and_starts_polling(self):
        with patch.dict(os.environ, {"BOT_TOKEN": OFFLINE_TOKEN}):
            with patch("bot.build_application") as build:
                bot.main()
                build.assert_called_once_with(OFFLINE_TOKEN)
                build.return_value.run_polling.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
