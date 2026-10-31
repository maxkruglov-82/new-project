from pathlib import Path
from collections import Counter
from datetime import datetime,timedelta
import csv,hashlib,json

repo=Path(__file__).resolve().parents[1]
r=repo/'reports/backtest-2026-third-body-separated'
def read(variant):
    folder=r/variant
    provenance=json.loads((folder/'provenance.json').read_text())
    assert hashlib.sha256((folder/'indicator.txt').read_bytes()).hexdigest()==provenance['sourceSha256']
    months=[json.loads((folder/f'2026-{m:02}.json').read_text()) for m in range(1,11)]
    for m in months:
        assert m['sourceSha256']==provenance['sourceSha256']
        assert m['inputSha256']==provenance['inputSha256']
        assert m['open']==0
        assert m['executed']==m['tp']+m['sl']==len(m['trades'])
        assert sum(p['status']=='FILLED' for p in m['plans'])==m['executed']
    # The monthly runs independently repeat the following month's first week.
    for prev,nxt in zip(months,months[1:]):
        start=datetime.fromisoformat(nxt['start']);end=start+timedelta(days=7)
        collect=lambda m:{t['entryAt']:t for t in m['auditTrades'] if start<=datetime.fromisoformat(t['entryAt'])<end}
        a,b=collect(prev),collect(nxt)
        assert a.keys()==b.keys(),(variant,nxt['month'],'entry seam')
        for key in a:
            for field in ['side','entry','stop','target','rr']:
                assert a[key][field]==b[key][field],(variant,key,field)
            if a[key]['status']!='OPEN':assert a[key]==b[key],(variant,key,'outcome seam')
    return provenance,months,[t for m in months for t in m['trades']]

bp,bm,before=read('baseline');provenance,months,trades=read('draft')
assert hashlib.sha256((repo/'KRYTES_V1_2_LONDON_STRUCTURE.txt').read_bytes()).hexdigest()==provenance['sourceSha256']
stats=lambda ts:dict(trades=len(ts),tp=sum(t['status']=='TP' for t in ts),sl=sum(t['status']=='SL' for t in ts),winRate=100*sum(t['status']=='TP' for t in ts)/len(ts) if ts else None)
names=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
rows=[dict(month=m['month'],name=names[i],status='available',**stats(m['trades'])) for i,m in enumerate(months)]
rows += [dict(month=f'2026-{m:02}',name=names[m-1],status='not_yet_occurred',trades=None,tp=None,sl=None,winRate=None) for m in [11,12]]
days=[]
for day in sorted({t['day'] for t in before+trades}):
    a=[t for t in before if t['day']==day];b=[t for t in trades if t['day']==day]
    if a!=b:days.append(dict(day=day,before=a,after=b))
summary=dict(sourceCommit=provenance['sourceCommit'],sourceSha256=provenance['sourceSha256'],inputSha256=provenance['inputSha256'],cutoff=provenance['cutoff'],totals=stats(trades),baselineCommit='2db37be',baseline=stats(before),months=rows,changedDays=days)
(r/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
with (r/'monthly.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
with (r/'trades.csv').open('w',encoding='utf-8-sig',newline='') as f:
    fields=['day','side','entryAt','entry','stop','target','rr','status','exitAt','exitPrice']
    w=csv.DictWriter(f,fieldnames=fields,lineterminator='\n');w.writeheader();w.writerows(trades)
with (r/'all-setups.csv').open('w',encoding='utf-8-sig',newline='') as f:
    fields=['createdAt','side','kind','stop','target','level','status','finishedAt']
    w=csv.DictWriter(f,fieldnames=fields,lineterminator='\n');w.writeheader()
    for m in months:w.writerows(m['plans'])
text='# Бэктест2026: опубликованная V1.2 London\n\n'
text+=f"Версия `{provenance['sourceCommit']}`. Расчёт запущен после публикации кода. MEXC SOL_USDT, бессрочный фьючерс, M5; UTC+7. Последняя граница данных: {provenance['cutoff']}. Исходник и контрольные SHA256 сохранены в `draft/indicator.txt` и `draft/provenance.json`; имя `draft` осталось техническим именем каталога, расчёт относится к опубликованной версии.\n\n"
text+=f"[Код для KRYTES](https://raw.githubusercontent.com/maxkruglov-82/new-project/{provenance['sourceCommit']}/KRYTES_V1_2_LONDON_STRUCTURE_SMALL.txt)\n\n"
text+='|Месяц2026|Всего сделок|Успешных (TP)|Стопов (SL)|Винрейт|\n|---|---:|---:|---:|---:|\n'
for x in rows:text+=f"|{x['name']}|"+('|'.join(str(x[k]) for k in ['trades','tp','sl'])+f"|{x['winRate']:.2f}%|\n" if x['status']=='available' else '—|—|—|месяц ещё не наступил|\n')
t=summary['totals'];text+=f"|**Итого январь–октябрь**|**{t['trades']}**|**{t['tp']}**|**{t['sl']}**|**{t['winRate']:.2f}%**|\n\n"
text+='Успешная сделка — достижение TP, стоп — SL; винрейт = TP / (TP+SL). Неисполненные планы исключены. Месяц определяется датой фактического входа. Открытых сделок без известного результата в итогах нет. История начинается25.12.2025 для разогрева; декабрьские входы не включаются в2026. Ноябрь и декабрь не заменены нулями.\n\n'
text+='## Проверка расчёта\n\nКаждый месяц выполняется отдельно с семидневным разогревом и просмотром семи дней после месяца, ограниченным концом данных. Межмесячные входы, уровни и известные исходы совпали. Касание RR1:1 и TP/SL независимо проверены поOHLC: вход тенью по точному уровню, SL по телу, TP по тени, при одновременном SL/TP приоритет SL. Выход на свече входа не моделируется. Не более двух фактических входов за день, второй только после первого SL.\n\n'
text+='Набор исходных свечей общий с предыдущим отчётом: `../backtest-2026-body-confirmed-extremes/input.json.gz`. SHA256 проверяется после распаковки. Новая ветка по12 октября отложена и не включена. Изменения визуальных инструментов не меняют финансовые сигналы; это отдельно проверено на22/23 октября и зеркальных вариантах.\n\n'
text+='## Сравнение с2db37be\n\n'+json.dumps(dict(before=summary['baseline'],after=t),ensure_ascii=False)+'\n\n'
fmt=lambda ts:'<br>'.join(f"{'LONG' if z['side']==1 else 'SHORT'} {z['entryAt'][11:16]}: вход{z['entry']:g}, SL{z['stop']:g}, TP{z['target']:g}, {z['status']}" for z in ts) or 'Нет сделки'
text+='|Дата|2db37be|Новая публикация|\n|---|---|---|\n'
for x in days:text+=f"|{x['day']}|{fmt(x['before'])}|{fmt(x['after'])}|\n"
text+='\n## Воспроизведение\n\n`node --max-old-space-size=6144 indicator-tests/backtest-v12-third-body-separated.mjs 10 draft` повторяет октябрь в `/tmp/v12-third-body-backtest/draft/2026-10.json`. Месяц1–10, вариантbaseline/draft, затем необязательные число дней просмотра и каталог вывода. Сводка: `python indicator-tests/summarize-v12-third-body-separated.py`.\n'
(r/'README.md').write_text(text)
print(json.dumps(dict(totals=t,changedDays=len(days),sourceCommit=provenance['sourceCommit']),ensure_ascii=False))
