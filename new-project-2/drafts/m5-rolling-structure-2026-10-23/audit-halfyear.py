import csv,datetime,hashlib,json,math
from pathlib import Path
from openpyxl import Workbook,load_workbook
from openpyxl.styles import Font,PatternFill
out=Path(__file__).resolve().parent
root=out.parents[1]
z=json.loads((out/'halfyear-v40.json').read_text())
a=json.loads((out/'halfyear-comparison.json').read_text())
p=root/'reports/v36-p1-close-2026-10-23/halfyear-candles.json'
raw=json.loads(p.read_text());cs=raw['candles'];ix={c['time']:i for i,c in enumerate(cs)}
ts=lambda s:int(datetime.datetime.fromisoformat(s).timestamp())
end=ts(raw['endExclusive'])
assert z['sourceSha256']==hashlib.sha256((out/'sol_rolling.pine').read_bytes()).hexdigest()
assert z['inputSha256']==hashlib.sha256(p.read_bytes()).hexdigest()
assert len(cs)==raw['count']==(end-ts(raw['start']))//300
assert all(c['time']==cs[0]['time']+i*300 for i,c in enumerate(cs))
for d in z['days']:
 h=ts(d['referenceClose']);hour=cs[ix[h-3600]:ix[h-3600]+12]
 assert d['high']==max(c['high'] for c in hour) and d['low']==min(c['low'] for c in hour)
 assert datetime.date.fromisoformat(d['date']).weekday()<5
for e in z['p1Audit']:
 j=ix[ts(e['pivotAt'])];k=ix[ts(e['priorCloseAt'])];i=ix[ts(e['confirmedAt'])];assert k<=j<i
 ref=ts(e['pivotAt'][:10]+'T15:00:00+07:00');assert ref<=cs[k]['time']<=cs[j]['time']
 hour=cs[ix[ref-3600]:ix[ref-3600]+12];hi=max(b['high'] for b in hour);lo=min(b['low'] for b in hour)
 assert e['h1High']==hi and e['h1Low']==lo
 correct=lambda b:b['close']<lo if e['side']==-1 else b['close']>hi
 assert next(n for n in range(ix[ref],j+1) if correct(cs[n]))==k
 assert e['priorClose']==cs[k]['close'] and e['pivotClose']==cs[j]['close']
for t in z['trades']:
 i=ix[ts(t['entryBarStart'])];b=cs[i];assert b['low']<=t['entry']<=b['high']
 assert datetime.datetime.fromisoformat(t['entryBarStart']).weekday()<5
 assert t['entryBarStart'][:10]==t['referenceDate'] and t['entryBarStart'][11:16]>='15:00'
 assert (b['open']<=t['entry'] if t['side']=='SHORT' else b['open']>=t['entry'])
 assert math.isclose(t['entry'],(t['fiboStop']+t['swingTarget'])/2,abs_tol=1e-9)
 assert math.isclose(t['stop']-t['fiboStop'],.03 if t['side']=='SHORT' else -.03,abs_tol=1e-9)
 assert math.isclose(t['target']-t['swingTarget'],.10 if t['side']=='SHORT' else -.10,abs_tol=1e-9)
 expiry=ts(t['referenceDate']+'T15:00:00+07:00')+86400
 status='unresolved_at_end' if end<expiry else 'unresolved_at_new_h1';exit_time=None
 for b in cs[i+1:]:
  if b['time']>=min(expiry,end):break
  sl=b['high']>=t['stop'] if t['side']=='SHORT' else b['low']<=t['stop']
  tp=b['low']<=t['target'] if t['side']=='SHORT' else b['high']>=t['target']
  if sl or tp:status='ambiguous' if sl and tp else 'stop' if sl else 'target';exit_time=b['time'];break
 assert status==t['status'],(t['id'],status,t['status'])
 if exit_time is not None:assert ts(t['exitBarStart'])==exit_time
 if status=='target':assert math.isclose(t['r'],abs(t['target']-t['entry'])/abs(t['stop']-t['entry']))
 if status=='stop':assert t['r']==-1
for d in z['days']:
 own=[t for t in z['trades'] if t['referenceDate']==d['date']]
 for i,t in enumerate(own):
  if t['status']=='target':assert i==len(own)-1
s=z['summary'];months=a['monthly']
for key,summarykey in [('entered','enteredTrades'),('closed','totalTrades'),('wins','targets'),('losses','stops'),('unresolved','unresolved'),('ambiguous','ambiguous')]:
 assert sum(m['v40'][key] for m in months)==s[summarykey]
assert math.isclose(sum(m['v40']['netR'] for m in months),s['netRKnownBeforeCosts'])
assert math.isclose(s['winRateKnown'],s['targets']/(s['targets']+s['stops']))
for name,n in [('halfyear-monthly.csv',len(months)),('halfyear-trades.csv',len(z['trades']))]:
 with (out/name).open(encoding='utf-8-sig') as f:assert len(list(csv.DictReader(f)))==n
# Verify each confirmed4 from raw candles, not from the strategy's decision.
for e in z['rollAudit']:
 i=ix[ts(e['at'])];j=ix[ts(e['firstAt'])];k=ix[ts(e['secondAt'])];long=e['side']==1
 assert j+1<k==i-1
 assert e['first']==cs[j]['high' if long else 'low']
 assert e['second']==cs[k]['low' if long else 'high']
 assert (e['second']>e['oldEntry']) if long else (e['second']<e['oldEntry'])
 assert all((b['low']>e['oldEntry']) if long else (b['high']<e['oldEntry']) for b in cs[j+1:i+1])
 value=cs[k]['low' if long else 'high'];left=k-1
 while left>=0 and cs[left]['low' if long else 'high']==value:left-=1
 assert left>=0
 assert (cs[left]['low']>value and cs[i]['low']>value) if long else (cs[left]['high']<value and cs[i]['high']<value)
 assert e['stageAfter'] in [4,5]
 assert all(t['entryBarStart']!=e['at'] for t in z['trades'])
# Reproduce the separately verified May result within the full chronology.
may=json.loads((out/'may-comparison.json').read_text())
normalize=lambda rows:[{k:v for k,v in t.items() if k!='id'} for t in rows]
assert normalize([t for t in z['trades'] if t['referenceDate'].startswith('2026-05')])==normalize(may['after']['trades'])
wb=Workbook();sheet=wb.active;sheet.title='Сравнение'
rows=[['SOL/USDT MEXC M5 • 23.04–22.10.2026 • UTC+7'],['Вариант','Всего входов','Закрытых','Тейки','Стопы','Незавершённые','Неоднозначные','Винрейт','Результат R','Макс. просадка R','Профит-фактор']]
for version in ['v39','v40']:
 q=a[version];rows.append([version]+[q[k] for k in ['entered','closed','wins','losses','unresolved','ambiguous','winRate','netR','maxDrawdownR','profitFactor']])
for row in rows:sheet.append(row)
for r in [3,4]:sheet.cell(r,8).number_format='0.00%'
monthly=wb.create_sheet('Помесячно v40')
monthly.append(['Месяц','Всего входов','Закрытых','Тейки','Стопы','Незавершённые','Неоднозначные','Винрейт v40','R v40','Винрейт v39','R v39'])
for m in months:
 q=m['v40'];monthly.append([m['month']]+[q[k] for k in ['entered','closed','wins','losses','unresolved','ambiguous','winRate','netR']]+[m['v39']['winRate'],m['v39']['netR']])
 for col in [8,10]:monthly.cell(monthly.max_row,col).number_format='0.00%'
trades=wb.create_sheet('Сделки v40');keys=list(z['trades'][0]);trades.append(keys)
for t in z['trades']:trades.append([t.get(k) for k in keys])
for ws,header in [(sheet,2),(monthly,1),(trades,1)]:
 ws.freeze_panes=f'A{header+1}';ws.auto_filter.ref=f'A{header}:{ws.cell(ws.max_row,ws.max_column).coordinate}'
 for cell in ws[header]:cell.font=Font(bold=True,color='FFFFFF');cell.fill=PatternFill('solid',fgColor='17365D')
 for col in ws.columns:ws.column_dimensions[col[0].column_letter].width=min(40,max(14,max(len(str(c.value or '')) for c in col)+2))
 for row in ws.iter_rows(min_row=header+1):
  for cell in row:
   if isinstance(cell.value,float) and cell.number_format=='General':cell.number_format='0.0000'
wb.save(out/'halfyear-comparison.xlsx')
check=load_workbook(out/'halfyear-comparison.xlsx',data_only=True)
assert check['Сравнение']['B4'].value==s['enteredTrades'] and check['Сделки v40'].max_row==len(z['trades'])+1
labels=['','Январь','Февраль','Март','Апрель 23–30','Май','Июнь','Июль','Август','Сентябрь','Октябрь 1–22']
pct=lambda x:f'{x*100:.2f}%'
lines=['# Solana M5 v40 — сравнение с v39 за полгода','','23 апреля — 22 октября 2026 включительно, UTC+7. MEXC SOL_USDT perpetual futures; 52 536 непрерывных M5. v40 добавляет к v39 отдельную структуру3–4–5: подтверждённый свинг4 до старого входа сразу отменяет прежний вход, затем ожидаются5 и ретест6. Остальные правила и буферы сохранены. Выполнен фактический Pine-исходник, без переписывания стратегии. v39 — ранее проверенный журнал на тех же данных, проверены SHA256 и эквивалентность опубликованного исходника.','','| Версия | Входы | Закрытые | Тейки | Стопы | Винрейт | R |','|---|---:|---:|---:|---:|---:|---:|']
for version in ['v39','v40']:
 q=a[version];lines.append(f"| {version} | {q['entered']} | {q['closed']} | {q['wins']} | {q['losses']} | {pct(q['winRate'])} | {q['netR']:+.4f} |")
lines+=['','| Месяц | Входы | Закрытые | Тейки | Стопы | Винрейт v40 | R v40 |','|---|---:|---:|---:|---:|---:|---:|']
for m in months:
 q=m['v40'];lines.append(f"| {labels[int(m['month'][5:])]} | {q['entered']} | {q['closed']} | {q['wins']} | {q['losses']} | {pct(q['winRate'])} | {q['netR']:+.4f} |")
lines+=['',f"Даты с изменёнными сделками: {', '.join(d['date'] for d in a['changedDays'])}.",'','Винрейт = тейки / (тейки + стопы). Незавершённые и неоднозначные исходы исключены из винрейта и результата R; количества приведены в Excel и JSON. Результат R до комиссий, финансирования и проскальзывания. Из-за тейка на 0,10 USDT перед целью и стопа на 0,03 USDT за Фибо фактический RR ниже 1:1.','', 'Исторический вход проверяется по последующей свече ретеста, выход — начиная со свечи после входа. Порядок касаний внутри M5 неизвестен; одновременный SL/TP помечается неоднозначным. Новый опорный час снимает незавершённую позицию без фиктивного результата. После тейка новых входов в этот опорный день нет.','','1мая: LONG20:25,TP20:30. Майский журнал полностью воспроизведён в общем прогоне. Минутные результаты не подставлены в M5-бэктест. Черновик не опубликован.','','[Excel](halfyear-comparison.xlsx) · [Журнал CSV](halfyear-trades.csv) · [Сравнение JSON](halfyear-comparison.json) · [Аудит](halfyear-audit.json)']
(out/'halfyear-report.md').write_text('\n'.join(lines)+'\n')
audit={'status':'PASS','candles':len(cs),'verifiedReferences':len(z['days']),'verifiedP1Events':len(z['p1Audit']),'verifiedNewStructures':len(z['rollAudit']),'verifiedTrades':len(z['trades']),'sourceSha256':z['sourceSha256'],'inputSha256':z['inputSha256'],'checks':['Continuous M5 data and actual reference H1','Each P1 prior close independently reconstructed, without future close','Entry price touched, time and weekdays','Unchanged E/SL/TP formulas','First subsequent OHLC exit independently reconstructed','No new entry after TP','Monthly and CSV reconciliation','Every4 independently confirmed from raw M5; old entry not touched; no entry on4 confirmation','May full ledger exactly reproduced','Workbook values checked']}
(out/'halfyear-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(audit,ensure_ascii=False,indent=2))
# Show whether the improvement survives outside the user-selected May example.
from openpyxl.styles import Alignment
extra=load_workbook(out/'halfyear-comparison.xlsx')
ws=extra.create_sheet('Без мая')
ws.append(['Вариант','Входы','Закрытые','Тейки','Стопы','Винрейт','Результат R','Макс. просадка R'])
for version in ['v39','v40']:
 q=a['excludingMay'][version];ws.append([version,q['entered'],q['closed'],q['wins'],q['losses'],q['winRate'],q['netR'],q['maxDrawdownR']]);ws.cell(ws.max_row,6).number_format='0.00%'
 assert math.isclose(q['netR'],a[version]['netR']-next(m[version]['netR'] for m in months if m['month']=='2026-05'))
for cell in ws[1]:cell.font=Font(bold=True,color='FFFFFF');cell.fill=PatternFill('solid',fgColor='17365D')
for col in ws.columns:ws.column_dimensions[col[0].column_letter].width=24
ws.freeze_panes='B2'
extra.save(out/'halfyear-comparison.xlsx')
check=load_workbook(out/'halfyear-comparison.xlsx',data_only=True)
assert math.isclose(check['Без мая']['G3'].value,a['excludingMay']['v40']['netR'])
f=out/'halfyear-report.md';text=f.read_text();text+=f"\nБез мая: v39 {a['excludingMay']['v39']['netR']:+.4f}R, v40 {a['excludingMay']['v40']['netR']:+.4f}R. Майское улучшение не переносится на результат остальных месяцев в совокупности. По полному периоду винрейт немного ниже, результат R ниже, просадка выше. Предложение пока остаётся черновиком.\n";f.write_text(text)
