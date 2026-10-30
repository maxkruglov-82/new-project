"""Compare the same MEXC history with two-close and one-close V1 confirmations."""
import json,csv,hashlib
from pathlib import Path
root=Path(__file__).resolve().parent.parent
old=root/'reports/backtest-2026-b2375d6'
new=root/'reports/backtest-2026-v1-one-close'
a=json.loads((old/'summary.json').read_text());b=json.loads((new/'summary.json').read_text())
assert a['inputSha256']==b['inputSha256']
assert b['sourceSha256']==hashlib.sha256((new/'indicator.txt').read_bytes()).hexdigest()
assert sum(m['executed'] for m in b['months'])==b['executed']
assert b['executed']==b['tp']+b['sl']+b['unresolved']
def merged(x):
 r=x['recoveredDays'];n=x['executed']-r;sl=x['sl']-r;closed=x['tp']+sl
 return dict(executed=n,tp=x['tp'],sl=sl,unresolved=x['unresolved'],winRate=100*x['tp']/closed if closed else None)
rows=[]
for x,y in zip(a['months'],b['months']):
 assert x['month']==y['month']
 rows.append(dict(month=x['month'],oldTrades=x['executed'],oldTP=x['tp'],oldSL=x['sl'],oldWinRate=x['winRate'],oldR=x['netR'],newTrades=y['executed'],newTP=y['tp'],newSL=y['sl'],newWinRate=y['winRate'],newR=y['netR'],deltaTrades=y['executed']-x['executed'],deltaWinRate=y['winRate']-x['winRate'],deltaR=y['netR']-x['netR'],oldMerged=merged(x),newMerged=merged(y)))
out=dict(baselineCommit='b2375d6',experimentBase='41aa36a',sameInputSha256=a['inputSha256'],period=a['coverage'],baseline={k:a[k] for k in ['executed','tp','sl','winRate','netR','unresolved']},experiment={k:b[k] for k in ['executed','tp','sl','winRate','netR','unresolved']},oldMerged=merged(a),newMerged=merged(b),deltaR=b['netR']-a['netR'],deltaWinRate=b['winRate']-a['winRate'],months=rows)
(new/'comparison.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
fields=[k for k in rows[0] if not k.endswith('Merged')]
with (new/'comparison.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows)
lines=['# Сравнение закрепов: две M5 и одна M5, V1 London','', 'MEXC SOL_USDT M5, UTC+7; 02.01–25.10.2026. Варианты используют один и тот же файл свечей. Ноябрь–декабрь ещё не наступили; позже25.10 данных в этом файле нет.','', 'Основная статистика: каждый вход отдельно; SL→TP не объединяется.','', '|Месяц|Сделки 2 M5|TP|SL|Винрейт|Сделки 1 M5|TP|SL|Винрейт|Изменение R|','|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
for r in rows:lines.append(f"|{r['month']}|{r['oldTrades']}|{r['oldTP']}|{r['oldSL']}|{r['oldWinRate']:.2f}%|{r['newTrades']}|{r['newTP']}|{r['newSL']}|{r['newWinRate']:.2f}%|{r['deltaR']:+}R|")
lines += [f"|Итого|{a['executed']}|{a['tp']}|{a['sl']}|{a['winRate']:.2f}%|{b['executed']}|{b['tp']}|{b['sl']}|{b['winRate']:.2f}%|{out['deltaR']:+}R|",'',f"Доля успешных изменилась на {out['deltaWinRate']:+.2f} процентного пункта. Результат при равном риске: {a['netR']:+}R → {b['netR']:+}R до комиссий и проскальзывания.",'','Вторая таблица — альтернативный учёт SL→TP как одной успешной сделки; SL→SL остаётся двумя стопами. Это не меняет денежный результат.','', '|Месяц|Учётных сделок 2 M5|Винрейт|Учётных сделок 1 M5|Винрейт|','|---|---:|---:|---:|---:|']
for r in rows:
 x,y=r['oldMerged'],r['newMerged'];lines.append(f"|{r['month']}|{x['executed']}|{x['winRate']:.2f}%|{y['executed']}|{y['winRate']:.2f}%|")
x,y=out['oldMerged'],out['newMerged'];lines += [f"|Итого|{x['executed']}|{x['winRate']:.2f}%|{y['executed']}|{y['winRate']:.2f}%|",'', 'Изменены только подтверждения закрепа (текущие и сохранённые закрытия) и завершение ожидания подтверждения на первой свече; цвета также используют одиночное закрытие. Пять свечей свинга, два касания RR1, отступ0.01, H1, стоп по телу/тейк по тени, два входа в день, приоритетSL и запрет выхода на свече входа сохранены. Рабочий индикатор не заменён.','', 'Тест имеет только исторический результат на этой выборке. Улучшение здесь само по себе не доказывает улучшение на новых данных. Полный реестр: trades.csv. Исходник эксперимента: indicator.txt.']
(new/'comparison.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({k:out[k] for k in ['baseline','experiment','deltaR','deltaWinRate','oldMerged','newMerged']},ensure_ascii=False))
