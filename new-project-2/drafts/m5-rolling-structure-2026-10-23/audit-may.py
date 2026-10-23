import csv,datetime,hashlib,json,math
from pathlib import Path
from openpyxl import Workbook,load_workbook
from openpyxl.styles import Font,PatternFill
out=Path(__file__).resolve().parent
root=out.parents[1]
a=json.loads((out/'may-comparison.json').read_text())
z=a['after']
p=out/'may-candles.json'
raw=json.loads(p.read_text());cs=raw['candles'];ix={c['time']:i for i,c in enumerate(cs)}
ts=lambda s:int(datetime.datetime.fromisoformat(s).timestamp())
end=ts(raw['endExclusive'])
assert a['sourceSha256']==hashlib.sha256((out/'sol_rolling.pine').read_bytes()).hexdigest()
assert a['inputSha256']==hashlib.sha256(p.read_bytes()).hexdigest()
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
for version,key in [('v39','before'),('v40','after')]:
 trades=a[key]['trades'];q=a[version]
 assert len(trades)==q['entries']
 assert sum(t['status']=='target' for t in trades)==q['wins']
 assert sum(t['status']=='stop' for t in trades)==q['stops']
 assert q['closed']==q['wins']+q['stops']
 assert math.isclose(sum(t['r'] or 0 for t in trades),q['netR'])
 assert math.isclose(100*q['wins']/q['closed'],q['winRate'])
 assert q['entries']==q['closed']+q['unresolved']+q['ambiguous']
for name,key in [('may-v39-trades.csv','before'),('may-v40-trades.csv','after')]:
 with (out/name).open(encoding='utf-8-sig') as f:assert len(list(csv.DictReader(f)))==len(a[key]['trades'])
first=next(t for t in z['trades'] if t['referenceDate']=='2026-05-01')
assert first['entryBarStart']=='2026-05-01T20:25:00.000+07:00' and first['status']=='target' and first['exitBarStart']=='2026-05-01T20:30:00.000+07:00'
audit={'status':'PASS','candles':len(cs),'verifiedTrades':len(z['trades']),'verifiedP1Events':len(z['p1Audit']),'verifiedNewStructures':len(z['rollAudit']),'sourceSha256':a['sourceSha256'],'baseSourceSha256':a['baseSourceSha256'],'inputSha256':a['inputSha256'],'checks':['Complete M5 and H1','P1 earlier close without future data','Every confirmed4 is an independent raw M5 swing after3 and did not touch old entry','No historical entry on4 confirmation','E/SL/TP formulas','First subsequent exit reconstructed','No trade after TP','Comparison and CSV reconciliation','v39 baseline exactly reproduces halfyear May ledger','RealMay1 entry20:25 and TP20:30']}
(out/'may-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
# Reviewable workbook: totals, every entry and each changed reference day.
w=Workbook();sheet=w.active;sheet.title='Май — сравнение'
sheet.append(['SOL/USDT MEXC M5 • 1–31 мая 2026 • UTC+7'])
headers=['Версия','Входы','Закрытые','Тейки','Стопы','Винрейт','Результат R','Макс. просадка R','Профит-фактор','Незавершённые','Неоднозначные']
sheet.append(headers)
for version in ['v39','v40']:
 q=a[version];sheet.append([version]+[q[k] for k in ['entries','closed','wins','stops']]+[q['winRate']/100]+[q[k] for k in ['netR','maxDrawdownR','profitFactor','unresolved','ambiguous']]);sheet.cell(sheet.max_row,6).number_format='0.00%'
sheet.append([]);sheet.append(['Изменение винрейта, процентных пунктов',a['v40']['winRate']-a['v39']['winRate']]);sheet.append(['Изменение результата R',a['v40']['netR']-a['v39']['netR']]);sheet.append(['Комиссии, финансирование, проскальзывание','Не учтены']);sheet.append(['Оба варианта рассчитаны на одинаковых закрытых M5','Минутные тейки не подставлены'])
for version,key in [('v39','before'),('v40','after')]:
 ws=w.create_sheet('Входы '+version);keys=list(a[key]['trades'][0]);ws.append(keys)
 for t in a[key]['trades']:ws.append([t[k] for k in keys])
changed=w.create_sheet('Изменённые дни');changed.append(['Дата','Версия','Сторона','Вход, UTC+7','Цена входа','Стоп','Тейк','Исход','Выход, UTC+7','Результат R'])
for day in a['changedDays']:
 for version in ['v39','v40']:
  if not day[version]:changed.append([day['date'],version,'Нет входа'])
  for t in day[version]:changed.append([day['date'],version,t['side'],t['entryBarStart'],t['entry'],t['stop'],t['target'],t['status'],t['exitBarStart'],t['r']])
rolls=w.create_sheet('Подтверждённые 4');keys=list(z['rollAudit'][0]);rolls.append(keys)
for e in z['rollAudit']:rolls.append([e[k] for k in keys])
for ws in w:
 header=2 if ws==sheet else 1
 ws.freeze_panes=f'A{header+1}'
 if ws!=sheet:ws.auto_filter.ref=ws.dimensions
 for cell in ws[header]:cell.font=Font(bold=True,color='FFFFFF');cell.fill=PatternFill('solid',fgColor='17365D')
 for col in ws.columns:ws.column_dimensions[col[0].column_letter].width=28 if ws!=sheet else 23
 for row in ws.iter_rows(min_row=header+1):
  for cell in row:
   if isinstance(cell.value,float) and cell.number_format=='General':cell.number_format='0.0000'
w.save(out/'may-comparison.xlsx')
check=load_workbook(out/'may-comparison.xlsx',data_only=True)
assert check['Май — сравнение']['D4'].value==a['v40']['wins']
assert check['Входы v40'].max_row==a['v40']['entries']+1
assert math.isclose(check['Май — сравнение']['G4'].value,a['v40']['netR'])
pct=lambda v:f'{v:.2f}%'.replace('.',',')
lines=['# Май2026 — v39 против v40','','1–31 мая2026 включительно, UTC+7. MEXC SOL_USDT perpetual futures, M5. Запущены фактические Pine-исходники на8760 непрерывных M5; v39 полностью воспроизвёл майский журнал предыдущего полугодового теста.','','v40: после подтверждённого отдельного свинга4, не дошедшего до старого входа1:1, старый вход немедленно отменяется.3 становится новойP1,4 новойP2; ожидаем5 и ретест6. Правило зеркальное. Основаv39 с равнойP3 и отдельнойP2 сохранена. Стоп0,03 и тейк0,10 перед целью не менялись.','','| Версия | Закрытые | Тейки | Стопы | Винрейт | Результат R | Макс. просадка R |','|---|---:|---:|---:|---:|---:|---:|']
for version in ['v39','v40']:
 q=a[version];lines.append(f"| {version} | {q['closed']} | {q['wins']} | {q['stops']} | {pct(q['winRate'])} | {q['netR']:+.4f} | {q['maxDrawdownR']:.4f} |")
lines+=['',f"Винрейт увеличился на {a['v40']['winRate']-a['v39']['winRate']:.2f} процентного пункта, результат улучшился на {a['v40']['netR']-a['v39']['netR']:+.4f}R. При этом месяц остаётся убыточным до расходов, а максимальная просадка немного выросла.",'',f"У v40 {a['v40']['entries']} входов, {a['v40']['unresolved']} незавершённых, {a['v40']['ambiguous']} неоднозначных. Изменены дни: {', '.join(d['date'] for d in a['changedDays'])}.",'','1мая: новый LONG20:25,вход84,37625,SL84,1025,TP84,52; тейк20:30. В прежнем варианте LONG21:25 завершился стопом.','',f"Аудит PASS: исходные H1, прежние закрепления P1, {len(z['rollAudit'])} новых структур с подтверждённой4 и недоходом до старого входа, цены входов и выходов, формулы и суммы. 18 целевых тестов механики прошли.",'','M5 OHLC не восстанавливает порядок касаний внутри свечи входа; выход проверяется со следующей свечи. Одновременные SL/TP на последующей M5 отмечаются неоднозначными. После тейка новых входов в этот опорный день нет; новая H1 снимает неразрешённую позицию без фиктивного результата. Минутные результаты не подставлялись в этот расчёт. Комиссии, финансирование и проскальзывание не учтены. Выбор изменения по одному месяцу, показанному пользователем, не подтверждает преимущество на других месяцах; общий полугодовой тест v40 ещё не выполнялся.','','Черновик не опубликован, действующаяv38 не изменена.','','[Excel](may-comparison.xlsx) · [Результат JSON](may-comparison.json) · [Аудит](may-audit.json) · [Все входы v40 CSV](may-v40-trades.csv)']
(out/'may-report.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'audit':'PASS','v39':a['v39'],'v40':a['v40'],'verifiedNewStructures':len(z['rollAudit']),'changedDays':[d['date'] for d in a['changedDays']]},ensure_ascii=False,indent=2))
