# Каталог фонов (Design Archive)

Статический сайт. Страницы: `index.html` (фоны), `headers.html`, `bots.html`, `medals.html`, `clones.html`, `statuses.html`, `hunt.html`. Общие файлы: `style.css`, `script.js`, `data.js`.
Изображения не хранятся в проекте — берутся напрямую по ссылкам из таблицы (raw.githubusercontent.com).

## Запуск локально
Откройте `index.html` двойным кликом или запустите `python3 -m http.server` и зайдите на http://localhost:8000.

## Обновление данных из таблицы
    pip install openpyxl
    python3 tools/build_data.py путь/к/таблице.xlsx
Скрипт перечитает названия и гиперссылки ячеек, перезапишет `data.js` и все `*.html` (по шаблону `tools/page.tpl.html`) и выведет отчёт
(позиции без файла, неполные строки, дубли). Лист «Костюмы не акт» пропускается намеренно.

## Публикация на GitHub Pages
1. Создайте репозиторий (например, `design-catalog`), загрузите все файлы из этой папки в корень (включая `.nojekyll` и `data.js`).
2. Settings → Pages → Source: «Deploy from a branch», Branch: `main`, папка `/ (root)` → Save.
3. Через 1–2 минуты сайт откроется на https://ВАШ-ЛОГИН.github.io/design-catalog/
