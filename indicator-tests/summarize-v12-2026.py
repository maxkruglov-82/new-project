"""Audit month boundaries and write the frozen V1.2 baseline report."""
from pathlib import Path
import json,datetime,csv,hashlib
root=Path(__file__).resolve().parent.parent;out=root/'reports/backtest-2026-v12-e7f6d3f'
prov=json.loads((out/'provenance.json').read_text());months=[json.loads((out/f'2026-{m:02}.json').read_text()) for m in range(1,11)]
stamp=lambda s:datetime.datetime.fromisoformat(s).timestamp()
assert all(x['sourceSha256']==prov['sourceSha256'] and x['inputSha256']==prov['inputSha256'] for x in months)
for m in months:
 assert m['executed']==m['tp']+m['sl']+m['open']
 if m['month']!='2026-10':assert m['open']==0,('extend lookahead to resolve month',m['month'])
seams=[]
for prev,nxt in zip(months,months[1:]):
 begin=stamp(nxt['start']);end=begin+7*86400
 a={t['entryAt']:t for t in prev['auditTrades'] if begin<=stamp(t['entryAt'])<end}
 b={t['entryAt']:t for t in nxt['auditTrades'] if begin<=stamp(t['entryAt'])<end}
 assert a.keys()==b.keys(),('month boundary fills differ',nxt['month'],a.keys(),b.keys())
 for k in a:
  for field in ['side','entry','stop','target','rr']:
   assert a[k][field]==b[k][field],('month boundary terms differ',k,field)
  if a[k]['status']!='OPEN':assert a[k]==b[k],('month boundary outcome differs',k)
 for t in prev['trades']:
  if stamp(t['entryAt'])<begin and (t['exitAt'] is None or stamp(t['exitAt'])>=begin):
   carried={x['entryAt']:x for x in nxt['auditTrades']}
   assert t['entryAt'] in carried,('carry exceeds warmup; extend',t)
 seams.append({'month':nxt['month'],'matchedFirstWeekEntries':len(a),'passed':True})
trades=[t for m in months for t in m['trades']];assert len({t['entryAt'] for t in trades})==len(trades)
byday={}
for t in trades:byday.setdefault(t['day'],[]).append(t)
for ts in byday.values():
 assert len(ts)<=2
 if len(ts)==2:assert ts[0]['status']=='SL'
tp=sum(t['status']=='TP' for t in trades);sl=sum(t['status']=='SL' for t in trades);opened=sum(t['status']=='OPEN' for t in trades)
summary={'version':'V1.2','sourceCommit':prov['sourceCommit'],'sourceSha256':prov['sourceSha256'],'inputSha256':prov['inputSha256'],'exchange':'MEXC','symbol':'SOL_USDT perpetual','timeframe':'M5','timezone':'Asia/Krasnoyarsk','coverageStart':'2026-01-01T00:00:00+07:00','cutoff':prov['cutoff'],'missingCandles':0,'counting':'each actual entry separately; winrate=TP/(TP+SL); open and no-entry setups excluded from denominator','executed':len(trades),'tp':tp,'sl':sl,'open':opened,'winRate':100*tp/(tp+sl) if tp+sl else None,'months':[{k:v for k,v in m.items() if k not in ('trades','auditTrades')} for m in months],'unavailableMonths':['2026-11','2026-12'],'knownIssue':prov['knownIssue'],'monthBoundaryAudit':seams,'maxObservedHoldingHours':max((stamp(t['exitAt'])-stamp(t['entryAt']))/3600 for t in trades if t['exitAt'])}
(out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');(out/'trades.json').write_text(json.dumps(trades,ensure_ascii=False,indent=2)+'\n')
with (out/'trades.csv').open('w',encoding='utf-8-sig',newline='') as f:
 fields=['day','side','entryAt','entry','stop','target','rr','status','exitAt','exitPrice'];w=csv.DictWriter(f,fieldnames=fields,lineterminator="\n");w.writeheader();w.writerows([{**t,'side':'LONG' if t['side']==1 else 'SHORT'} for t in trades])
with (out/'monthly.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.writer(f,lineterminator="\n");w.writerow(['month','trades','take_profits','stop_losses','open','win_rate_percent'])
 for m in months:w.writerow([m['month'],m['executed'],m['tp'],m['sl'],m['open'],round(m['winRate'],2) if m['winRate'] is not None else ''])
 for m in ['2026-11','2026-12']:w.writerow([m,'N/A','N/A','N/A','N/A','N/A'])
 w.writerow(['TOTAL',len(trades),tp,sl,opened,round(summary['winRate'],2)])
names=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь*'];rows=[]
for name,m in zip(names,months):rows.append(f"|{name}|{m['executed']}|{m['tp']}|{m['sl']}|{m['open']}|{m['winRate']:.2f}%|")
text='# Помесячный бэктест V1.2 за доступную часть2026 года\n\nMEXC SOL_USDT, бессрочные фьючерсы, M5. Время Красноярска UTC+7. Проверен период01.01.2026–31.10.2026 15:10; только закрытые M5. Ноябрь и декабрь ещё не наступили. Код опубликованной V1.2 зафиксирован вe7f6d3f и сохранён рядом вindicator.txt.\n\n|Месяц|Сделки|Тейки|Стопы|Открыты|Винрейт|\n|---|---:|---:|---:|---:|---:|\n'+'\n'.join(rows)+f'\n|Ноябрь|н/д|н/д|н/д|н/д|н/д|\n|Декабрь|н/д|н/д|н/д|н/д|н/д|\n|Итого|{len(trades)}|{tp}|{sl}|{opened}|{summary["winRate"]:.2f}%|\n\n'
text+='*Октябрь неполный: отсечение31.10 в15:10 UTC+7.\n\nКаждый фактический вход считается отдельной сделкой. Стоп и последующий тейк одного дня не объединяются. Сетапы «Без входа» не входят в сделки. Винрейт=TP/(TP+SL); открытые позиции исключены из знаменателя. Сделка относится к месяцу входа; выход может находиться в следующем месяце.\n\nИспользован полный опубликованный код с исходными настройками, без удаления графических блоков и без правок торговой логики. Первый час Лондона08–09 Europe/London:14–15 летом и15–16 зимой в Красноярске. Вход по касанию RR1:1, стоп по телу, тейк по тени, SL имеет приоритет при обоих исходах на одной последующей M5. Выход на свече входа не моделируется. Результат представляет модель исполнения по M5.\n\nДля каждого входа независимо проверены касание цены тенью, RR и отсутствие нарушения стопа телом; для каждого выхода проверен исход по OHLC. В каждой месячной выборке семь дней контекста слева и до семи дней справа; результаты первой недели следующего месяца сверены между соседними прогонами, переносы позиций проверены. Пропусков данных нет.\n\nИзвестное ограничение реализации: ошибка14 октября — после отклонения ранней встречной тройки состояние может оставаться завершённым и блокировать последующую внешнюю структуру. В этом бэктесте она НЕ исправлялась. Поэтому числа относятся к опубликованному кодуe7f6d3f, а не к предполагаемой исправленной стратегии.\n\nСравнение сV1.1 отложено по запросу пользователя. Для него сохранены исходник V1.2, журнал сделок, контрольные суммы данных и точное отсечение; сравнение следует проводить на том же наборе свечей и при одинаковом способе учёта.\n'
(out/'report.md').write_text(text)
print(json.dumps({k:summary[k] for k in ['executed','tp','sl','open','winRate','maxObservedHoldingHours']},ensure_ascii=False))
