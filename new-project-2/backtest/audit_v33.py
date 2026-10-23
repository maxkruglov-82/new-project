import json,csv,hashlib,math
from pathlib import Path
from datetime import datetime
root=Path(__file__).resolve().parents[1];source=root/'sol_short_setup.pine';ts=lambda s:int(datetime.fromisoformat(s).timestamp())
for label,rawp in [('six-months',root/'drafts/bag-ab-2026-10-23/candles-six-months.json'),('60-days',root/'reports/mexc-sol-usdt-m5-2026-08-23_2026-10-22.json')]:
 p=root/'reports';base=p/('backtest-v33-'+label+'-2026-10-23');r=json.loads(base.with_suffix('.json').read_text());raw=json.loads(rawp.read_text());cs=raw['candles'];ix={c['time']:i for i,c in enumerate(cs)};end=ts(raw['endExclusive'])
 assert r['sourceSha256']==hashlib.sha256(source.read_bytes()).hexdigest()
 assert r['inputSha256']==hashlib.sha256(rawp.read_bytes()).hexdigest()
 assert all(c['time']==cs[0]['time']+i*300 for i,c in enumerate(cs))
 for d in r['days']:
  h=ts(d['referenceClose']);hour=[cs[ix[h-3600]+j] for j in range(12)];assert d['high']==max(c['high'] for c in hour) and d['low']==min(c['low'] for c in hour);assert datetime.fromisoformat(d['date']).weekday()<5
 for t in r['trades']:
  i=ix[ts(t['entryBarStart'])];c=cs[i];assert c['low']<=t['entry']<=c['high'];assert datetime.fromisoformat(t['entryBarStart']).weekday()<5
  assert t['entryBarStart'][:10]==t['referenceDate'] and t['entryBarStart'][11:16]>='15:05'
  assert math.isclose(t['entry'],(t['fiboStop']+t['swingTarget'])/2,abs_tol=1e-9)
  assert math.isclose(t['stop']-t['fiboStop'],0.03 if t['side']=='SHORT' else -0.03,abs_tol=1e-9)
  assert math.isclose(t['target']-t['swingTarget'],0.03 if t['side']=='SHORT' else -0.03,abs_tol=1e-9)
  expiry=ts(t['referenceDate']+'T15:00:00+07:00')+86400;status='unresolved_at_end' if end<expiry else 'unresolved_at_new_h1';out=None
  for c in cs[i+1:]:
   if c['time']>=min(expiry,end):break
   sl=c['high']>=t['stop'] if t['side']=='SHORT' else c['low']<=t['stop'];tp=c['low']<=t['target'] if t['side']=='SHORT' else c['high']>=t['target']
   if sl or tp:status='ambiguous' if sl and tp else 'stop' if sl else 'target';out=c['time'];break
  assert status==t['status'],(label,t['id'],status,t['status'])
  if out is not None:assert ts(t['exitBarStart'])==out
  if status=='target':assert math.isclose(t['r'],abs(t['target']-t['entry'])/abs(t['stop']-t['entry']))
  if status=='stop':assert t['r']==-1
 for suffix,key in [('-trades.csv','trades'),('-days.csv','days')]:
  with (p/(base.name+suffix)).open(encoding='utf-8-sig') as f:assert len(list(csv.reader(f)))-1==len(r[key])
 months=[]
 for m in range(4,11):
  month=f'2026-{m:02}';tt=[t for t in r['trades'] if t['entryBarStart'].startswith(month)];w=sum(t['status']=='target' for t in tt);l=sum(t['status']=='stop' for t in tt);n=w+l
  months.append(dict(month=month,closed=n,targets=w,stops=l,win_rate=round(100*w/n,2) if n else None))
 assert sum(x['closed'] for x in months)==r['summary']['totalTrades']
 (p/('audit-v33-'+label+'-2026-10-23.json')).write_text(json.dumps(dict(audit='PASS',candles=len(cs),summary=r['summary'],monthly=months,sourceSha256=r['sourceSha256'],inputSha256=r['inputSha256']),ensure_ascii=False,indent=2))
 print(label,'PASS',r['summary'])
