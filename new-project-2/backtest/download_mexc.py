#!/usr/bin/env python3
"""Download public MEXC futures candles; no account/API key is required."""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
from pathlib import Path
import time
import urllib.parse
import urllib.request

BASE = 'https://api.mexc.com/api/v1/contract/kline/'


def download(symbol, interval, start, end):
    query = urllib.parse.urlencode({'interval': interval, 'start': start, 'end': end - 1})
    url = BASE + symbol + '?' + query
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                result = json.load(response)
            if result.get('success') is not True or result.get('code') != 0:
                raise ValueError(f'MEXC error: {result}')
            data = result['data']
            fields = ['time', 'open', 'high', 'low', 'close', 'vol']
            if len({len(data[key]) for key in fields}) != 1:
                raise ValueError('Different lengths of candle arrays')
            return url, [dict(zip(fields, values)) for values in zip(*(data[k] for k in fields))]
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def validate(candles, start, end, step):
    by_time = {}
    for bar in candles:
        stamp = int(bar['time'])
        if not start <= stamp < end:
            raise ValueError(f'Out-of-range candle: {stamp}')
        if stamp in by_time and by_time[stamp] != bar:
            raise ValueError(f'Conflicting duplicate: {stamp}')
        o, h, l, c = (float(bar[k]) for k in ['open', 'high', 'low', 'close'])
        if not 0 < l <= min(o, c) <= max(o, c) <= h:
            raise ValueError(f'Invalid OHLC: {bar}')
        by_time[stamp] = bar
    expected = set(range(start, end, step))
    if set(by_time) != expected:
        raise ValueError(f'Incomplete data: missing={len(expected - set(by_time))}, extra={len(set(by_time) - expected)}')
    return [by_time[t] for t in sorted(by_time)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', required=True, help='ISO date with timezone, inclusive')
    parser.add_argument('--end', required=True, help='ISO date with timezone, exclusive')
    parser.add_argument('--symbol', default='SOL_USDT')
    parser.add_argument('--interval', choices=['Min1', 'Min5'], default='Min5')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    start, end = [int(dt.datetime.fromisoformat(v).timestamp()) for v in [args.start, args.end]]
    step = 60 if args.interval == 'Min1' else 300
    if start % step or end % step or end <= start:
        raise ValueError('Time boundaries must align with the candle interval')
    chunks = [(s, min(s + step * 1500, end)) for s in range(start, end, step * 1500)]
    candles, urls = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(download, args.symbol, args.interval, *chunk) for chunk in chunks]
        for future in futures:
            url, bars = future.result()
            urls.append(url)
            candles.extend(bars)
    candles = validate(candles, start, end, step)
    result = {
        'exchange': 'MEXC', 'market': 'USDT perpetual futures', 'symbol': args.symbol,
        'interval': args.interval, 'start': args.start, 'endExclusive': args.end,
        'downloadedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'urls': urls,
        'count': len(candles), 'candles': candles,
    }
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    print(json.dumps({'output': str(target), 'candles': len(candles), 'missing': 0, 'sha256': digest}))


if __name__ == '__main__':
    main()
