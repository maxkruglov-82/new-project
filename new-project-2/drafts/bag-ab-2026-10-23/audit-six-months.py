import json,csv,hashlib,math
from pathlib import Path
from datetime import datetime
p=Path('new-project-2/drafts/bag-ab-2026-10-23');rawp=p/'candles-six-months.json';raw=json.loads(rawp.read_text());cs=raw['candles'];ix={c['time']:i for i,c in enumerate(cs)};ts=lambda s:int(datetime.fromisoformat(s).timestamp());end=ts(raw['endExclusive'])
assert len(cs)==52536 and all(c['time']==cs[0]['time']+i*300 for i,c in enumerate(cs))
summary=[];monthly=[]
for name in ['base','bag1','bag2','bag1-bag2']:
 base=p/('six-months-'+name);r=json.loads(base.with_suffix('.json').read_text())
 assert r['sourceSha256']==hashlib.sha256((p/(name+'.pine')).read_bytes()).hexdigest()
 assert r['inputSha256']==hashlib.sha256(rawp.read_bytes()).hexdigest()
 for d in r['days']:
  h=ts(d['referenceClose']);hour=[cs[ix[h-3600]+j] for j in range(12)];assert d['high']==max(c['high'] for c in hour) and d['low']==min(c['low'] for c in hour);assert datetime.fromisoformat(d['date']).weekday()<5
 for t in r['trades']:
  i=ix[ts(t['entryBarStart'])];c=cs[i];assert c['low']<=t['entry']<=c['high'];assert datetime.fromisoformat(t['entryBarStart']).weekday()<5
  assert t['entryBarStart'][:10]==t['referenceDate'] and t['entryBarStart'][11:16]>='15:05'
  assert math.isclose(t['entry'],(t['fiboStop']+t['swingTarget'])/2,abs_tol=1e-9)
  assert math.isclose(t['stop']-t['fiboStop'],0.03 if t['side']=='SHORT' else -0.03,abs_tol=1e-9)
  assert math.isclose(t['target']-t['swingTarget'],0.03 if t['side']=='SHORT' else -0.03,abs_tol=1e-9)
  expiry=ts(t['referenceDate']+'T15:00:00+07:00')+86400;status='unresolved_at_end' if end<expiry else 'unresolved_at_new_h1';exit=None
  for c in cs[i+1:]:
   if c['time']>=min(expiry,end):break
   sl=c['high']>=t['stop'] if t['side']=='SHORT' else c['low']<=t['stop'];tp=c['low']<=t['target'] if t['side']=='SHORT' else c['high']>=t['target']
   if sl or tp:status='ambiguous' if sl and tp else 'stop' if sl else 'target';exit=c['time'];break
  assert status==t['status'],(name,t['id'],status,t['status'])
  if exit is not None:assert ts(t['exitBarStart'])==exit
  if status=='target':assert math.isclose(t['r'],abs(t['target']-t['entry'])/abs(t['stop']-t['entry']))
  if status=='stop':assert t['r']==-1
 for suffix,key in [('-trades.csv','trades'),('-days.csv','days')]:
  with (p/(base.name+suffix)).open(encoding='utf-8-sig') as f:assert len(list(csv.reader(f)))-1==len(r[key])
 s=r['summary'];summary.append({'variant':name,'closed':s['totalTrades'],'targets':s['targets'],'stops':s['stops'],'win_rate_percent':round(s['winRateKnown']*100,2),'net_r':round(s['netRKnownBeforeCosts'],4),'unresolved':s['unresolved'],'ambiguous':s['ambiguous']})
 for m in range(4,11):
  month=f'2026-{m:02}';tt=[t for t in r['trades'] if t['entryBarStart'].startswith(month)];w=sum(t['status']=='target' for t in tt);l=sum(t['status']=='stop' for t in tt);n=w+l
  monthly.append({'variant':name,'month':month,'closed':n,'targets':w,'stops':l,'win_rate_percent':round(100*w/n,2) if n else None})
 assert sum(x['closed'] for x in monthly if x['variant']==name)==s['totalTrades']
for filename,rows in [('six-months-comparison.csv',summary),('six-months-monthly.csv',monthly)]:
 with (p/filename).open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=rows[0],lineterminator='\n');w.writeheader();w.writerows(rows)
(p/'six-months-audit.json').write_text(json.dumps({'audit':'PASS','candles':len(cs),'summary':summary,'monthly':monthly},ensure_ascii=False,indent=2))
print(json.dumps({'audit':'PASS','summary':summary,'monthly':monthly},ensure_ascii=False,indent=2))
