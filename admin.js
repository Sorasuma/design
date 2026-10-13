(() => {
'use strict';
const $ = s => document.querySelector(s);
if (!window.DopLib) { document.body.insertAdjacentHTML('afterbegin', '<p class="st bad" style="padding:16px">Не загружен файл lib.js — загрузите в репозиторий сайта ВСЕ файлы из архива.</p>'); return; }
const L = DopLib, S = L.source();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEASONS = [['Общий фон', 'общий_фон'], ['Зима', 'зима'], ['Осень', 'осень'], ['Весна', 'весна'], ['Лето', 'лето']];
const staticItems = window.PAGES.index.items;
$('#names').innerHTML = [...new Set(staticItems.filter(i => i.section === 'Актуальные').map(i => i.name))].sort((a, b) => a.localeCompare(b, 'ru')).map(n => `<option value="${esc(n)}">`).join('');
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
const url = n => `/contents/${S.path}/${encodeURIComponent(n)}`;
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
const cat = { items: [], sha: '', exists: false, updated: '' };
const strip = i => ({ name: i.name, section: i.section || '', group: i.group || '', location: i.location || '', authors: i.authors || '', variants: i.variants.map(v => ({ label: v.label, url: v.url })) });
const imgFiles = () => current.filter(f => /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(f.name));
async function loadCat() {
  if (!token) return;
  const r = await api(url('catalog.json') + ref);
  if (r.status === 404) { // каталога ещё нет: черновик из таблицы + файлы папки (по названиям)
    cat.exists = false; cat.sha = ''; cat.updated = '';
    cat.items = JSON.parse(JSON.stringify(staticItems)).map(strip);
    L.merge(cat.items, imgFiles().map(f => ({ name: f.name, url: L.plainUrl(S, f.name), sha: f.sha })));
  } else if (r.ok) {
    const j = await r.json(); let data;
    try { data = JSON.parse(L.fromB64(j.content)); } catch (_) { setSt('#catStatus', 'Не удалось прочитать catalog.json (файл повреждён или слишком большой).', true); return; }
    cat.items = data.items; cat.sha = j.sha; cat.exists = true; cat.updated = data.updated || '';
  } else { setSt('#catStatus', 'Каталог: ' + await errMsg(r), true); return; }
  renderCat();
}
async function saveCat(message) {
  const body = { message, content: L.toB64(JSON.stringify({ updated: new Date().toISOString(), items: cat.items.map(strip) }, null, 1)), branch: S.branch, ...(cat.sha ? { sha: cat.sha } : {}) };
  const r = await api(url('catalog.json'), { method: 'PUT', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(r.status === 409 || r.status === 422 ? 'каталог изменили в другом месте — обновите страницу и повторите' : await errMsg(r));
  cat.sha = (await r.json()).content.sha; cat.exists = true; cat.updated = new Date().toISOString();
}
function renderCat() {
  setSt('#catStatus', cat.exists ? `Каталог на GitHub: ${cat.items.length} фонов, обновлён ${new Date(cat.updated).toLocaleString('ru')}. Сайт берёт данные отсюда.` : 'Каталога на GitHub ещё нет. Ниже — черновик из таблицы и файлов папки. Нажмите «Сохранить каталог на GitHub»: после этого сайт будет брать данные только из catalog.json.', cat.exists ? false : undefined);
  $('#catSave').hidden = cat.exists;
  const q = L.key($('#catQ').value), list = cat.items.map((it, i) => [it, i]).filter(([it]) => !q || L.key(it.name + it.location).includes(q));
  $('#catList').innerHTML = list.slice(0, 40).map(([it, i]) => `<li class="citem"><div><b>${esc(it.name)}</b> <span class="meta">${esc([it.section === 'Архив старых' ? 'Архив' : '', it.location].filter(Boolean).join(' · '))}</span></div><div>${it.variants.map((v, k) => `<span class="cvar">${esc(v.label || 'Файл')} <a href="${esc(v.url)}" target="_blank" rel="noopener">открыть</a> <button type="button" class="x" data-i="${i}" data-k="${k}" aria-label="Убрать вариант">✕</button></span>`).join('')}</div></li>`).join('') + (list.length > 40 ? `<li class="meta">Показано 40 из ${list.length} — уточните поиск.</li>` : '');
}
$('#catQ').addEventListener('input', renderCat);
$('#catSave').addEventListener('click', async () => {
  if (!(await checkAccess())) return;
  try { await saveCat('Каталог: создан из таблицы и папки'); renderCat(); setSt('#catStatus', 'Каталог сохранён. Сайт начнёт брать данные из него (изменения видны в течение минуты).', false); } catch (err) { setSt('#catStatus', 'Не удалось сохранить: ' + err.message, true); }
});
$('#catList').addEventListener('click', async e => {
  const b = e.target.closest('.x'); if (!b) return;
  const it = cat.items[+b.dataset.i], v = it.variants[+b.dataset.k];
  if (!confirm(`Убрать вариант «${v.label || 'Файл'}» у фона «${it.name}» из каталога?${it.variants.length === 1 ? ' Это единственный вариант — фон исчезнет с сайта.' : ''}`)) return;
  it.variants.splice(+b.dataset.k, 1); if (!it.variants.length) cat.items.splice(+b.dataset.i, 1);
  try { if (!cat.exists && !(await checkAccess())) return; await saveCat(`Каталог: убран вариант «${v.label}» у «${it.name}»`); setSt('#catStatus', 'Готово, каталог сохранён.', false); }
  catch (err) { setSt('#catStatus', 'Не удалось сохранить: ' + err.message, true); }
  renderCat();
});

/* ---------- строки загрузки ---------- */
const rows = [];
const ext = f => (f.name.match(/\.([a-z0-9]+)$/i) || [, 'png'])[1].toLowerCase().replace('jpeg', 'jpg');
const stem = n => n.replace(/\.[^.]+$/, '').toLowerCase();
const seaLabel = v => SEASONS.find(s => s[1] === v)[0];
function compute(r) {
  const safe = r.name.trim().replace(/[\\/:*?"<>|#%]/g, '').replace(/\s+/g, '_').replace(/\.+$/, '');
  r.filename = safe ? `${safe}_${r.season}.${ext(r.file)}` : '';
  const hit = (cat.items.length ? cat.items : staticItems).find(i => i.section === 'Актуальные' && L.key(i.name) === L.key(safe));
  const sea = seaLabel(r.season), single = hit && hit.variants.length === 1 && hit.variants[0].label === 'Общий фон' && r.season !== 'общий_фон';
  r.el.querySelector('.fn').textContent = r.filename || 'введите название';
  r.el.querySelector('.hint').textContent = !safe ? '' : single ? `У фона «${hit.name}» сейчас один общий фон — он будет заменён на «${sea}».` : hit ? `Фон «${hit.name}» есть в каталоге: вариант «${sea}» будет добавлен или заменён.` : 'Такого фона в каталоге нет — появится новая карточка в «Новые фоны». Проверьте написание.';
  refreshBtn();
}
function addFiles(list) {
  for (const f of list) {
    if (!/^image\//.test(f.type) && !/\.(png|jpe?g|gif|webp)$/i.test(f.name)) continue;
    const p = L.parse(f.name), r = { file: f, name: p.name, season: SEASONS.find(s => s[0] === p.label)[1], filename: '' };
    r.el = document.createElement('div'); r.el.className = 'urow';
    r.el.innerHTML = `<img class="pv" alt=""><div class="rf"><div class="line"><input class="nm" type="text" list="names" placeholder="Название фона" aria-label="Название фона"><select class="se" aria-label="Сезон">${SEASONS.map(s => `<option value="${s[1]}">${s[0]}</option>`).join('')}</select></div><div class="fn"></div><div class="hint meta"></div><div class="st"></div></div><button class="btn ghost rm" type="button" aria-label="Убрать">×</button>`;
    r.el.querySelector('.pv').src = URL.createObjectURL(f);
    r.el.querySelector('.nm').value = r.name; r.el.querySelector('.se').value = r.season;
    r.el.querySelector('.nm').addEventListener('input', e => { r.name = e.target.value; compute(r); });
    r.el.querySelector('.se').addEventListener('change', e => { r.season = e.target.value; compute(r); });
    r.el.querySelector('.rm').addEventListener('click', () => { rows.splice(rows.indexOf(r), 1); r.el.remove(); refreshBtn(); });
    rows.push(r); $('#rows').append(r.el); compute(r);
  }
}
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
async function uploadRow(r) {
  const g = await api(url(r.filename) + ref);
  let sha; if (g.ok) sha = (await g.json()).sha; else if (g.status !== 404) throw new Error(await errMsg(g));
  const res = await api(url(r.filename), { method: 'PUT', body: JSON.stringify({ message: `${sha ? 'Заменён' : 'Добавлен'} фон: ${r.filename}`, content: await b64(r.file), branch: S.branch, ...(sha ? { sha } : {}) }) });
  if (!res.ok) throw new Error(await errMsg(res));
  const newSha = (await res.json()).content.sha, pub = L.plainUrl(S, r.filename);
  L.upsert(cat.items, r.name.trim(), seaLabel(r.season), pub + '?v=' + newSha.slice(0, 7)); // ссылка в каталоге меняется при каждой замене — старая картинка из кэша не покажется
  // старый файл с тем же названием и сезоном, но другим расширением, удаляем — иначе будет два варианта одного сезона
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
  for (const r of rows.slice()) {
    const st = r.el.querySelector('.st'); st.className = 'st'; st.textContent = 'загрузка…';
    try { const res = await uploadRow(r); st.textContent = (res.warn ? '⚠ ' : '✓ ') + res.msg; st.className = 'st ' + (res.warn ? 'bad' : 'ok'); ok++; } catch (err) { st.textContent = '✗ ' + err.message; st.className = 'st bad'; }
  }
  let msg = ok ? `Файлов загружено: ${ok} из ${rows.length}.` : 'Ничего не загружено.', bad = !ok;
  if (ok) { try { await saveCat(`Каталог: обновлено фонов — ${ok}`); msg += ' Каталог сохранён — на сайте изменения появятся в течение минуты.'; } catch (err) { msg += ' Но каталог сохранить не удалось: ' + err.message; bad = true; } }
  setSt('#upStatus', msg, bad); refreshBtn(); await loadList(true); renderCat();
});

/* ---------- список файлов ---------- */
async function loadList(silent) {
  if (!token) { $('#flist').innerHTML = '<li class="meta">Введите токен, чтобы увидеть список.</li>'; return; }
  try {
    const r = await api(`/contents/${S.path}${ref}`);
    if (r.status === 404) { current = []; $('#flist').innerHTML = '<li class="meta">Папка пока пуста — она создастся при первой загрузке.</li>'; return; }
    if (!r.ok) throw new Error(await errMsg(r));
    current = (await r.json()).filter(x => x.type === 'file');
    $('#flist').innerHTML = current.length ? current.map(f => `<li><a href="${esc(f.download_url)}" target="_blank" rel="noopener">${esc(f.name)}</a> <span class="meta">${Math.round(f.size / 1024)} КБ</span> <button class="btn ghost del" type="button" data-name="${esc(f.name)}" aria-label="Удалить ${esc(f.name)}">Удалить</button></li>`).join('') : '<li class="meta">Папка пуста.</li>';
  } catch (err) { if (!silent) $('#flist').innerHTML = `<li class="st bad">${esc(err.message)}</li>`; }
}
$('#reload').addEventListener('click', async () => { await loadList(); await loadCat(); });
$('#flist').addEventListener('click', async e => {
  const b = e.target.closest('.del'); if (!b) return;
  const f = current.find(c => c.name === b.dataset.name); if (!f || !confirm(`Удалить файл «${f.name}» из папки? Фон пропадёт с сайта.`)) return;
  b.disabled = true;
  const r = await api(url(f.name), { method: 'DELETE', body: JSON.stringify({ message: `Удалён файл: ${f.name}`, sha: f.sha, branch: S.branch }) });
  if (!r.ok) { alert('Не удалось удалить: ' + await errMsg(r)); b.disabled = false; return; }
  if (cat.exists) { // варианты каталога, указывающие на удалённый файл, убираем
    const u = L.dec(L.plainUrl(S, f.name)); let n = 0;
    cat.items.forEach(it => { const before = it.variants.length; it.variants = it.variants.filter(v => L.dec(v.url) !== u); n += before - it.variants.length; });
    if (n) { cat.items = cat.items.filter(it => it.variants.length); try { await saveCat(`Каталог: убран удалённый файл ${f.name}`); } catch (err) { alert('Файл удалён, но каталог сохранить не удалось: ' + err.message); } }
  }
  await loadList(); renderCat();
});
refreshBtn(); if (token) loadList().then(loadCat);
})();
