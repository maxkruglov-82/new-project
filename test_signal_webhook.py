import os
from io import BytesIO
import unittest
from unittest.mock import Mock, patch
import signal_webhook as signals


class SignalTests(unittest.TestCase):
    def test_owner_and_text_forwarded_without_parse_mode(self):
        post = Mock(return_value=Mock(json=lambda: {'ok': True}))
        text = 'ВХОД ИСПОЛНЕН — второе касание | SHORT | MEXC:SOLUSDT | M5 | Вход: $103.52 | Стоп: $104 | Тейк: $103.04 | RR 1:1'
        signals.deliver_signal('offline-token', 123, text, post)
        self.assertEqual(post.call_args.kwargs['json'], {'chat_id': 123, 'text': text})
        post.return_value.raise_for_status.assert_called_once()

    def test_invalid_message_not_sent(self):
        for text in ['plain external message', 'ВХОД ИСПОЛНЕН — ' + 'x' * 4096]:
            post = Mock()
            with self.assertRaises(ValueError):
                signals.deliver_signal('offline-token', 123, text, post)
            post.assert_not_called()

    def test_telegram_rejection_is_not_success(self):
        post = Mock(return_value=Mock(json=lambda: {'ok': False}))
        with self.assertRaises(ValueError):
            signals.deliver_signal('offline-token', 123, 'КАСАНИЕ ЗОНЫ — LONG', post)

    def test_webhook_rejects_wrong_secret_without_sending(self):
        handler = object.__new__(signals.handler_for('offline-token', 123, 'x'*32))
        handler.path = '/signals/wrong'
        handler.send_error = Mock()
        with patch.object(signals, 'deliver_signal') as send:
            handler.do_POST()
        handler.send_error.assert_called_once_with(403)
        send.assert_not_called()

    def test_webhook_delivers_only_to_configured_owner(self):
        handler = object.__new__(signals.handler_for('offline-token', 123, 'x'*32))
        handler.path = '/signals/' + 'x'*32
        text = 'КАСАНИЕ ЗОНЫ — LONG'
        body = text.encode()
        handler.headers = {'Content-Length': str(len(body))}
        handler.rfile = BytesIO(body)
        handler.wfile = BytesIO()
        handler.send_response = Mock()
        handler.send_header = Mock()
        handler.end_headers = Mock()
        with patch.object(signals, 'deliver_signal') as send:
            handler.do_POST()
        send.assert_called_once_with('offline-token', 123, text)
        handler.send_response.assert_called_once_with(200)
        self.assertEqual(handler.wfile.getvalue(), b'OK')

    def test_secrets_required(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ValueError):
                signals.load_config()
        with patch.dict(os.environ, {'BOT_TOKEN': 'offline-token', 'ALLOWED_USER_ID': '123', 'SIGNAL_WEBHOOK_SECRET': 'x'*32}, clear=True):
            self.assertEqual(signals.load_config()[1], 123)


if __name__ == '__main__':
    unittest.main()
