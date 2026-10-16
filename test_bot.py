"""Проверки без настоящего токена и без запросов к Telegram."""

import json
import os
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import httpx
from telegram import Chat, MenuButtonCommands, Message, MessageEntity, Update
from telegram.ext import CommandHandler, MessageHandler

import bot


OFFLINE_TOKEN = "123456:OFFLINE_TEST_TOKEN"


def make_usdt_quote(rate="100", age_seconds=0):
    return bot.UsdtRubQuote(
        rate=Decimal(rate),
        updated_at=datetime.now(timezone.utc) - timedelta(seconds=age_seconds),
    )


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
        for callback in (bot.start, bot.help_command, bot.price_command, bot.change_command, bot.handle_text, bot.echo):
            await callback(update, None)

    async def test_non_text_is_ignored(self):
        self.message.text = None
        await bot.echo(self.update, None)
        self.message.reply_text.assert_not_awaited()


class ChangeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.context = SimpleNamespace(user_data={})
        self.message = SimpleNamespace(text="100 тысяч", reply_text=AsyncMock())
        self.update = SimpleNamespace(message=self.message)

    async def test_change_requests_amount_and_resets_previous_amount(self):
        self.context.user_data["change_amount_rub"] = Decimal("300000")
        await bot.change_command(self.update, self.context)
        self.assertTrue(self.context.user_data["change_waiting_amount"])
        self.assertNotIn("change_amount_rub", self.context.user_data)
        self.assertIn("Введи сумму в рублях", self.message.reply_text.await_args.args[0])

    async def test_valid_amount_fetches_rates_and_calculates_btc(self):
        self.context.user_data["change_waiting_amount"] = True
        with patch("bot.fetch_usdt_rub_quote", new=AsyncMock(return_value=make_usdt_quote())) as fiat:
            with patch("bot.fetch_btc_price", new=AsyncMock(return_value=Decimal("50000"))) as btc:
                await bot.handle_text(self.update, self.context)
        fiat.assert_awaited_once()
        btc.assert_awaited_once()
        self.assertEqual(self.context.user_data["change_amount_rub"], Decimal("100000"))
        self.assertNotIn("change_waiting_amount", self.context.user_data)
        self.message.reply_text.assert_awaited_once()
        text = self.message.reply_text.await_args.args[0]
        for expected in (
            "Сумма: 100 000,00 ₽", "С учётом 8,5%: 108 500,00 ₽",
            "USDT/RUB (Binance): 100.0000 ₽ за 1 USDT", "Получается: 1085.000000 USDT",
            "BTC/USDT (MEXC): 50 000.00 USDT за 1 BTC", "Нужно: 0.02170000 BTC",
            "BTC округлён вверх до 8 знаков.",
        ):
            self.assertIn(expected, text)

    async def test_api_failure_preserves_input_and_allows_retry(self):
        self.context.user_data["change_waiting_amount"] = True
        with patch("bot.fetch_usdt_rub_quote", new=AsyncMock(side_effect=httpx.ReadTimeout("Test timeout"))):
            with patch("bot.fetch_btc_price", new=AsyncMock(return_value=Decimal("50000"))):
                await bot.handle_text(self.update, self.context)
        self.assertTrue(self.context.user_data["change_waiting_amount"])
        self.assertEqual(self.context.user_data["change_amount_rub"], Decimal("100000"))
        text = self.message.reply_text.await_args.args[0]
        self.assertIn("Не удалось получить свежие курсы", text)
        self.assertNotIn("Нужно:", text)
        self.message.reply_text.reset_mock()
        with patch("bot.fetch_usdt_rub_quote", new=AsyncMock(return_value=make_usdt_quote())):
            with patch("bot.fetch_btc_price", new=AsyncMock(return_value=Decimal("50000"))):
                await bot.handle_text(self.update, self.context)
        self.assertNotIn("change_waiting_amount", self.context.user_data)
        self.assertIn("Нужно: 0.02170000 BTC", self.message.reply_text.await_args.args[0])

    async def test_mexc_failure_does_not_return_a_calculation(self):
        self.context.user_data["change_waiting_amount"] = True
        with patch("bot.fetch_usdt_rub_quote", new=AsyncMock(return_value=make_usdt_quote())):
            with patch("bot.fetch_btc_price", new=AsyncMock(side_effect=ValueError("Bad quote"))):
                await bot.handle_text(self.update, self.context)
        self.assertTrue(self.context.user_data["change_waiting_amount"])
        self.assertIn("Не удалось получить свежие курсы", self.message.reply_text.await_args.args[0])

    async def test_invalid_amount_keeps_waiting_for_input(self):
        self.context.user_data["change_waiting_amount"] = True
        self.message.text = "не число"
        await bot.handle_text(self.update, self.context)
        self.assertTrue(self.context.user_data["change_waiting_amount"])
        self.assertNotIn("change_amount_rub", self.context.user_data)
        self.assertIn("положительную сумму", self.message.reply_text.await_args.args[0])

    async def test_delayed_quote_time_is_visible_in_calculation(self):
        self.context.user_data["change_waiting_amount"] = True
        quote = make_usdt_quote(age_seconds=600)
        with patch("bot.fetch_usdt_rub_quote", new=AsyncMock(return_value=quote)):
            with patch("bot.fetch_btc_price", new=AsyncMock(return_value=Decimal("50000"))):
                await bot.handle_text(self.update, self.context)
        text = self.message.reply_text.await_args.args[0]
        local_time = quote.updated_at.astimezone(bot.PRICE_TIMEZONE).strftime("%d.%m.%Y %H:%M:%S")
        self.assertIn(f"Котировка Binance: {local_time}", text)
        self.assertIn("Котировка Binance опубликована 10 мин. назад", text)
        self.assertIn("Нужно: 0.02170000 BTC", text)

    async def test_start_cancels_amount_input(self):
        self.context.user_data["change_waiting_amount"] = True
        await bot.start(self.update, self.context)
        self.assertNotIn("change_waiting_amount", self.context.user_data)
        self.message.reply_text.assert_awaited_once_with("Привет, Макс, я твой бот.")

    async def test_normal_text_still_echoes(self):
        self.message.text = "Привет"
        await bot.handle_text(self.update, self.context)
        self.message.reply_text.assert_awaited_once_with("Ты написал: Привет")


class RubAmountTests(unittest.TestCase):
    def test_supported_amount_formats(self):
        examples = {
            "100000": "100000", "150 000": "150000", "300 тысяч": "300000",
            "100 тыс.": "100000", "1\u00a0234,56 ₽": "1234.56",
            "150,5 тыс": "150500", "0.01": "0.01",
        }
        for text, expected in examples.items():
            with self.subTest(text=text):
                self.assertEqual(bot.parse_rub_amount(text), Decimal(expected))

    def test_invalid_amounts(self):
        for text in ("", "0", "-100", "NaN", "Infinity", "1e5", "сто", "100.001"):
            with self.subTest(text=text):
                with self.assertRaises((ValueError, InvalidOperation)):
                    bot.parse_rub_amount(text)


class ChangeCalculationTests(unittest.TestCase):
    def test_rubles_plus_8_5_percent_divided_by_rub_per_usdt(self):
        examples = (
            ("100000", "100", "1085"),
            ("150000", "93", "1750"),
            ("300000", "100", "3255"),
            ("1000.50", "100", "10.855425"),
        )
        for rubles, rate, expected in examples:
            with self.subTest(rubles=rubles, rate=rate):
                self.assertEqual(
                    bot.calculate_usdt_amount(Decimal(rubles), Decimal(rate)),
                    Decimal(expected),
                )

    def test_nonpositive_or_nonfinite_inputs_are_rejected(self):
        for invalid in ("0", "-1", "NaN", "Infinity"):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    bot.calculate_usdt_amount(Decimal(invalid), Decimal("100"))
                with self.assertRaises(ValueError):
                    bot.calculate_usdt_amount(Decimal("100000"), Decimal(invalid))


    def test_btc_amount_rounds_up_to_a_satoshi(self):
        self.assertEqual(
            bot.calculate_btc_amount(Decimal("100000"), Decimal("100"), Decimal("90000")),
            Decimal("0.01205556"),
        )

    def test_usdt_is_not_rounded_before_conversion_to_btc(self):
        self.assertEqual(
            bot.calculate_btc_amount(Decimal("1000.50"), Decimal("100"), Decimal("100000")),
            Decimal("0.00010856"),
        )

    def test_invalid_btc_price_is_rejected(self):
        for invalid in ("0", "-1", "NaN", "Infinity"):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    bot.calculate_btc_amount(Decimal("100000"), Decimal("100"), Decimal(invalid))


class BinancePageTests(unittest.IsolatedAsyncioTestCase):
    def make_route(self):
        return {
            "coin": {
                "symbol": "USDT", "slug": "tether",
                "quote": {"USD": {"price": 0.9988, "last_updated": datetime.now(timezone.utc).isoformat()}},
            },
            "paramCurrency": "RUB",
            "currencyData": {"value": "RUB", "pair": "RUB_USD", "rate": 83.58},
            "c2cConvertPriceEnabled": False,
        }

    def make_page(self, routes):
        data = {"appState": {"loader": {"dataByRouteId": routes}}}
        return '<html><script type="application/json" id="__APP_DATA">' + json.dumps(data) + '</script></html>'

    async def fetch_from_page(self, html, status=200):
        def respond(request):
            self.assertEqual(request.url.host, "www.binance.com")
            self.assertEqual(request.url.path, "/ru/price/tether/RUB")
            self.assertGreater(int(request.url.params["_"]), 0)
            self.assertEqual(request.headers["Cache-Control"], "no-cache")
            return httpx.Response(status, text=html)

        client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
        with patch("bot.httpx.AsyncClient", return_value=client):
            return await bot.fetch_usdt_rub_rate()

    async def test_fresh_converter_quote_uses_both_rates(self):
        rate = await self.fetch_from_page(self.make_page({"dynamic-route-id": self.make_route()}))
        self.assertEqual(rate, Decimal("83.479704"))
        self.assertNotEqual(rate, Decimal("83.58"))

    async def test_page_quote_with_provider_delay_is_accepted(self):
        route = self.make_route()
        route["coin"]["quote"]["USD"]["last_updated"] = (
            datetime.now(timezone.utc) - timedelta(minutes=10)
        ).isoformat()
        self.assertEqual(await self.fetch_from_page(self.make_page({"a": route})), Decimal("83.479704"))

    async def test_other_coins_and_currencies_are_not_used(self):
        other_coin = self.make_route()
        other_coin["coin"]["symbol"] = "BTC"
        other_fiat = self.make_route()
        other_fiat["paramCurrency"] = "USD"
        routes = {"unrelated": other_coin, "usd": other_fiat, "rub": self.make_route()}
        self.assertEqual(await self.fetch_from_page(self.make_page(routes)), Decimal("83.479704"))

    async def test_missing_or_ambiguous_pair_is_rejected(self):
        pages = [
            self.make_page({}),
            self.make_page({"a": self.make_route(), "b": self.make_route()}),
            '<script id="__APP_DATA">[]</script>',
            '<script id="__APP_DATA">{}</script>',
            '<script id="__APP_DATA">invalid json</script>',
            '<html>Access denied</html>',
            self.make_page({"a": self.make_route()}) * 2,
        ]
        for page in pages:
            with self.subTest(page=page[:100]):
                with self.assertRaises(ValueError):
                    await self.fetch_from_page(page)

    async def test_wrong_currency_or_conversion_mode_is_rejected(self):
        for section, field, value in (
            ("currencyData", "value", "EUR"), ("currencyData", "pair", "USD_RUB"),
            ("coin", "slug", "usd-coin"), (None, "c2cConvertPriceEnabled", True),
        ):
            with self.subTest(field=field):
                route = self.make_route()
                (route if section is None else route[section])[field] = value
                with self.assertRaises(ValueError):
                    await self.fetch_from_page(self.make_page({"a": route}))

    async def test_invalid_prices_are_rejected(self):
        for field in ("usd_price", "fiat_rate"):
            for value in (None, True, [], 0, -1, "NaN", "Infinity", "bad"):
                with self.subTest(field=field, value=value):
                    route = self.make_route()
                    if field == "usd_price":
                        route["coin"]["quote"]["USD"]["price"] = value
                    else:
                        route["currencyData"]["rate"] = value
                    with self.assertRaises((ValueError, InvalidOperation)):
                        await self.fetch_from_page(self.make_page({"a": route}))

    async def test_stale_missing_and_future_timestamps_are_rejected(self):
        now = datetime.now(timezone.utc)
        timestamps = (None, True, "today", now.replace(tzinfo=None).isoformat(),
                      (now - timedelta(seconds=901)).isoformat(),
                      (now + timedelta(seconds=120)).isoformat())
        for timestamp in timestamps:
            with self.subTest(timestamp=timestamp):
                route = self.make_route()
                route["coin"]["quote"]["USD"]["last_updated"] = timestamp
                with self.assertRaises(ValueError):
                    await self.fetch_from_page(self.make_page({"a": route}))

    async def test_rate_limit_and_server_failure(self):
        for status in (403, 429, 500):
            with self.subTest(status=status):
                with self.assertRaises(httpx.HTTPStatusError):
                    await self.fetch_from_page("Unavailable", status=status)

    async def test_request_timeout(self):
        def timeout(request):
            raise httpx.ReadTimeout("Test timeout", request=request)
        client = httpx.AsyncClient(transport=httpx.MockTransport(timeout))
        with patch("bot.httpx.AsyncClient", return_value=client):
            with self.assertRaises(httpx.ReadTimeout):
                await bot.fetch_usdt_rub_rate()


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
                ("change", "Сколько BTC нужно за сумму в рублях"),
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
        self.assertIs(echo_handler.callback, bot.handle_text)
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
