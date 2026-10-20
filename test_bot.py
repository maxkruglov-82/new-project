"""Проверки без настоящего токена и без запросов к Telegram."""

import asyncio
import json
import os
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import httpx
from telegram import Chat, MenuButtonCommands, Message, MessageEntity, Update, User
from telegram.ext import CommandHandler, MessageHandler

import bot


OFFLINE_TOKEN = "123456:OFFLINE_TEST_TOKEN"


def make_usdt_quote(rate="100", age_seconds=0):
    return bot.UsdtRubQuote(
        rate=Decimal(rate),
        updated_at=datetime.now(timezone.utc) - timedelta(seconds=age_seconds),
    )


def make_binance_route():
    return {
        "coin": {
            "symbol": "USDT", "slug": "tether",
            "quote": {"USD": {"price": 0.9988, "last_updated": datetime.now(timezone.utc).isoformat()}},
        },
        "paramCurrency": "RUB",
        "currencyData": {"value": "RUB", "pair": "RUB_USD", "rate": 83.58},
        "c2cConvertPriceEnabled": False,
    }


def make_binance_page(routes):
    data = {"appState": {"loader": {"dataByRouteId": routes}}}
    return '<html><script type="application/json" id="__APP_DATA">' + json.dumps(data) + '</script></html>'


def make_rapira_payload(price="87.3"):
    # Поля публичного /market/symbol-thumb, проверены по странице Rapira 18.10.2026.
    return [{"symbol": "USDT/RUB", "baseCurrency": "RUB", "quoteCurrency": "USDT", "close": price}]


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
        self.assertIn("/sergey", text)
        self.assertIn("Rapira", text)
        self.assertNotIn("вручную", text)
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
        for callback in (bot.start, bot.help_command, bot.price_command, bot.change_command, bot.sergey_command, bot.misha_command, bot.handle_sergey_text, bot.handle_misha_text, bot.handle_text, bot.echo):
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
        self.assertEqual(
            text,
            "Для суммы 100 000 руб необходимо 0.021700 btc "
            "(курс USDT: 100.0000 руб — Binance; курс BTC: 50 000.00 USDT — MEXC).",
        )

    async def test_result_keeps_kopecks_and_rounds_btc_up_to_six_places(self):
        self.context.user_data["change_waiting_amount"] = True
        self.message.text = "100 000,50"
        with patch("bot.fetch_usdt_rub_quote", new=AsyncMock(return_value=make_usdt_quote())):
            with patch("bot.fetch_btc_price", new=AsyncMock(return_value=Decimal("90000"))):
                await bot.handle_text(self.update, self.context)
        self.assertEqual(
            self.message.reply_text.await_args.args[0],
            "Для суммы 100 000,50 руб необходимо 0.012056 btc "
            "(курс USDT: 100.0000 руб — Binance; курс BTC: 90 000.00 USDT — MEXC).",
        )

    async def test_api_failure_preserves_input_and_allows_retry(self):
        self.context.user_data["change_waiting_amount"] = True
        with patch("bot.fetch_usdt_rub_quote", new=AsyncMock(side_effect=httpx.ReadTimeout("Test timeout"))):
            with patch("bot.fetch_btc_price", new=AsyncMock(return_value=Decimal("50000"))):
                await bot.handle_text(self.update, self.context)
        self.assertTrue(self.context.user_data["change_waiting_amount"])
        self.assertEqual(self.context.user_data["change_amount_rub"], Decimal("100000"))
        text = self.message.reply_text.await_args.args[0]
        self.assertIn("Не удалось получить свежие курсы", text)
        self.assertIn("Binance (USDT/RUB)", text)
        self.assertNotIn("MEXC", text)
        self.assertNotIn("необходимо", text)
        self.message.reply_text.reset_mock()
        with patch("bot.fetch_usdt_rub_quote", new=AsyncMock(return_value=make_usdt_quote())):
            with patch("bot.fetch_btc_price", new=AsyncMock(return_value=Decimal("50000"))):
                await bot.handle_text(self.update, self.context)
        self.assertNotIn("change_waiting_amount", self.context.user_data)
        self.assertIn("необходимо 0.021700 btc", self.message.reply_text.await_args.args[0])

    async def test_mexc_failure_does_not_return_a_calculation(self):
        self.context.user_data["change_waiting_amount"] = True
        with patch("bot.fetch_usdt_rub_quote", new=AsyncMock(return_value=make_usdt_quote())):
            with patch("bot.fetch_btc_price", new=AsyncMock(side_effect=ValueError("Bad quote"))):
                await bot.handle_text(self.update, self.context)
        self.assertTrue(self.context.user_data["change_waiting_amount"])
        self.assertIn("Не удалось получить свежие курсы", self.message.reply_text.await_args.args[0])
        self.assertIn("MEXC (BTC/USDT)", self.message.reply_text.await_args.args[0])
        self.assertNotIn("Binance", self.message.reply_text.await_args.args[0])

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
        self.assertIn(f"котировка Binance: {local_time}", text)
        self.assertIn("10 мин. назад", text)
        self.assertIn("необходимо 0.021700 btc", text)
        self.assertNotIn("\n", text)

    async def test_start_cancels_amount_input(self):
        self.context.user_data["change_waiting_amount"] = True
        await bot.start(self.update, self.context)
        self.assertNotIn("change_waiting_amount", self.context.user_data)
        self.message.reply_text.assert_awaited_once_with("Привет, Макс, я твой бот.")

    async def test_quote_that_expired_while_waiting_for_other_source_is_not_used(self):
        self.context.user_data["change_waiting_amount"] = True
        with patch("bot.fetch_usdt_rub_quote", new=AsyncMock(return_value=make_usdt_quote(age_seconds=901))):
            with patch("bot.fetch_btc_price", new=AsyncMock(return_value=Decimal("50000"))):
                await bot.handle_text(self.update, self.context)
        text = self.message.reply_text.await_args.args[0]
        self.assertIn("Binance (USDT/RUB)", text)
        self.assertNotIn("необходимо", text)
        self.assertTrue(self.context.user_data["change_waiting_amount"])

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


class SergeyConversationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.context = SimpleNamespace(user_data={})
        self.message = SimpleNamespace(text="100 тысяч", reply_text=AsyncMock())
        self.update = SimpleNamespace(message=self.message)
        rapira = patch("bot.fetch_rapira_usdt_rub_rate", new=AsyncMock(return_value=Decimal("87.3")))
        self.rapira = rapira.start()
        self.addCleanup(rapira.stop)
        for name in ("fetch_usdt_rub_quote", "fetch_btc_price"):
            provider = patch("bot." + name, new=AsyncMock(side_effect=AssertionError("Другой источник запрещён")))
            provider.start()
            self.addCleanup(provider.stop)

    async def enter_amount(self, text="100 тысяч"):
        await bot.sergey_command(self.update, self.context)
        self.message.text = text
        await bot.handle_text(self.update, self.context)

    async def test_command_cancels_btc_input_and_requests_rubles(self):
        self.context.user_data.update(change_waiting_amount=True, change_amount_rub=Decimal("50000"))
        await bot.sergey_command(self.update, self.context)
        self.assertNotIn("change_waiting_amount", self.context.user_data)
        self.assertNotIn("change_amount_rub", self.context.user_data)
        self.assertEqual(self.context.user_data["sergey_stage"], "amount")
        self.assertIn("Введи сумму в рублях", self.message.reply_text.await_args.args[0])
        self.assertIn("автоматически", self.message.reply_text.await_args.args[0])
        self.rapira.assert_not_awaited()

    async def test_amount_fetches_rapira_rate_and_returns_result_immediately(self):
        await self.enter_amount()
        self.rapira.assert_awaited_once()
        self.assertNotIn("sergey_stage", self.context.user_data)
        self.assertEqual(self.message.reply_text.await_count, 2)
        text = self.message.reply_text.await_args.args[0]
        self.assertIn("1139.776489 USDT", text)
        self.assertNotIn("вручную", text)
        self.assertIn("0,5%", text)

    async def test_user_example_calculates_and_clears_state_without_using_other_sources(self):
        await self.enter_amount()
        self.assertEqual(
            self.message.reply_text.await_args.args[0],
            "Для суммы 100 000 руб получается 1139.776489 USDT "
            "(курс Rapira: 87.3 руб; с 0,5%: 87.7365 руб).",
        )
        self.assertNotIn("sergey_stage", self.context.user_data)
        self.assertNotIn("sergey_amount_rub", self.context.user_data)
        self.rapira.assert_awaited_once()
        self.message.text = "Привет"
        await bot.handle_text(self.update, self.context)
        self.assertEqual(self.message.reply_text.await_args.args[0], "Ты написал: Привет")

    async def test_invalid_rubles_keep_amount_stage(self):
        await bot.sergey_command(self.update, self.context)
        self.message.text = "не число"
        await bot.handle_text(self.update, self.context)
        self.assertEqual(self.context.user_data["sergey_stage"], "amount")
        self.assertNotIn("sergey_amount_rub", self.context.user_data)
        self.rapira.assert_not_awaited()

    async def test_rapira_failure_preserves_amount_for_retry_without_other_sources(self):
        for error in (httpx.ReadTimeout("Timeout"), httpx.ProxyError("Forbidden"), ValueError("Bad data")):
            with self.subTest(error=type(error).__name__):
                self.rapira.side_effect = error
                await self.enter_amount()
                self.assertEqual(self.context.user_data["sergey_stage"], "amount")
                self.assertEqual(self.context.user_data["sergey_amount_rub"], Decimal("100000"))
                text = self.message.reply_text.await_args.args[0]
                self.assertIn("Не удалось получить текущий курс Rapira", text)
                self.assertNotIn("получается", text)
                self.assertNotIn("вручную", text)
        self.rapira.side_effect = None
        self.message.text = "100000"
        await bot.handle_text(self.update, self.context)
        self.assertIn("1139.776489 USDT", self.message.reply_text.await_args.args[0])
        self.assertNotIn("sergey_stage", self.context.user_data)

    async def test_start_cancels_both_stages(self):
        for stage in ("amount", "rate"):
            with self.subTest(stage=stage):
                self.context.user_data.update(sergey_stage=stage, sergey_amount_rub=Decimal("100000"))
                await bot.start(self.update, self.context)
                self.assertNotIn("sergey_stage", self.context.user_data)
                self.assertNotIn("sergey_amount_rub", self.context.user_data)
                self.message.text = "87.3"
                await bot.handle_text(self.update, self.context)
                self.assertEqual(self.message.reply_text.await_args.args[0], "Ты написал: 87.3")

    async def test_change_switches_back_to_btc_input(self):
        await bot.sergey_command(self.update, self.context)
        self.context.user_data["sergey_amount_rub"] = Decimal("100000")
        await bot.change_command(self.update, self.context)
        self.assertNotIn("sergey_stage", self.context.user_data)
        self.assertNotIn("sergey_amount_rub", self.context.user_data)
        self.assertTrue(self.context.user_data["change_waiting_amount"])

    async def test_reopening_sergey_discards_previous_amount(self):
        self.context.user_data.update(sergey_stage="amount", sergey_amount_rub=Decimal("100000"))
        await bot.sergey_command(self.update, self.context)
        self.assertEqual(self.context.user_data["sergey_stage"], "amount")
        self.assertNotIn("sergey_amount_rub", self.context.user_data)

    async def test_users_have_independent_amounts(self):
        await bot.sergey_command(self.update, self.context)
        other = SimpleNamespace(user_data={})
        await bot.sergey_command(self.update, other)
        self.message.text = "100000"
        await bot.handle_text(self.update, self.context)
        self.assertIn("Для суммы 100 000 руб", self.message.reply_text.await_args.args[0])
        self.assertEqual(other.user_data["sergey_stage"], "amount")
        self.message.text = "50000"
        await bot.handle_text(self.update, other)
        self.assertIn("Для суммы 50 000 руб", self.message.reply_text.await_args.args[0])
        self.assertIn("569.888244 USDT", self.message.reply_text.await_args.args[0])

    async def test_unrepresentable_amount_does_not_crash_or_keep_invalid_calculation(self):
        await self.enter_amount("9" * 100)
        self.assertEqual(self.context.user_data["sergey_stage"], "amount")
        self.assertNotIn("sergey_amount_rub", self.context.user_data)
        self.assertIn("другую сумму", self.message.reply_text.await_args.args[0])


class SergeyCalculationTests(unittest.TestCase):
    def test_half_percent_is_added_to_rate_before_dividing_rubles(self):
        for rubles, rate, expected in (
            ("100000", "100", "995.024875"),
            ("100000", "80", "1243.781094"),
            ("100000", "87.3", "1139.776489"),
            ("200000", "80", "2487.562189"),
            ("0.01", "100", "0.000099"),
        ):
            with self.subTest(rubles=rubles, rate=rate):
                self.assertEqual(
                    bot.calculate_sergey_usdt_amount(Decimal(rubles), Decimal(rate)),
                    Decimal(expected),
                )

    def test_invalid_amount_or_rate_is_rejected(self):
        for invalid in ("0", "-1", "NaN", "Infinity"):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    bot.calculate_sergey_usdt_amount(Decimal(invalid), Decimal("100"))
                with self.assertRaises(ValueError):
                    bot.calculate_sergey_usdt_amount(Decimal("100000"), Decimal(invalid))


class RapiraSourceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.client_class = httpx.AsyncClient
        sleeper = patch("bot.asyncio.sleep", new_callable=AsyncMock)
        self.sleep = sleeper.start()
        self.addCleanup(sleeper.stop)
        warning = patch("bot.logger.warning")
        warning.start()
        self.addCleanup(warning.stop)

    async def fetch(self, payload=None, *, raw=None):
        def respond(request):
            self.assertEqual(request.url.host, "api.rapira.net")
            self.assertEqual(request.url.path, "/market/symbol-thumb")
            self.assertGreater(int(request.url.params["_"]), 0)
            self.assertEqual(request.headers["Cache-Control"], "no-cache")
            return httpx.Response(200, text=raw) if raw is not None else httpx.Response(200, json=payload)
        client = self.client_class(transport=httpx.MockTransport(respond))
        with patch("bot.httpx.AsyncClient", return_value=client):
            return await bot.fetch_rapira_usdt_rub_rate()

    async def test_uses_page_close_price_for_the_exact_currency_pair(self):
        data = make_rapira_payload()
        data[0].update(usdRate=1, askPrice=90, bidPrice=80)
        data.insert(0, {"symbol": "BTC/USDT", "close": "82000"})
        self.assertEqual(await self.fetch(data), Decimal("87.3"))

    async def test_numeric_json_price_preserves_decimal_precision(self):
        raw = '[{"symbol":"USDT/RUB","baseCurrency":"RUB","quoteCurrency":"USDT","close":87.123456789012345678}]'
        self.assertEqual(await self.fetch(raw=raw), Decimal("87.123456789012345678"))

    async def test_missing_duplicate_and_reversed_pairs_are_rejected(self):
        reversed_pair = make_rapira_payload()
        reversed_pair[0]["symbol"] = "RUB/USDT"
        for data in (None, {}, [], reversed_pair, make_rapira_payload() * 2):
            with self.subTest(data=data):
                with self.assertRaises(ValueError):
                    await self.fetch(data)

    async def test_wrong_currency_metadata_is_rejected(self):
        for key, value in (("baseCurrency", "USDT"), ("quoteCurrency", "USD")):
            with self.subTest(field=key):
                data = make_rapira_payload()
                data[0][key] = value
                with self.assertRaises(ValueError):
                    await self.fetch(data)

    async def test_missing_or_invalid_close_never_falls_back_to_other_fields(self):
        for price in (None, True, [], {}, "0", "-1", "NaN", "Infinity", "bad"):
            with self.subTest(price=price):
                data = make_rapira_payload(price)
                data[0].update(askPrice=87.3, usdRate=1)
                with self.assertRaises((ValueError, InvalidOperation)):
                    await self.fetch(data)
        data = make_rapira_payload()
        del data[0]["close"]
        with self.assertRaises(ValueError):
            await self.fetch(data)

    async def test_change_recovers_after_two_failures_without_requesting_manual_rate(self):
        requests = []
        def respond(request):
            requests.append(request)
            self.assertEqual(request.url.host, "api.rapira.net")
            if len(requests) == 1:
                return httpx.Response(503)
            if len(requests) == 2:
                return httpx.Response(200, text="temporary unavailable")
            return httpx.Response(200, json=make_rapira_payload())
        client = self.client_class(transport=httpx.MockTransport(respond))
        message = SimpleNamespace(text="100000", reply_text=AsyncMock())
        update = SimpleNamespace(message=message)
        context = SimpleNamespace(user_data={})
        await bot.sergey_command(update, context)
        with patch("bot.httpx.AsyncClient", return_value=client), patch("bot.time_ns", side_effect=(101, 102, 103)):
            await bot.handle_text(update, context)
        self.assertEqual(message.reply_text.await_count, 2)
        self.assertIn("1139.776489 USDT", message.reply_text.await_args.args[0])
        self.assertNotIn("вручную", message.reply_text.await_args.args[0])
        self.assertEqual([r.url.params["_"] for r in requests], ["101", "102", "103"])
        self.assertEqual(self.sleep.await_count, 2)

    async def test_request_failure_has_bounded_retries(self):
        for status, expected_attempts in ((403, 1), (429, 3), (503, 3)):
            with self.subTest(status=status):
                requests = []
                def respond(request):
                    requests.append(request)
                    return httpx.Response(status)
                client = self.client_class(transport=httpx.MockTransport(respond))
                with patch("bot.httpx.AsyncClient", return_value=client):
                    with self.assertRaises(httpx.HTTPStatusError):
                        await bot.fetch_rapira_usdt_rub_rate()
                self.assertEqual(len(requests), expected_attempts)

    async def test_each_calculation_fetches_a_new_rate(self):
        requests = []
        def respond(request):
            requests.append(request)
            return httpx.Response(200, json=make_rapira_payload("87.3" if len(requests) == 1 else "88"))
        def client_factory(**kwargs):
            return self.client_class(transport=httpx.MockTransport(respond), **kwargs)
        with patch("bot.httpx.AsyncClient", side_effect=client_factory):
            first = await bot.fetch_rapira_usdt_rub_rate()
            second = await bot.fetch_rapira_usdt_rub_rate()
        self.assertEqual((first, second), (Decimal("87.3"), Decimal("88")))
        self.assertEqual(len(requests), 2)
        self.assertNotEqual(requests[0].url.params["_"], requests[1].url.params["_"])


class BinancePageTests(unittest.IsolatedAsyncioTestCase):
    make_route = staticmethod(make_binance_route)
    make_page = staticmethod(make_binance_page)

    def setUp(self):
        sleeper = patch("bot.asyncio.sleep", new_callable=AsyncMock)
        sleeper.start()
        self.addCleanup(sleeper.stop)
        warning = patch("bot.logger.warning")
        warning.start()
        self.addCleanup(warning.stop)

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


class QuoteRecoveryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        sleeper = patch("bot.asyncio.sleep", new_callable=AsyncMock)
        self.sleep = sleeper.start()
        self.addCleanup(sleeper.stop)
        warning = patch("bot.logger.warning")
        self.warning = warning.start()
        self.addCleanup(warning.stop)
        self.client_class = httpx.AsyncClient

    def clients(self, respond):
        def factory(**kwargs):
            return self.client_class(transport=httpx.MockTransport(respond), **kwargs)
        return patch("bot.httpx.AsyncClient", side_effect=factory)

    async def test_change_recovers_on_third_binance_attempt_without_resending_amount(self):
        requests = {"www.binance.com": [], "api.mexc.com": []}
        route = make_binance_route()
        route["coin"]["quote"]["USD"]["price"] = 1
        route["currencyData"]["rate"] = 100
        stale = make_binance_route()
        stale["coin"]["quote"]["USD"]["last_updated"] = (
            datetime.now(timezone.utc) - timedelta(minutes=20)
        ).isoformat()

        def respond(request):
            calls = requests[request.url.host]
            calls.append(request)
            if request.url.host == "api.mexc.com":
                return httpx.Response(200, json={"symbol": "BTCUSDT", "price": "50000"})
            if len(calls) == 1:
                raise httpx.ReadTimeout("Temporary timeout", request=request)
            if len(calls) == 2:
                return httpx.Response(200, text=make_binance_page({"r": stale}))
            return httpx.Response(200, text=make_binance_page({"r": route}))

        context = SimpleNamespace(user_data={})
        message = SimpleNamespace(text="100000", reply_text=AsyncMock())
        update = SimpleNamespace(message=message)
        await bot.change_command(update, context)
        with self.clients(respond), patch("bot.time_ns", side_effect=(101, 102, 103)):
            await bot.handle_text(update, context)
        self.assertEqual(message.reply_text.await_count, 2)  # Приглашение и готовый расчёт.
        text = message.reply_text.await_args.args[0]
        self.assertIn("необходимо 0.021700 btc", text)
        self.assertNotIn("Не удалось", text)
        self.assertNotIn("change_waiting_amount", context.user_data)
        self.assertEqual(len(requests["www.binance.com"]), 3)
        self.assertEqual(len(requests["api.mexc.com"]), 1)
        self.assertEqual([r.url.params["_"] for r in requests["www.binance.com"]], ["101", "102", "103"])
        self.assertEqual([c.args[0] for c in self.sleep.await_args_list], [0.5, 1.0])

    async def test_mexc_recovers_after_503_and_timeout(self):
        calls = []
        def respond(request):
            calls.append(request)
            if len(calls) == 1:
                return httpx.Response(503)
            if len(calls) == 2:
                raise httpx.ReadTimeout("Temporary timeout", request=request)
            return httpx.Response(200, json={"symbol": "BTCUSDT", "price": "82000"})
        with self.clients(respond):
            self.assertEqual(await bot.fetch_btc_price(), Decimal("82000"))
        self.assertEqual(len(calls), 3)
        self.assertEqual(self.sleep.await_count, 2)

    async def test_binance_recovers_after_empty_202_page(self):
        calls = []
        page = make_binance_page({"r": make_binance_route()})
        def respond(request):
            calls.append(request)
            return httpx.Response(202 if len(calls) == 1 else 200, text="" if len(calls) == 1 else page)
        with self.clients(respond):
            self.assertEqual(await bot.fetch_usdt_rub_rate(), Decimal("83.479704"))
        self.assertEqual(len(calls), 2)

    async def test_mexc_recovers_after_invalid_json_and_rate_limit(self):
        calls = []
        def respond(request):
            calls.append(request)
            if len(calls) == 1:
                return httpx.Response(200, text="temporarily unavailable")
            if len(calls) == 2:
                return httpx.Response(429)
            return httpx.Response(200, json={"symbol": "BTCUSDT", "price": "82000"})
        with self.clients(respond):
            self.assertEqual(await bot.fetch_btc_price(), Decimal("82000"))
        self.assertEqual(len(calls), 3)

    async def test_stale_binance_quote_is_rejected_after_all_attempts(self):
        route = make_binance_route()
        route["coin"]["quote"]["USD"]["last_updated"] = (
            datetime.now(timezone.utc) - timedelta(minutes=20)
        ).isoformat()
        calls = []
        def respond(request):
            calls.append(request)
            return httpx.Response(200, text=make_binance_page({"r": route}))
        with self.clients(respond):
            with self.assertRaises(bot.TemporaryQuoteError):
                await bot.fetch_usdt_rub_quote()
        self.assertEqual(len(calls), 3)

    async def test_mexc_failure_stops_after_three_attempts(self):
        calls = []
        def respond(request):
            calls.append(request)
            return httpx.Response(503)
        with self.clients(respond):
            with self.assertRaises(httpx.HTTPStatusError):
                await bot.fetch_btc_price()
        self.assertEqual(len(calls), 3)
        self.assertEqual(self.sleep.await_count, 2)

    async def test_permanent_403_is_not_retried(self):
        for fetch in (bot.fetch_btc_price, bot.fetch_usdt_rub_quote):
            with self.subTest(source=fetch.__name__):
                calls = []
                self.sleep.reset_mock()
                def respond(request):
                    calls.append(request)
                    return httpx.Response(403)
                with self.clients(respond):
                    with self.assertRaises(httpx.HTTPStatusError):
                        await fetch()
                self.assertEqual(len(calls), 1)
                self.sleep.assert_not_awaited()

    async def test_overall_budget_cancels_a_hanging_request(self):
        cancelled = asyncio.Event()
        async def respond(request):
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        with self.clients(respond), patch("bot.QUOTE_FETCH_BUDGET_SECONDS", 0.05):
            with self.assertRaises(httpx.ReadTimeout):
                await bot.fetch_usdt_rub_quote()
        self.assertTrue(cancelled.is_set())


class MenuTests(unittest.IsolatedAsyncioTestCase):
    async def test_menu_registers_all_commands_and_commands_button(self):
        telegram_bot = SimpleNamespace(
            set_my_commands=AsyncMock(), set_chat_menu_button=AsyncMock(),
            delete_my_commands=AsyncMock(),
        )
        await bot.setup_menu(SimpleNamespace(bot=telegram_bot, bot_data={"allowed_user_id": 12345}))
        telegram_bot.set_my_commands.assert_awaited_once()
        scope = telegram_bot.set_my_commands.await_args.kwargs["scope"]
        self.assertEqual(scope.type, "chat")
        self.assertEqual(scope.chat_id, 12345)
        commands = telegram_bot.set_my_commands.await_args.args[0]
        self.assertEqual(
            [(command.command, command.description) for command in commands],
            [
                ("start", "Приветствие"),
                ("help", "Список команд и помощь"),
                ("price", "Цена BTC/USDT на MEXC"),
                ("change", "BTC для Федерико Феллини"),
                ("sergey", "USDT для Сергея X"),
                ("misha", "USDT для Миши"),
            ],
        )
        self.assertEqual(telegram_bot.delete_my_commands.await_count, 12)
        deleted = {
            (call.kwargs["scope"].type, call.kwargs["language_code"])
            for call in telegram_bot.delete_my_commands.await_args_list
        }
        self.assertEqual(deleted, {
            (scope, language) for scope in
            ("default", "all_private_chats", "all_group_chats", "all_chat_administrators")
            for language in ("", "ru", "en")
        })
        self.assertEqual(telegram_bot.set_chat_menu_button.await_count, 2)
        public = telegram_bot.set_chat_menu_button.await_args_list[0].kwargs
        self.assertNotIn("chat_id", public)
        self.assertEqual(public["menu_button"].type, "default")
        self.assertEqual(telegram_bot.set_chat_menu_button.await_args.kwargs["chat_id"], 12345)
        button = telegram_bot.set_chat_menu_button.await_args.kwargs["menu_button"]
        self.assertIsInstance(button, MenuButtonCommands)

    async def test_unconfigured_owner_never_publishes_commands(self):
        telegram_bot = SimpleNamespace(
            set_my_commands=AsyncMock(), set_chat_menu_button=AsyncMock(),
            delete_my_commands=AsyncMock(),
        )
        await bot.setup_menu(SimpleNamespace(bot=telegram_bot, bot_data={}))
        telegram_bot.set_my_commands.assert_not_awaited()
        self.assertEqual(telegram_bot.delete_my_commands.await_count, 12)
        telegram_bot.set_chat_menu_button.assert_awaited_once()
        self.assertEqual(telegram_bot.set_chat_menu_button.await_args.kwargs["menu_button"].type, "default")


class PriceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        sleeper = patch("bot.asyncio.sleep", new_callable=AsyncMock)
        sleeper.start()
        self.addCleanup(sleeper.stop)
        warning = patch("bot.logger.warning")
        warning.start()
        self.addCleanup(warning.stop)

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
        start_handler, help_handler, price_handler, change_handler, sergey_handler, misha_handler, echo_handler = application.handlers[0]
        self.assertIsInstance(start_handler, CommandHandler)
        self.assertIsInstance(help_handler, CommandHandler)
        self.assertIsInstance(price_handler, CommandHandler)
        self.assertIsInstance(change_handler, CommandHandler)
        self.assertIsInstance(sergey_handler, CommandHandler)
        self.assertIsInstance(echo_handler, MessageHandler)
        self.assertIs(start_handler.callback, bot.start)
        self.assertIs(help_handler.callback, bot.help_command)
        self.assertIs(price_handler.callback, bot.price_command)
        self.assertIs(change_handler.callback, bot.change_command)
        self.assertIs(sergey_handler.callback, bot.sergey_command)
        self.assertIs(misha_handler.callback, bot.misha_command)
        self.assertIs(echo_handler.callback, bot.handle_text)
        for command, handler in (("/start", start_handler), ("/help", help_handler), ("/price", price_handler), ("/change", change_handler), ("/sergey", sergey_handler), ("/misha", misha_handler)):
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
        with patch.dict(os.environ, {"BOT_TOKEN": OFFLINE_TOKEN, "ALLOWED_USER_ID": "12345"}):
            with patch("bot.build_application") as build:
                bot.main()
                build.assert_called_once_with(OFFLINE_TOKEN, 12345)
                build.return_value.run_polling.assert_called_once_with()


class MishaTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.context = SimpleNamespace(user_data={})
        self.message = SimpleNamespace(text="1000", reply_text=AsyncMock())
        self.update = SimpleNamespace(message=self.message)

    def test_formula_rounds_to_nearest_whole_ruble(self):
        self.assertEqual(bot.calculate_misha_rub_amount(Decimal("1000"), Decimal("87.3")), Decimal("86689"))
        self.assertEqual(bot.calculate_misha_rub_amount(Decimal("1200"), Decimal("87.3")), Decimal("104027"))
        self.assertEqual(bot.calculate_misha_rub_amount(Decimal("1"), Decimal("499.999")), Decimal("496"))
        self.assertEqual(bot.calculate_misha_rub_amount(Decimal("1"), Decimal("500")), Decimal("497"))
        self.assertEqual(bot.calculate_misha_rub_amount(Decimal("1"), Decimal("500.001")), Decimal("497"))

    def test_invalid_calculation_inputs(self):
        for value in ("0", "-1", "NaN", "Infinity"):
            for args in ((Decimal(value), Decimal("87.3")), (Decimal("1000"), Decimal(value))):
                with self.subTest(args=args), self.assertRaises(ValueError):
                    bot.calculate_misha_rub_amount(*args)

    def test_usdt_parser(self):
        for text, expected in (("1000", "1000"), ("1 500,50", "1500.50"), ("1.123456 USDT", "1.123456")):
            self.assertEqual(bot.parse_usdt_amount(text), Decimal(expected))
        for text in ("0", "-1", "NaN", "Infinity", "1.1234567", "100 руб", "100 тысяч", "1e3", "abc"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                bot.parse_usdt_amount(text)

    async def test_single_input_uses_rapira_and_returns_rubles(self):
        await bot.misha_command(self.update, self.context)
        with patch("bot.fetch_rapira_usdt_rub_rate", new=AsyncMock(return_value=Decimal("87.3"))) as rapira:
            with patch("bot.fetch_btc_price", new=AsyncMock()) as mexc, patch("bot.fetch_usdt_rub_quote", new=AsyncMock()) as binance:
                await bot.handle_text(self.update, self.context)
        rapira.assert_awaited_once()
        mexc.assert_not_awaited()
        binance.assert_not_awaited()
        self.assertEqual(self.message.reply_text.await_args.args[0],
            "За 1000 USDT человек получит 86 689 руб (курс: 86,6889 руб/USDT).")
        self.assertNotIn("misha_waiting_amount", self.context.user_data)

    async def test_invalid_amount_does_not_fetch_and_allows_correction(self):
        await bot.misha_command(self.update, self.context)
        self.message.text = "100 рублей"
        with patch("bot.fetch_rapira_usdt_rub_rate", new=AsyncMock()) as rapira:
            await bot.handle_text(self.update, self.context)
        rapira.assert_not_awaited()
        self.assertTrue(self.context.user_data["misha_waiting_amount"])

    async def test_source_failure_then_retry(self):
        await bot.misha_command(self.update, self.context)
        with patch("bot.fetch_rapira_usdt_rub_rate", new=AsyncMock(side_effect=httpx.ReadTimeout("test"))):
            await bot.handle_text(self.update, self.context)
        self.assertIn("отправь сумму USDT", self.message.reply_text.await_args.args[0])
        self.assertTrue(self.context.user_data["misha_waiting_amount"])
        with patch("bot.fetch_rapira_usdt_rub_rate", new=AsyncMock(return_value=Decimal("87.3"))):
            await bot.handle_text(self.update, self.context)
        self.assertIn("86 689 руб", self.message.reply_text.await_args.args[0])
        self.assertNotIn("misha_waiting_amount", self.context.user_data)

    async def test_switching_modes_and_cancelling(self):
        for other in (bot.start, bot.change_command, bot.sergey_command):
            await bot.misha_command(self.update, self.context)
            await other(self.update, self.context)
            self.assertNotIn("misha_waiting_amount", self.context.user_data)
        for other in (bot.change_command, bot.sergey_command):
            await other(self.update, self.context)
            await bot.misha_command(self.update, self.context)
            self.assertTrue(self.context.user_data["misha_waiting_amount"])
            self.assertNotIn("change_waiting_amount", self.context.user_data)
            self.assertNotIn("sergey_stage", self.context.user_data)

    async def test_huge_amount_returns_error_without_losing_mode(self):
        await bot.misha_command(self.update, self.context)
        self.message.text = "9" * 40
        with patch("bot.fetch_rapira_usdt_rub_rate", new=AsyncMock(return_value=Decimal("87.3"))):
            await bot.handle_text(self.update, self.context)
        self.assertIn("Не удалось рассчитать", self.message.reply_text.await_args.args[0])
        self.assertTrue(self.context.user_data["misha_waiting_amount"])


class OwnerAccessTests(unittest.IsolatedAsyncioTestCase):
    async def run_update(self, sender, chat_id, chat_type="private", text="/start", owner=12345):
        application = bot.build_application(OFFLINE_TOKEN, owner)
        # Проверяем настоящий диспетчер PTB, заменив бизнес-обработчики.
        application.handlers[0].clear()
        callback = AsyncMock()
        application.add_handler(MessageHandler(bot.filters.ALL, callback))
        application._initialized = True
        message = Message(
            message_id=1, date=datetime.now(timezone.utc),
            chat=Chat(chat_id, chat_type), text=text,
            from_user=User(sender, "Test", False) if sender is not None else None,
        )
        update = Update(1, message=message)
        with patch("bot.fetch_rapira_usdt_rub_rate", new=AsyncMock()) as rapira:
            with patch("bot.fetch_btc_price", new=AsyncMock()) as mexc:
                await application.process_update(update)
        rapira.assert_not_awaited()
        mexc.assert_not_awaited()
        return callback

    async def test_owner_private_messages_pass_dispatcher(self):
        for text in ("/start", "/price", "/change", "/sergey", "/misha", "100000", "Привет"):
            with self.subTest(text=text):
                callback = await self.run_update(12345, 12345, text=text)
                callback.assert_awaited_once()

    async def test_other_accounts_are_silently_blocked_before_handlers(self):
        for text in ("/start", "/help", "/price", "/change", "/sergey", "/misha", "100000", "Привет"):
            with self.subTest(text=text):
                callback = await self.run_update(99999, 99999, text=text)
                callback.assert_not_awaited()

    async def test_owner_in_group_and_missing_or_mismatched_identity_are_blocked(self):
        for sender, chat_id, kind in ((12345, -100, "supergroup"), (12345, -10, "group"),
                                      (None, 12345, "private"), (99999, 12345, "private"),
                                      (12345, 99999, "private")):
            with self.subTest(sender=sender, chat=chat_id):
                callback = await self.run_update(sender, chat_id, kind)
                callback.assert_not_awaited()

    async def test_unconfigured_application_denies_everyone(self):
        callback = await self.run_update(12345, 12345, owner=None)
        callback.assert_not_awaited()

    def test_invalid_owner_setting_prevents_startup(self):
        for value in ("", "0", "-1", "1.5", "@max", "123 456"):
            with self.subTest(value=value), patch.dict(os.environ, {"BOT_TOKEN": OFFLINE_TOKEN, "ALLOWED_USER_ID": value}):
                with patch("bot.build_application") as build:
                    with self.assertRaisesRegex(SystemExit, "ALLOWED_USER_ID"):
                        bot.main()
                    build.assert_not_called()

    def test_build_rejects_invalid_ids(self):
        for value in (True, 0, -1, "12345"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                bot.build_application(OFFLINE_TOKEN, value)


if __name__ == "__main__":
    unittest.main()
