"""Assemble the downloaded MEXC inputs without changing published strategy code."""
import json,hashlib
from pathlib import Path
root=Path(__file__).resolve().parent.parent
out=root/'reports/backtest-2026-v12-e7f6d3f'
paths=[Path('/workspace/backtests/v12-e7f6d3f-2026/start.json'),Path('/workspace/backtests/v72-2026-current/mexc-sol-usdt-m5-2026-ytd.json'),Path('/workspace/backtests/v12-e7f6d3f-2026/end.json')]
bars={};sources=[]
for p in paths:
 raw=p.read_bytes();d=json.loads(raw);sources.append({'path':str(p),'sha256':hashlib.sha256(raw).hexdigest(),'start':d['start'],'endExclusive':d['endExclusive'],'count':len(d['candles'])})
 for x in d['candles']:
  t=x['time']
  if t in bars:assert bars[t]==x,('conflicting candles',t)
  bars[t]=x
candles=[bars[t] for t in sorted(bars)]
assert all(candles[i]['time']-candles[i-1]['time']==300 for i in range(1,len(candles)))
for b in candles:assert 0<b['low']<=min(b['open'],b['close'])<=max(b['open'],b['close'])<=b['high']
input_path=Path('/workspace/backtests/v12-e7f6d3f-2026/input.json')
input_path.write_text(json.dumps({'exchange':'MEXC','symbol':'SOL_USDT','interval':'Min5','sources':sources,'candles':candles},separators=(',',':'))+'\n')
(out/'provenance.json').write_text(json.dumps({'sourceCommit':'e7f6d3f','sourceSha256':hashlib.sha256((out/'indicator.txt').read_bytes()).hexdigest(),'inputPath':str(input_path),'inputSha256':hashlib.sha256(input_path.read_bytes()).hexdigest(),'sources':sources,'bars':len(candles),'missingCandles':0,'cutoff':'2026-10-31T15:10:00+07:00','knownIssue':'14 Oct: rejected countertrend triple remains at stage3; this published code is tested unchanged.','comparison':'V1.1 comparison deferred; use identical input and cutoff.'},indent=2)+'\n')
print('assembled',len(candles),'candles, gaps=0')
