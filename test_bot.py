"""Проверки без настоящего токена и без запросов к Telegram."""

import os
import unittest
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import httpx
from telegram import Chat, MenuButtonCommands, Message, MessageEntity, Update
from telegram.ext import CommandHandler, MessageHandler

import bot


OFFLINE_TOKEN = "123456:OFFLINE_TEST_TOKEN"


class ReplyTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.message = SimpleNamespace(text="Привет, Макс!", reply_text=AsyncMock())
        self.update = SimpleNamespace(message=self.message)

    async def test_start(self):
        await bot.start(self.update, None)
        self.message.reply_text.assert_awaited_once_with("Привет, Макс, я твой бот.")

    async def test_help(self):
        await bot.help_command(self.update, None)
        text = self.message.reply_text.await_args.args[0]
        self.assertIn("/start", text)
        self.assertIn("/help", text)
        self.assertIn("/price", text)
        self.assertIn("/change", text)
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
        for callback in (bot.start, bot.help_command, bot.price_command, bot.change_command, bot.echo):
            await callback(update, None)

    async def test_non_text_is_ignored(self):
        self.message.text = None
        await bot.echo(self.update, None)
        self.message.reply_text.assert_not_awaited()


class MenuTests(unittest.IsolatedAsyncioTestCase):
    async def test_menu_registers_all_commands_and_commands_button(self):
        telegram_bot = SimpleNamespace(
            set_my_commands=AsyncMock(), set_chat_menu_button=AsyncMock()
        )
        await bot.setup_menu(SimpleNamespace(bot=telegram_bot))
        telegram_bot.set_my_commands.assert_awaited_once()
        commands = telegram_bot.set_my_commands.await_args.args[0]
        self.assertEqual(
            [(command.command, command.description) for command in commands],
            [
                ("start", "Приветствие"),
                ("help", "Список команд и помощь"),
                ("price", "Цена BTC/USDT на MEXC"),
                ("change", "Расчёт количества BTC (скоро)"),
            ],
        )
        telegram_bot.set_chat_menu_button.assert_awaited_once()
        button = telegram_bot.set_chat_menu_button.await_args.kwargs["menu_button"]
        self.assertIsInstance(button, MenuButtonCommands)


class PriceTests(unittest.IsolatedAsyncioTestCase):
    async def fetch_from_response(self, payload, status=200):
        def respond(request):
            self.assertEqual(request.url.host, "api.mexc.com")
            self.assertEqual(request.url.path, "/api/v3/ticker/price")
            self.assertEqual(request.url.params["symbol"], "BTCUSDT")
            return httpx.Response(status, json=payload)

        client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
        with patch("bot.httpx.AsyncClient", return_value=client):
            return await bot.fetch_btc_price()

    async def test_fetch_price_from_mexc_response(self):
        price = await self.fetch_from_response({"symbol": "BTCUSDT", "price": "67123.45000000"})
        self.assertEqual(price, Decimal("67123.45"))

    async def test_fetch_rejects_invalid_data(self):
        payloads = [
            {}, [], {"symbol": "ETHUSDT", "price": "123.45"},
            *({"symbol": "BTCUSDT", "price": value}
              for value in (None, 123, "abc", "NaN", "Infinity", "0", "-1")),
        ]
        for payload in payloads:
            with self.subTest(payload=payload):
                with self.assertRaises((ValueError, InvalidOperation)):
                    await self.fetch_from_response(payload)

    async def test_fetch_rejects_http_errors(self):
        for status in (429, 500):
            with self.subTest(status=status):
                with self.assertRaises(httpx.HTTPStatusError):
                    await self.fetch_from_response({"code": -1}, status=status)

    async def test_fetch_timeout(self):
        def timeout(request):
            raise httpx.ReadTimeout("Test timeout", request=request)

        client = httpx.AsyncClient(transport=httpx.MockTransport(timeout))
        with patch("bot.httpx.AsyncClient", return_value=client):
            with self.assertRaises(httpx.ReadTimeout):
                await bot.fetch_btc_price()

    async def test_price_reply(self):
        update = SimpleNamespace(message=SimpleNamespace(reply_text=AsyncMock()))
        with patch("bot.fetch_btc_price", new=AsyncMock(return_value=Decimal("67123.45"))):
            await bot.price_command(update, None)
        update.message.reply_text.assert_awaited_once()
        text = update.message.reply_text.await_args.args[0]
        self.assertIn("BTC/USDT — MEXC (спот)", text)
        self.assertIn("1 BTC = 67 123.45 USDT", text)
        self.assertRegex(text, r"Получено: \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2} \(Красноярск, UTC\+7\)")

    async def test_price_failure_has_friendly_reply(self):
        for error in (httpx.ReadTimeout("Timeout"), ValueError("Bad data"), InvalidOperation()):
            with self.subTest(error=type(error).__name__):
                update = SimpleNamespace(message=SimpleNamespace(reply_text=AsyncMock()))
                with patch("bot.fetch_btc_price", new=AsyncMock(side_effect=error)):
                    await bot.price_command(update, None)
                update.message.reply_text.assert_awaited_once_with(
                    "Не удалось получить курс MEXC. Попробуй /price чуть позже."
                )


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
        self.assertIs(application.post_init, bot.setup_menu)
        start_handler, help_handler, price_handler, change_handler, echo_handler = application.handlers[0]
        self.assertIsInstance(start_handler, CommandHandler)
        self.assertIsInstance(help_handler, CommandHandler)
        self.assertIsInstance(price_handler, CommandHandler)
        self.assertIsInstance(change_handler, CommandHandler)
        self.assertIsInstance(echo_handler, MessageHandler)
        self.assertIs(start_handler.callback, bot.start)
        self.assertIs(help_handler.callback, bot.help_command)
        self.assertIs(price_handler.callback, bot.price_command)
        self.assertIs(change_handler.callback, bot.change_command)
        self.assertIs(echo_handler.callback, bot.echo)
        for command, handler in (("/start", start_handler), ("/help", help_handler), ("/price", price_handler), ("/change", change_handler)):
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
