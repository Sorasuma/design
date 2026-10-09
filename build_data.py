#!/usr/bin/env python3
"""Собирает data.js и HTML-страницы из таблицы xlsx (названия + гиперссылки на файлы).
Запуск:  python3 tools/build_data.py путь/к/таблице.xlsx    (нужен openpyxl)
Запускать из корня сайта: data.js и *.html перезаписываются.
Лист «Костюмы не акт» намеренно пропускается (неактуальные костюмы).
"""
import json, re, sys, datetime, os
from collections import OrderedDict
from urllib.parse import unquote, urlparse
from openpyxl import load_workbook

SRC = sys.argv[1] if len(sys.argv) > 1 else "table.xlsx"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORDER = ["Общий фон", "Зима", "Осень", "Весна", "Лето"]
SEASONS = {"зима", "осень", "весна", "лето", "общий фон"}
warn = []

def txt(c):
    return re.sub(r"\s+", " ", str(c.value)).strip() if c.value is not None else ""
def link(c):
    return c.hyperlink.target.strip() if c.hyperlink and c.hyperlink.target else ""
def is_file(u):  # ссылка на файл-изображение, а не на сайт/сокращатель
    return urlparse(u).netloc == "raw.githubusercontent.com"
def cap(s):
    return s[:1].upper() + s[1:]
def authors_clean(s):
    s = re.sub(r"\[[^\]]*\]", "", s).replace("(+)", "")
    s = re.sub(r"\s*[|+]\s*", ", ", s)
    return re.sub(r"\s+", " ", s).strip(" ,")
def rows(ws, start):
    for r, row in enumerate(ws.iter_rows(min_row=start), start=start):
        yield r, row
def only_b(row):
    return txt(row[1]) and all(not txt(c) and not link(c) for i, c in enumerate(row) if i != 1)

def add_missing(lst, name, reason, row, u="", **extra):
    m = {"name": name, "reason": reason, "row": row, **extra}
    if u: m["link"] = u
    lst.append(m)

wb = load_workbook(SRC)
pages = OrderedDict()

# ---------- Фоны ----------
def seasons(row, cols, headers, name):
    out = []
    for col in cols:
        t, h = txt(row[col - 1]).lower(), link(row[col - 1])
        if h and t in SEASONS: out.append({"label": cap(t), "url": h})
        elif h: warn.append(f"{name}: ссылка без подписи сезона ({headers[col]})"); out.append({"label": headers[col], "url": h})
        elif t in SEASONS: warn.append(f"{name}: указан сезон «{t}», но нет ссылки на файл")
    out.sort(key=lambda v: ORDER.index(v["label"]) if v["label"] in ORDER else 9)
    return out

items, miss, group = [], [], ""
for r, row in rows(wb["Фоны Актуальные"], 4):
    name = txt(row[1])
    if not name: continue
    if only_b(row): group = name.capitalize(); continue
    v = seasons(row, [4, 5, 6, 7], {4: "Зима", 5: "Осень", 6: "Весна", 7: "Лето"}, name)
    base = {"name": name, "section": "Актуальные", "group": group, "location": txt(row[2])}
    if v: items.append({**base, "authors": authors_clean(txt(row[7])), "variants": v})
    else: add_missing(miss, name, txt(row[8]) or "нет ссылки на файл", r, section="Актуальные", location=base["location"])
seen = OrderedDict()
for r, row in rows(wb["Фоны Архив старых"], 4):
    name = txt(row[1])
    if not name: continue
    v = seasons(row, [3, 4, 5, 6], {3: "Зима", 4: "Осень", 5: "Весна", 6: "Лето"}, name + " (архив)")
    if not v: add_missing(miss, name, "нет ссылки на файл", r, section="Архив старых"); continue
    key, a = (name, tuple(x["url"] for x in v)), authors_clean(txt(row[6]))
    if key in seen:
        seen[key]["authors"] = ", ".join(dict.fromkeys([x for x in (seen[key]["authors"] + ", " + a).split(", ") if x]))
        warn.append(f"{name} (архив): строка {r} — тот же файл, объединено")
    else: seen[key] = {"name": name, "section": "Архив старых", "group": "", "location": "", "authors": a, "variants": v}
items += list(seen.values())
pages["index"] = dict(title="Фоны", sort="az", variantFilter="Любой сезон", items=items, missing=miss)

# ---------- простые списки: имя + ссылка ----------
def simple(sheet, start, label="", author_col=None):
    out, ms = [], []
    for r, row in rows(wb[sheet], start):
        name = txt(row[1])
        if not name or only_b(row): continue
        u = link(row[2])
        if u and is_file(u):
            out.append({"name": name, "section": "", "group": "", "location": "",
                        "authors": authors_clean(txt(row[author_col])) if author_col else "",
                        "variants": [{"label": label, "url": u}]})
        else: add_missing(ms, name, "нет файла" if not u else "ссылка ведёт не на файл-изображение", r, u)
    return out, ms
i, m = simple("Шапки блогов", 4, author_col=3);        pages["headers"] = dict(title="Шапки блогов", sort="table", items=i, missing=m)
i, m = simple("Активная охота", 4);                    pages["hunt"] = dict(title="Активная охота", sort="table", items=i, missing=m)
i, m = simple("Медали Архив ивентовых", 4);            pages["medals"] = dict(title="Медали (архив ивентовых)", sort="table", items=i, missing=m)

# ---------- Боты (новый формат + старый) ----------
bots, ms, group = OrderedDict(), [], ""
for r, row in rows(wb["Боты Новый формат"], 4):
    name = txt(row[1])
    if not name: continue
    if only_b(row): group = name.capitalize(); continue
    vs = [{"label": lb, "url": link(row[c])} for c, lb in ((6, "200×300"), (2, "100×150")) if link(row[c]) and is_file(link(row[c]))]
    if txt(row[6]) and not link(row[6]): warn.append(f"Боты: «{name}» — вариант 200×300 отмечен «{txt(row[6])}», ссылки нет")
    if vs: bots[name] = {"name": name, "section": "", "group": group, "location": "", "authors": "", "variants": vs}
    else: add_missing(ms, name, "нет ссылки на файл", r)
for r, row in rows(wb["Боты"], 4):
    name, u = txt(row[1]), link(row[2])
    if not name or not u: continue
    v = {"label": "Старый формат", "url": u}
    if name in bots: bots[name]["variants"].append(v)
    else: bots[name] = {"name": name, "section": "", "group": "", "location": "", "authors": "", "variants": [v]}; warn.append(f"Боты: «{name}» есть только в старом формате")
pages["bots"] = dict(title="Боты", sort="table", variantFilter="Любой формат", items=list(bots.values()), missing=ms)

# ---------- Клоны ----------
cl, ms = [], []
for r, row in rows(wb["Клоны"], 4):
    name = txt(row[1])
    if not name: continue
    vs = []
    for col in (2, 3, 4, 5):
        u, t = link(row[col]), txt(row[col])
        if not u: continue
        lb = "Примеры" if col == 5 else ("Сводка" if t.lower() == "ссылка" else cap(t))
        if is_file(u): vs.append({"label": lb, "url": u})
        else: add_missing(ms, f"{name} — {lb.lower()}", "ссылка ведёт не на файл-изображение", r, u)
    if vs: cl.append({"name": name, "section": "", "group": "", "location": "", "authors": "", "variants": vs})
pages["clones"] = dict(title="Клоны", sort="table", items=cl, missing=ms)

# ---------- Статусы охоты ----------
st, ms = [], []
for r, row in rows(wb["Статусы Охота"], 4):
    name = txt(row[1])
    if not name: continue
    vs = [{"label": lb, "url": link(row[c])} for c, lb in ((2, "Птицы"), (3, "Зверьки"), (4, "Рыбы")) if link(row[c]) and is_file(link(row[c]))]
    if vs: st.append({"name": name, "section": "", "group": "", "location": "", "authors": "", "variants": vs})
    else: add_missing(ms, name, "нет ссылок на файлы", r)
pages["statuses"] = dict(title="Статусы охоты", sort="table", variantFilter="Любая добыча", items=st, missing=ms)

# ---------- запись ----------
for p in pages.values():
    for n, it in enumerate(p["items"], 1): it["id"] = n
with open(os.path.join(ROOT, "data.js"), "w", encoding="utf-8") as f:
    f.write("window.PAGES_BUILT = %s;\nwindow.PAGES = %s;\n" % (json.dumps(datetime.date.today().isoformat()), json.dumps(pages, ensure_ascii=False, indent=1)))

NAV = [("index", "Фоны"), ("headers", "Шапки блогов"), ("bots", "Боты"), ("medals", "Медали"), ("clones", "Клоны"), ("statuses", "Статусы охоты"), ("hunt", "Активная охота")]
tpl = open(os.path.join(ROOT, "tools", "page.tpl.html"), encoding="utf-8").read()
for key, p in pages.items():
    nav = "".join(f'<a href="{k}.html"{" class=on" if k == key else ""}>{t}</a>' for k, t in NAV)
    html = tpl.replace("{{KEY}}", key).replace("{{TITLE}}", p["title"]).replace("{{NAV}}", nav)
    open(os.path.join(ROOT, f"{key}.html"), "w", encoding="utf-8").write(html)

# ---------- отчёт ----------
for key, p in pages.items():
    files = [v["url"] for it in p["items"] for v in it["variants"]]
    print(f"{key:9} {p['title']:26} позиций: {len(p['items']):3}  файлов: {len(files):3}  без файла: {len(p['missing'])}  дублей URL: {len(files)-len(set(files))}")
    for m in p["missing"]: print(f"      — {m['name']} ({m['reason']}){' '+m['link'] if m.get('link') else ''}")
exts = {}
for p in pages.values():
    for it in p["items"]:
        for v in it["variants"]: e = unquote(urlparse(v["url"]).path).rsplit(".", 1)[-1].lower(); exts[e] = exts.get(e, 0) + 1
print("Расширения:", exts)
print("Предупреждения:"); [print("  ", w) for w in warn]
