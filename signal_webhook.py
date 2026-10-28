"""Приём текстовых alert() и доставка владельцу существующего Telegram-бота."""
import hmac
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx


def load_config():
    token = os.environ.get('BOT_TOKEN', '').strip()
    owner = os.environ.get('ALLOWED_USER_ID', '').strip()
    secret = os.environ.get('SIGNAL_WEBHOOK_SECRET', '').strip()
    if not token or not owner.isdecimal() or int(owner) <= 0 or len(secret) < 32:
        raise ValueError('Нужны BOT_TOKEN, положительный ALLOWED_USER_ID и SIGNAL_WEBHOOK_SECRET не короче 32 символов')
    if not secret.isascii() or not all(c.isalnum() or c in '-_' for c in secret):
        raise ValueError('SIGNAL_WEBHOOK_SECRET: только латинские буквы, цифры, - и _')
    return token, int(owner), secret


def deliver_signal(token, owner, text, post=httpx.post):
    # Адресат берётся только из конфигурации владельца, не из внешнего сообщения.
    if not text.startswith(('КАСАНИЕ ЗОНЫ — ', 'ВХОД ИСПОЛНЕН — ')) or len(text) > 4096:
        raise ValueError('Некорректный текст сигнала')
    response = post(f'https://api.telegram.org/bot{token}/sendMessage',
                    json={'chat_id': owner, 'text': text}, timeout=2.0)
    response.raise_for_status()
    if response.json().get('ok') is not True:
        raise ValueError('Telegram не подтвердил доставку')


def handler_for(token, owner, secret):
    class SignalHandler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            # Стандартный журнал HTTP раскрывает секрет в пути webhook.
            pass

        def do_POST(self):
            if not hmac.compare_digest(self.path.encode(), ('/signals/' + secret).encode()):
                self.send_error(403)
                return
            try:
                size = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                size = 0
            if not 0 < size <= 16384:
                self.send_error(413)
                return
            try:
                text = self.rfile.read(size).decode('utf-8').strip()
                deliver_signal(token, owner, text)
            except (UnicodeError, ValueError):
                self.send_error(400)
                return
            except httpx.HTTPError:
                self.send_error(502)
                return
            self.send_response(200)
            self.send_header('Content-Length', '2')
            self.end_headers()
            self.wfile.write(b'OK')
    return SignalHandler


def main():
    token, owner, secret = load_config()
    server = ThreadingHTTPServer((os.environ.get('SIGNAL_WEBHOOK_HOST', '127.0.0.1'),
                                  int(os.environ.get('SIGNAL_WEBHOOK_PORT', '8080'))),
                                 handler_for(token, owner, secret))
    server.serve_forever()


if __name__ == '__main__':
    main()
