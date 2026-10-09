# Каталог фонов (Design Archive)

Статический сайт. Страницы: `index.html` (фоны), `headers.html`, `bots.html`, `medals.html`, `clones.html`, `statuses.html`, `hunt.html`. Общие файлы: `style.css`, `script.js`, `data.js`.
Изображения не хранятся в проекте — берутся напрямую по ссылкам из таблицы (raw.githubusercontent.com).

## Обновление данных из таблицы
    pip install openpyxl
    python3 tools/build_data.py путь/к/таблице.xlsx
Скрипт перечитает названия и гиперссылки ячеек, перезапишет `data.js` и все `*.html` (по шаблону `tools/page.tpl.html`) и выведет отчёт
(позиции без файла, неполные строки, дубли). Лист «Костюмы не акт» пропускается намеренно.

## Сайт создан для Содружества
