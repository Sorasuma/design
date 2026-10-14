(async () => {
'use strict';
const $ = s => document.querySelector(s);
if (!window.DopLib) await new Promise(res => { const sc = document.createElement('script'); sc.src = 'lib.js'; sc.onload = res; sc.onerror = res; document.head.append(sc); });
const fail = m => document.body.insertAdjacentHTML('afterbegin', `<p class="st bad" style="padding:16px">${m}</p>`);
if (!window.DopLib) return fail('Не удалось загрузить lib.js — он должен лежать в корне репозитория рядом с admin.html.');
if (!$('#rpFile') || !window.PAGES) return fail('Файл admin.html или data.js устарел — загрузите свежие admin.html и data.js из архива.');
const L = DopLib, S = L.source();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEASONS = [['Общий фон', 'общий_фон'], ['Зима', 'зима'], ['Осень', 'осень'], ['Весна', 'весна'], ['Лето', 'лето']];
const staticItems = window.PAGES.index.items;
const KEYS = ['index', 'headers', 'bots', 'medals', 'clones', 'statuses', 'hunt'].filter(k => window.PAGES[k]);
const title = k => window.PAGES[k].title;
let upPage = 'index', viewKey = 'index';
$('#upPage').innerHTML = $('#catPage').innerHTML = KEYS.map(k => `<option value="${k}">${esc(title(k))}</option>`).join('');
$('#target').textContent = `${S.owner}/${S.repo}, папка ${S.path}`;

/* ---------- токен и запросы ---------- */
const TK = 'gh-admin-token';
let token = '';
try { token = sessionStorage.getItem(TK) || localStorage.getItem(TK) || ''; } catch (_) { /* хранилище недоступно */ }
$('#token').value = token; $('#remember').checked = (() => { try { return !!localStorage.getItem(TK); } catch (_) { return false; } })();
function saveToken() {
  token = $('#token').value.trim();
  try { sessionStorage.removeItem(TK); localStorage.removeItem(TK); if (token) ($('#remember').checked ? localStorage : sessionStorage).setItem(TK, token); } catch (_) { /* останется только до закрытия вкладки */ }
}
const setSt = (sel, msg, bad) => { const e = $(sel); e.textContent = msg; e.className = 'st ' + (bad === undefined ? '' : bad ? 'bad' : 'ok'); };
const base = `https://api.github.com/repos/${S.owner}/${S.repo}`;
const api = (p, o = {}) => fetch((p.startsWith('http') ? '' : base) + p, { ...o, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + token, ...(o.body ? { 'Content-Type': 'application/json' } : {}) } });
const url = n => `/contents/${S.path}/${n.split('/').map(encodeURIComponent).join('/')}`; // n может быть «подпапка/файл»
const ref = '?ref=' + encodeURIComponent(S.branch);
async function errMsg(r) {
  let m = ''; try { m = (await r.json()).message || ''; } catch (_) { /* не JSON */ }
  if (r.status === 401) return `токен не подходит или истёк (GitHub: «${m || 401}»)`;
  if (r.status === 403 || r.status === 404) return `нет права записи — GitHub ответил «${m || r.status}». Частые причины: токен выдан не на этот репозиторий или без Contents: Read and write; вы не владелец репозитория «${S.owner}/${S.repo}» (тогда нужен классический токен со scope public_repo); ветки «${S.branch}» не существует.`;
  return `ошибка GitHub ${r.status}${m ? ': ' + m : ''}`;
}
async function checkAccess() {
  saveToken(); if (!token) { setSt('#authStatus', 'Введите токен.', true); return false; }
  try {
    const r = await api(''); if (!r.ok) { setSt('#authStatus', 'Нет доступа: ' + await errMsg(r), true); return false; }
    const j = await r.json(), scopes = r.headers.get('x-oauth-scopes'); // заголовок есть только у классических токенов
    let who = ''; try { const ur = await api('https://api.github.com/user'); if (ur.ok) who = (await ur.json()).login || ''; } catch (_) { /* не критично */ }
    if (scopes !== null && !/(^|,\s*)(repo|public_repo)(,|$)/.test(scopes)) { setSt('#authStatus', `У классического токена нет разрешения public_repo (сейчас: ${scopes || 'пусто'}). Создайте токен с галочкой public_repo.`, true); return false; }
    if (j.permissions && !j.permissions.push) { setSt('#authStatus', 'Токен может только читать репозиторий — нужно право записи (Contents: Read and write).', true); return false; }
    const other = who && who.toLowerCase() !== S.owner.toLowerCase();
    setSt('#authStatus', `Доступ есть: ${j.full_name}${who ? `, вы вошли как ${who}` : ''}.` + (j.private ? ' ⚠ Репозиторий приватный: посетители сайта не смогут увидеть изображения — сделайте его публичным (Settings → General → Danger Zone → Change visibility).' : '') + (other ? ' Вы не владелец репозитория: если загрузка не пройдёт, используйте классический токен со scope public_repo — fine-grained токены не работают с чужими репозиториями.' : ''), !!j.private);
    return true;
  } catch (_) { setSt('#authStatus', 'Нет связи с GitHub.', true); return false; }
}
$('#check').addEventListener('click', async () => { if (await checkAccess()) { await loadList(); await loadCat(); } });
$('#logout').addEventListener('click', () => { $('#token').value = ''; saveToken(); setSt('#authStatus', 'Токен удалён из браузера.'); refreshBtn(); });
$('#token').addEventListener('input', () => { saveToken(); refreshBtn(); });

/* ---------- каталог (catalog.json) ---------- */
const cat = { items: [], pages: {}, sha: '', exists: false, updated: '', dirty: false }; // items — фоны (index), pages[ключ] — остальные разделы
const strip = i => ({ name: i.name, section: i.section || '', group: i.group || '', location: i.location || '', authors: i.authors || '', variants: i.variants.map(v => ({ label: v.label, url: v.url })) });
const imgFiles = () => current.filter(f => !f.name.includes('/') && /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(f.name)); // только корень папки — это фоны
const itemsOf = k => k === 'index' ? cat.items : (cat.pages[k] || window.PAGES[k].items); // для просмотра: каталог или данные таблицы
const ensurePage = k => { // перед изменением: раздел копируется из таблицы в каталог (один раз), порядок позиций сохраняется
  if (k === 'index') return cat.items;
  if (!cat.pages[k]) cat.pages[k] = JSON.parse(JSON.stringify(window.PAGES[k].items)).map(strip);
  return cat.pages[k];
};
function upsertPage(k, name, label, u, ex) {
  const list = ensurePage(k), kk = L.key(name);
  let it = list.find(i => L.key(i.name) === kk);
  if (!it) { it = { name, section: '', group: (ex.group || '').trim(), location: (ex.location || '').trim(), authors: (ex.authors || '').trim(), variants: [] }; list.push(it); }
  const old = it.variants.find(v => (v.label || '') === label);
  if (old) old.url = u; else it.variants.push({ label, url: u });
  return it;
}
async function loadCat() {
  if (!token) return;
  const r = await api(url('catalog.json') + ref);
  if (r.status === 404) { // каталога ещё нет: черновик из таблицы + файлы папки (по названиям)
    cat.exists = false; cat.sha = ''; cat.updated = ''; cat.pages = {};
    cat.items = JSON.parse(JSON.stringify(staticItems)).map(strip);
    L.merge(cat.items, imgFiles().map(f => ({ name: f.name, url: L.plainUrl(S, f.name), sha: f.sha })));
  } else if (r.ok) {
    const j = await r.json(); let data;
    try { data = JSON.parse(L.fromB64(j.content)); } catch (_) { setSt('#catStatus', 'Не удалось прочитать catalog.json (файл повреждён или слишком большой).', true); return; }
    cat.items = data.items; cat.pages = data.pages || {}; cat.sha = j.sha; cat.exists = true; cat.updated = data.updated || '';
    const t = L.merge(cat.items, imgFiles().map(f => ({ name: f.name, url: L.plainUrl(S, f.name), sha: f.sha }))); // файлы, добавленные в папку вручную
    cat.dirty = t.size > 0 || t.refreshed > 0;
  } else { setSt('#catStatus', 'Каталог: ' + await errMsg(r), true); return; }
  renderCat();
}
async function saveCat(message) {
  const body = { message, content: L.toB64(JSON.stringify({ updated: new Date().toISOString(), items: cat.items.map(strip), ...(Object.keys(cat.pages).length ? { pages: Object.fromEntries(Object.entries(cat.pages).map(([k, v]) => [k, v.map(strip)])) } : {}) }, null, 1)), branch: S.branch, ...(cat.sha ? { sha: cat.sha } : {}) };
  const r = await api(url('catalog.json'), { method: 'PUT', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(r.status === 409 || r.status === 422 ? 'каталог изменили в другом месте — обновите страницу и повторите' : await errMsg(r));
  cat.sha = (await r.json()).content.sha; cat.exists = true; cat.dirty = false; cat.updated = new Date().toISOString();
}
function renderCat() {
  setSt('#catStatus', !cat.exists ? 'Каталога на GitHub ещё нет. Ниже — черновик из таблицы и файлов папки. Нажмите «Сохранить каталог на GitHub»: после этого сайт будет брать данные из catalog.json.' : cat.dirty ? 'В папке есть файлы, которых нет в каталоге (или они обновились). Сайт их уже показывает; нажмите «Сохранить каталог на GitHub», чтобы записать ссылки в каталог.' : `Каталог на GitHub: ${cat.items.length} фонов, обновлён ${new Date(cat.updated).toLocaleString('ru')}.`, !cat.exists || cat.dirty ? undefined : false);
  $('#catSave').hidden = cat.exists && !cat.dirty;
  $('#catPageNote').textContent = viewKey === 'index' ? '' : (cat.pages[viewKey] ? 'Этот раздел ведётся через catalog.json — всё, что здесь изменено, сразу видно на сайте.' : 'Пока показаны данные из таблицы (data.js). После первой загрузки или удаления раздел перейдёт в catalog.json.');
  const q = L.key($('#catQ').value), list = itemsOf(viewKey).map((it, i) => [it, i]).filter(([it]) => !q || L.key(it.name + it.location).includes(q));
  $('#catList').innerHTML = list.slice(0, 40).map(([it, i]) => `<li class="citem"><div><b>${esc(it.name)}</b> <span class="meta">${esc([it.section === 'Архив старых' ? 'Архив' : '', it.location].filter(Boolean).join(' · '))}</span></div><div>${it.variants.map((v, k) => `<span class="cvar">${esc(v.label || 'Файл')} <a href="${esc(v.url)}" target="_blank" rel="noopener">открыть</a> ${viewKey !== 'index' || it.section === 'Актуальные' ? `<button type="button" class="rp" data-i="${i}" data-k="${k}">Заменить</button>` : ''}<button type="button" class="x" data-i="${i}" data-k="${k}" aria-label="Убрать вариант">✕</button></span>`).join('')}</div></li>`).join('') + (list.length > 40 ? `<li class="meta">Показано 40 из ${list.length} — уточните поиск.</li>` : '');
}
$('#catQ').addEventListener('input', renderCat);
$('#catPage').addEventListener('change', e => { viewKey = e.target.value; renderCat(); });
let pendingRp = null;
$('#rpFile').addEventListener('change', async e => { // «Заменить» у варианта: выбранный файл заменяет именно этот вариант, ссылка в каталоге обновляется
  const f = e.target.files[0]; e.target.value = ''; if (!f || !pendingRp) return;
  const key = viewKey, it0 = itemsOf(key)[pendingRp.i], v0 = it0.variants[pendingRp.k];
  if (!confirm(`Заменить вариант «${v0.label || 'основной'}» у позиции «${it0.name}» файлом «${f.name}»?`)) return;
  setSt('#catStatus', 'Загрузка…'); let note = null;
  try {
    if (!(await checkAccess())) return;
    await loadList(true);
    const it = ensurePage(key)[pendingRp.i], v = it.variants[pendingRp.k]; // после ensurePage — уже объект из каталога
    const r = { file: f, name: it.name, page: key, lbl: v.label || '', group: '', location: '', authors: '' }; r.filename = fileFor(key, r.name, r.lbl, f);
    const res = await uploadRow(r); await saveCat(`Каталог: заменён вариант «${v.label || 'основной'}» у «${it.name}»`);
    note = [(res.warn ? '⚠ ' : '✓ ') + res.msg, !!res.warn];
  } catch (err) { note = ['Не удалось заменить: ' + err.message, true]; }
  await loadList(true); renderCat(); if (note) setSt('#catStatus', ...note);
});
$('#catSave').addEventListener('click', async () => {
  if (!(await checkAccess())) return;
  try { await saveCat('Каталог: создан из таблицы и папки'); renderCat(); setSt('#catStatus', 'Каталог сохранён. Сайт начнёт брать данные из него (изменения видны в течение минуты).', false); } catch (err) { setSt('#catStatus', 'Не удалось сохранить: ' + err.message, true); }
});
$('#catList').addEventListener('click', async e => {
  const rp = e.target.closest('.rp');
  if (rp) { pendingRp = { i: +rp.dataset.i, k: +rp.dataset.k }; $('#rpFile').click(); return; }
  const b = e.target.closest('.x'); if (!b) return;
  const it = itemsOf(viewKey)[+b.dataset.i], v = it.variants[+b.dataset.k];
  const folder = L.rawBase(S) + '/', u0 = v.url.split('?')[0], fname = u0.startsWith(folder) ? decodeURIComponent(u0.slice(folder.length)) : '', file = fname && current.find(c => c.name === fname);
  if (!confirm(`Убрать вариант «${v.label || 'Файл'}» у фона «${it.name}»?${file ? ` Файл «${file.name}» тоже будет удалён из папки.` : ''}${it.variants.length === 1 ? ' Это единственный вариант — фон исчезнет с сайта.' : ''}`)) return;
  const lst = ensurePage(viewKey), it2 = lst[+b.dataset.i];
  it2.variants.splice(+b.dataset.k, 1); if (!it2.variants.length) lst.splice(+b.dataset.i, 1);
  let note = null;
  try {
    if (!cat.exists && !(await checkAccess())) return;
    await saveCat(`Каталог: убран вариант «${v.label}» у «${it.name}»`);
    if (file) await api(url(file.name), { method: 'DELETE', body: JSON.stringify({ message: `Удалён файл: ${file.name}`, sha: file.sha, branch: S.branch }) });
    note = ['Готово: вариант убран, каталог сохранён.', false]; await loadList(true);
  } catch (err) { note = ['Не удалось сохранить: ' + err.message, true]; }
  renderCat(); if (note) setSt('#catStatus', ...note);
});

/* ---------- строки загрузки ---------- */
const rows = [];
const ext = f => (f.name.match(/\.([a-z0-9]+)$/i) || [, 'png'])[1].toLowerCase().replace('jpeg', 'jpg');
const stem = n => n.replace(/\.[^.]+$/, '').toLowerCase();
const BAD = /[\\/:*?"<>|#%]/g;
const safeName = n => n.trim().replace(BAD, '').replace(/\s+/g, '_').replace(/\.+$/, '');
const seaLabel = v => SEASONS.find(s => s[1] === v)[0];
const seaSlug = l => (SEASONS.find(s => s[0] === l) || SEASONS[0])[1];
// Фоны: dop/Название_сезон.jpg (как раньше). Остальные разделы: dop/<раздел>/Название[_вариант].jpg
function fileFor(page, name, label, file) {
  const s = safeName(name); if (!s) return '';
  if (page === 'index') return `${s}_${seaSlug(label)}.${ext(file)}`;
  return `${page}/${s}${label ? '_' + label.trim().replace(BAD, '').replace(/\s+/g, '_') : ''}.${ext(file)}`;
}
const labelOf = r => upPage === 'index' ? seaLabel(r.season) : (r.label || '').trim();
function fillLists() {
  const items = itemsOf(upPage);
  $('#names').innerHTML = [...new Set(items.filter(i => upPage !== 'index' || i.section === 'Актуальные').map(i => i.name))].sort((a, b) => a.localeCompare(b, 'ru')).map(n => `<option value="${esc(n)}">`).join('');
  $('#labels').innerHTML = [...new Set(items.flatMap(i => i.variants.map(v => v.label)).filter(Boolean))].map(n => `<option value="${esc(n)}">`).join('');
  $('#upNote').textContent = upPage === 'index'
    ? 'Фоны: название + сезон. Файл сохраняется как Название_сезон.расширение.'
    : `«${title(upPage)}»: название и (необязательно) вариант — например формат или сезон. Файл сохраняется в подпапку ${S.path}/${upPage}. Вариант можно оставить пустым.`;
}
function compute(r) {
  const label = labelOf(r), safe = safeName(r.name);
  r.filename = fileFor(upPage, r.name, label, r.file);
  const hit = itemsOf(upPage).find(i => (upPage !== 'index' || i.section === 'Актуальные') && L.key(i.name) === L.key(safe));
  const single = upPage === 'index' && hit && hit.variants.length === 1 && hit.variants[0].label === 'Общий фон' && r.season !== 'общий_фон';
  r.el.querySelector('.fn').textContent = r.filename || 'введите название';
  r.el.querySelector('.se').hidden = upPage !== 'index'; r.el.querySelector('.lb').hidden = upPage === 'index';
  r.el.querySelector('.hint').textContent = !safe ? '' : single ? `У фона «${hit.name}» сейчас один общий фон — он будет заменён на «${label}».` : hit ? `«${hit.name}» уже есть в каталоге: вариант «${label || 'основной'}» будет добавлен или заменён.` : `Такой позиции в разделе «${title(upPage)}» нет — будет создана новая карточка. Поля ниже (группа, локация, авторы) необязательны и нужны только для новой позиции.`;
  refreshBtn();
}
function addFiles(list) {
  for (const f of list) {
    if (!/^image\//.test(f.type) && !/\.(png|jpe?g|gif|webp)$/i.test(f.name)) continue;
    const p = L.parse(f.name), plain = f.name.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim();
    const r = { file: f, name: upPage === 'index' ? p.name : plain, season: SEASONS.find(s => s[0] === p.label)[1], label: '', filename: '' };
    r.el = document.createElement('div'); r.el.className = 'urow';
    r.el.innerHTML = `<img class="pv" alt=""><div class="rf"><div class="line"><input class="nm" type="text" list="names" placeholder="Название" aria-label="Название"><select class="se" aria-label="Сезон">${SEASONS.map(s => `<option value="${s[1]}">${s[0]}</option>`).join('')}</select><input class="lb" type="text" list="labels" placeholder="Вариант (необязательно)" aria-label="Вариант"></div><div class="line more"><input class="gr" type="text" placeholder="Территория / группа" aria-label="Группа"><input class="lc" type="text" placeholder="Локация" aria-label="Локация"><input class="au" type="text" placeholder="Авторы" aria-label="Авторы"></div><div class="fn"></div><div class="hint meta"></div><div class="st"></div></div><button class="btn ghost rm" type="button" aria-label="Убрать">×</button>`;
    r.el.querySelector('.pv').src = URL.createObjectURL(f);
    r.el.querySelector('.nm').value = r.name; r.el.querySelector('.se').value = r.season;
    r.el.querySelector('.nm').addEventListener('input', e => { r.name = e.target.value; compute(r); });
    r.el.querySelector('.se').addEventListener('change', e => { r.season = e.target.value; compute(r); });
    r.el.querySelector('.lb').addEventListener('input', e => { r.label = e.target.value; compute(r); });
    r.el.querySelector('.gr').addEventListener('input', e => { r.group = e.target.value; });
    r.el.querySelector('.lc').addEventListener('input', e => { r.location = e.target.value; });
    r.el.querySelector('.au').addEventListener('input', e => { r.authors = e.target.value; });
    r.el.querySelector('.rm').addEventListener('click', () => { rows.splice(rows.indexOf(r), 1); r.el.remove(); refreshBtn(); });
    rows.push(r); $('#rows').append(r.el); compute(r);
  }
}
$('#upPage').addEventListener('change', e => { upPage = e.target.value; fillLists(); rows.forEach(r => { if (upPage === 'index') { const p = L.parse(r.file.name); r.name = p.name; r.season = SEASONS.find(s => s[0] === p.label)[1]; } else { r.name = r.file.name.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim(); } r.el.querySelector('.nm').value = r.name; r.el.querySelector('.se').value = r.season; compute(r); }); });
const refreshBtn = () => { $('#upload').disabled = !token || !rows.length || rows.some(r => !r.filename); };
$('#drop').addEventListener('click', () => $('#files').click());
$('#drop').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#files').click(); } });
$('#files').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
['dragover', 'dragenter'].forEach(t => $('#drop').addEventListener(t, e => { e.preventDefault(); $('#drop').classList.add('over'); }));
['dragleave', 'drop'].forEach(t => $('#drop').addEventListener(t, e => { e.preventDefault(); $('#drop').classList.remove('over'); }));
$('#drop').addEventListener('drop', e => addFiles(e.dataTransfer.files));

/* ---------- загрузка ---------- */
const b64 = f => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = no; fr.readAsDataURL(f); });
let current = [];
const probe = u => new Promise(ok => { const im = new Image(); im.onload = () => ok(true); im.onerror = () => ok(false); im.src = u + '?check=' + Date.now(); });
async function visible(u) { for (let i = 0; i < 3; i++) { if (await probe(u)) return true; await new Promise(r => setTimeout(r, 1500)); } return false; }
// r: { file, name, page, lbl, filename, group?, location?, authors? }
async function uploadRow(r) {
  const g = await api(url(r.filename) + ref);
  let sha; if (g.ok) sha = (await g.json()).sha; else if (g.status !== 404) throw new Error(await errMsg(g));
  const res = await api(url(r.filename), { method: 'PUT', body: JSON.stringify({ message: `${sha ? 'Заменён' : 'Добавлен'} файл (${title(r.page)}): ${r.filename}`, content: await b64(r.file), branch: S.branch, ...(sha ? { sha } : {}) }) });
  if (!res.ok) throw new Error(await errMsg(res));
  const newSha = (await res.json()).content.sha, pub = L.plainUrl(S, r.filename), full = pub + '?v=' + newSha.slice(0, 7); // ссылка меняется при каждой замене — старая картинка из кэша не покажется
  if (r.page === 'index') {
    const existed = cat.items.some(i => i.section === 'Актуальные' && L.key(i.name) === L.key(r.name));
    const it = L.upsert(cat.items, r.name.trim(), r.lbl, full);
    if (it && !existed) { it.group = (r.group || '').trim(); if ((r.location || '').trim()) it.location = r.location.trim(); it.authors = (r.authors || '').trim(); }
  } else upsertPage(r.page, r.name.trim(), r.lbl, full, r);
  // старый файл с тем же названием, но другим расширением, удаляем — иначе будет два варианта одного и того же
  const old = current.filter(c => stem(c.name) === stem(r.filename) && c.name.toLowerCase() !== r.filename.toLowerCase());
  for (const o of old) await api(url(o.name), { method: 'DELETE', body: JSON.stringify({ message: `Удалён старый файл: ${o.name}`, sha: o.sha, branch: S.branch }) });
  const done = (sha ? 'заменён' : 'загружен') + (old.length ? ` (старый ${old.map(o => o.name.split('.').pop()).join(', ')} удалён)` : '');
  // проверяем, что файл открывается по публичной ссылке (как его увидят посетители сайта, без токена)
  return await visible(pub) ? { msg: done + ' и открывается по публичной ссылке' } : { warn: true, msg: done + ', но по публичной ссылке не открывается: репозиторий приватный или неверно указаны ветка/папка в config.js. Подождите минуту и проверьте ссылку: ' + pub };
}
$('#upload').addEventListener('click', async () => {
  if (!(await checkAccess())) return;
  await loadList(true); await loadCat();
  $('#upload').disabled = true; let ok = 0;
  const page = upPage;
  for (const r of rows.slice()) {
    r.page = page; r.lbl = labelOf(r); r.filename = fileFor(page, r.name, r.lbl, r.file);
    const st = r.el.querySelector('.st'); st.className = 'st'; st.textContent = 'загрузка…';
    try { const res = await uploadRow(r); st.textContent = (res.warn ? '⚠ ' : '✓ ') + res.msg; st.className = 'st ' + (res.warn ? 'bad' : 'ok'); ok++; r.done = true; } catch (err) { st.textContent = '✗ ' + err.message; st.className = 'st bad'; }
  }
  let msg = ok ? `Файлов загружено: ${ok} из ${rows.length}.` : 'Ничего не загружено.', bad = !ok;
  if (ok) { try { await saveCat(`Каталог (${title(page)}): добавлено/обновлено — ${ok}`); msg += ' Каталог сохранён — на сайте изменения появятся в течение минуты.'; } catch (err) { msg += ' Но каталог сохранить не удалось: ' + err.message; bad = true; } }
  const doneRows = rows.filter(r => r.done); // загруженные строки убираем из списка (с результатом в статусе ниже), чтобы не отправить их повторно
  doneRows.forEach(r => { rows.splice(rows.indexOf(r), 1); r.el.remove(); });
  setSt('#upStatus', msg, bad); refreshBtn(); await loadList(true); fillLists(); renderCat();
});

/* ---------- список файлов ---------- */
async function loadList(silent) {
  if (!token) { $('#flist').innerHTML = '<li class="meta">Введите токен, чтобы увидеть список.</li>'; return; }
  try {
    const r = await api(`/contents/${S.path}${ref}`);
    if (r.status === 404) { current = []; $('#flist').innerHTML = '<li class="meta">Папка пока пуста — она создастся при первой загрузке.</li>'; return; }
    if (!r.ok) throw new Error(await errMsg(r));
    current = (await r.json()).filter(x => x.type === 'file');
    for (const k of KEYS.filter(k => k !== 'index')) { // файлы остальных разделов лежат в подпапках
      try { const sr = await api(`/contents/${S.path}/${k}${ref}`); if (sr.ok) current.push(...(await sr.json()).filter(x => x.type === 'file').map(x => ({ ...x, name: `${k}/${x.name}` }))); } catch (_) { /* подпапки может не быть */ }
    }
    $('#flist').innerHTML = current.length ? current.map(f => `<li><a href="${esc(f.download_url)}" target="_blank" rel="noopener">${esc(f.name)}</a> <span class="meta">${Math.round(f.size / 1024)} КБ</span> <button class="btn ghost del" type="button" data-name="${esc(f.name)}" aria-label="Удалить ${esc(f.name)}">Удалить</button></li>`).join('') : '<li class="meta">Папка пуста.</li>';
  } catch (err) { if (!silent) $('#flist').innerHTML = `<li class="st bad">${esc(err.message)}</li>`; }
}
$('#reload').addEventListener('click', async () => { await loadList(); await loadCat(); });
$('#flist').addEventListener('click', async e => {
  const b = e.target.closest('.del'); if (!b) return;
  const f = current.find(c => c.name === b.dataset.name); if (!f || !confirm(`Удалить файл «${f.name}» из папки? Позиция пропадёт с сайта, если это её единственный вариант.`)) return;
  b.disabled = true;
  const r = await api(url(f.name), { method: 'DELETE', body: JSON.stringify({ message: `Удалён файл: ${f.name}`, sha: f.sha, branch: S.branch }) });
  if (!r.ok) { alert('Не удалось удалить: ' + await errMsg(r)); b.disabled = false; return; }
  if (cat.exists) { // варианты каталога, указывающие на удалённый файл, убираем
    const u = L.dec(L.plainUrl(S, f.name)); let n = 0;
    const prune = list => { list.forEach(it => { const before = it.variants.length; it.variants = it.variants.filter(v => L.dec(v.url) !== u); n += before - it.variants.length; }); return list.filter(it => it.variants.length); };
    cat.items = prune(cat.items); Object.keys(cat.pages).forEach(k => { cat.pages[k] = prune(cat.pages[k]); });
    if (n) { try { await saveCat(`Каталог: убран удалённый файл ${f.name}`); } catch (err) { alert('Файл удалён, но каталог сохранить не удалось: ' + err.message); } }
  }
  await loadList(); renderCat();
});
fillLists(); refreshBtn(); if (token) loadList().then(loadCat);
})();
