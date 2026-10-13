(() => {
'use strict';
const S = window.DOP_SOURCE, $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const key = s => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[\s_-]+/g, '');
const SEASONS = [['Общий фон', 'общий_фон'], ['Зима', 'зима'], ['Осень', 'осень'], ['Весна', 'весна'], ['Лето', 'лето']];
const DOP_RE = /^(.*?)[_\s-]+(зима|осень|весна|лето|общий[_\s-]?фон|общий)$/i;
const items = window.PAGES.index.items.filter(i => i.section === 'Актуальные');
$('#names').innerHTML = [...new Set(items.map(i => i.name))].sort((a, b) => a.localeCompare(b, 'ru')).map(n => `<option value="${esc(n)}">`).join('');
$('#target').textContent = `${S.owner}/${S.repo}, папка ${S.path}`;

/* ---------- токен ---------- */
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
    setSt('#authStatus', `Доступ есть: ${j.full_name}${who ? `, вы вошли как ${who}` : ''}.` + (other ? ` Вы не владелец репозитория: если загрузка не пройдёт, используйте классический токен со scope public_repo — fine-grained токены не работают с чужими репозиториями.` : ''), false);
    return true;
  } catch (_) { setSt('#authStatus', 'Нет связи с GitHub.', true); return false; }
}
$('#check').addEventListener('click', async () => { if (await checkAccess()) loadList(); });
$('#logout').addEventListener('click', () => { $('#token').value = ''; saveToken(); setSt('#authStatus', 'Токен удалён из браузера.'); refreshBtn(); });
$('#token').addEventListener('input', () => { saveToken(); refreshBtn(); });

/* ---------- строки загрузки ---------- */
const rows = [];
const ext = f => (f.name.match(/\.([a-z0-9]+)$/i) || [, 'png'])[1].toLowerCase().replace('jpeg', 'jpg');
const stem = n => n.replace(/\.[^.]+$/, '').toLowerCase();
function compute(r) {
  const safe = r.name.trim().replace(/[\\/:*?"<>|#%]/g, '').replace(/\s+/g, '_').replace(/\.+$/, '');
  r.filename = safe ? `${safe}_${r.season}.${ext(r.file)}` : '';
  const hit = items.find(i => key(i.name) === key(safe));
  const sea = SEASONS.find(s => s[1] === r.season)[0];
  r.el.querySelector('.fn').textContent = r.filename || 'введите название';
  r.el.querySelector('.hint').textContent = !safe ? '' : hit ? `Фон «${hit.name}» есть в каталоге: вариант «${sea}» будет добавлен или заменён.` : 'Такого фона в каталоге нет — появится новая карточка в «Новые фоны». Проверьте написание.';
  refreshBtn();
}
function addFiles(list) {
  for (const f of list) {
    if (!/^image\//.test(f.type) && !/\.(png|jpe?g|gif|webp)$/i.test(f.name)) continue;
    const m = f.name.replace(/\.[^.]+$/, '').match(DOP_RE), base0 = f.name.replace(/\.[^.]+$/, '');
    const r = { file: f, name: (m ? m[1] : base0).replace(/_+/g, ' ').trim(), season: m && !/общий/i.test(m[2]) ? m[2].toLowerCase() : 'общий_фон', filename: '' };
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
const url = n => `/contents/${S.path}/${encodeURIComponent(n)}`;
let current = [];
async function uploadRow(r) {
  const g = await api(url(r.filename) + '?ref=' + encodeURIComponent(S.branch));
  let sha; if (g.ok) sha = (await g.json()).sha; else if (g.status !== 404) throw new Error(await errMsg(g));
  const res = await api(url(r.filename), { method: 'PUT', body: JSON.stringify({ message: `${sha ? 'Заменён' : 'Добавлен'} фон: ${r.filename}`, content: await b64(r.file), branch: S.branch, ...(sha ? { sha } : {}) }) });
  if (!res.ok) throw new Error(await errMsg(res));
  // старый файл с тем же названием и сезоном, но другим расширением, удаляем — иначе будет два варианта одного сезона
  const old = current.filter(c => stem(c.name) === stem(r.filename) && c.name.toLowerCase() !== r.filename.toLowerCase());
  for (const o of old) await api(url(o.name), { method: 'DELETE', body: JSON.stringify({ message: `Удалён старый файл: ${o.name}`, sha: o.sha, branch: S.branch }) });
  return (sha ? 'заменён' : 'загружен') + (old.length ? ` (старый ${old.map(o => o.name.split('.').pop()).join(', ')} удалён)` : '');
}
$('#upload').addEventListener('click', async () => {
  if (!(await checkAccess())) return;
  await loadList(true);
  $('#upload').disabled = true; let ok = 0;
  for (const r of rows.slice()) {
    const st = r.el.querySelector('.st'); st.className = 'st'; st.textContent = 'загрузка…';
    try { st.textContent = '✓ ' + await uploadRow(r); st.className = 'st ok'; ok++; } catch (err) { st.textContent = '✗ ' + err.message; st.className = 'st bad'; }
  }
  setSt('#upStatus', ok ? `Готово: ${ok} из ${rows.length}. На сайте изменения появятся в течение пары минут (на каталоге можно нажать «Проверить заново» внизу страницы).` : 'Ничего не загружено.', !ok);
  refreshBtn(); loadList();
});

/* ---------- список файлов ---------- */
async function loadList(silent) {
  if (!token) { $('#flist').innerHTML = '<li class="meta">Введите токен, чтобы увидеть список.</li>'; return; }
  try {
    const r = await api(`/contents/${S.path}?ref=${encodeURIComponent(S.branch)}`);
    if (r.status === 404) { current = []; $('#flist').innerHTML = '<li class="meta">Папка пока пуста — она создастся при первой загрузке.</li>'; return; }
    if (!r.ok) throw new Error(await errMsg(r));
    current = (await r.json()).filter(x => x.type === 'file');
    $('#flist').innerHTML = current.length ? current.map(f => `<li><a href="${esc(f.download_url)}" target="_blank" rel="noopener">${esc(f.name)}</a> <span class="meta">${Math.round(f.size / 1024)} КБ</span> <button class="btn ghost del" type="button" data-name="${esc(f.name)}" aria-label="Удалить ${esc(f.name)}">Удалить</button></li>`).join('') : '<li class="meta">Папка пуста.</li>';
  } catch (err) { if (!silent) $('#flist').innerHTML = `<li class="st bad">${esc(err.message)}</li>`; }
}
$('#reload').addEventListener('click', () => loadList());
$('#flist').addEventListener('click', async e => {
  const b = e.target.closest('.del'); if (!b) return;
  const f = current.find(c => c.name === b.dataset.name); if (!f || !confirm(`Удалить файл «${f.name}» из папки? Фон пропадёт с сайта.`)) return;
  b.disabled = true;
  const r = await api(url(f.name), { method: 'DELETE', body: JSON.stringify({ message: `Удалён фон: ${f.name}`, sha: f.sha, branch: S.branch }) });
  if (!r.ok) { alert('Не удалось удалить: ' + await errMsg(r)); b.disabled = false; return; }
  loadList();
});
refreshBtn(); if (token) loadList();
})();
