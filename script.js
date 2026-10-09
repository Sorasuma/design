(() => {
'use strict';
const P = window.PAGES[document.body.dataset.page], built = window.PAGES_BUILT;
const { items, missing } = P;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s).toLowerCase().replace(/ё/g, 'е');

const FORMATS = { orig: 'Оригинал', png: 'PNG', jpeg: 'JPEG' };
const MIME = { png: 'image/png', jpeg: 'image/jpeg' };
const EXT_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp' };
const MAX_SAFE_PIXELS = 16e6; // лимит canvas на многих мобильных браузерах
const state = { vi: new Map(), fmt: 'orig', modalId: null };
const byId = new Map(items.map(i => [i.id, i]));
items.forEach(i => { i._s = norm([i.name, i.location, i.group, i.authors, i.section].join(' ')); });

const el = { q: $('#q'), sec: $('#fSection'), grp: $('#fGroup'), loc: $('#fLoc'), sea: $('#fSeason'), sort: $('#fSort'),
  grid: $('#grid'), empty: $('#empty'), count: $('#count'), modal: $('#modal'), mImg: $('#mImg'), mWrap: $('#mImgWrap'),
  mTabs: $('#mTabs'), mFmt: $('#mFmt'), mDl: $('#mDl'), toast: $('#toast') };

/* ---------- фильтры ---------- */
const uniq = key => [...new Set(items.map(i => i[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
function fill(sel, label, values) {
  sel.hidden = values.length < 2; // фильтр без выбора не показываем
  sel.innerHTML = `<option value="">${label}</option>` + values.map(v => `<option>${esc(v)}</option>`).join('');
}
fill(el.sec, 'Все разделы', uniq('section'));
fill(el.grp, 'Вся территория', uniq('group'));
fill(el.loc, 'Все локации', uniq('location'));
const SEA_ORDER = ['Общий фон', 'Зима', 'Осень', 'Весна', 'Лето', '200×300', '100×150', 'Старый формат', 'Птицы', 'Зверьки', 'Рыбы'];
const seaVals = P.variantFilter ? [...new Set(items.flatMap(i => i.variants.map(v => v.label)))].sort((a, b) => SEA_ORDER.indexOf(a) - SEA_ORDER.indexOf(b)) : [];
fill(el.sea, P.variantFilter || '', seaVals);
el.sort.value = P.sort;
const fmtOptions = Object.entries(FORMATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
el.mFmt.innerHTML = fmtOptions;

function filtered() {
  const words = norm(el.q.value).split(/\s+/).filter(Boolean);
  const [sec, grp, loc, sea] = [el.sec.value, el.grp.value, el.loc.value, el.sea.value];
  const list = items.filter(i =>
    (!sec || i.section === sec) && (!grp || i.group === grp) && (!loc || i.location === loc) &&
    (!sea || i.variants.some(v => v.label === sea)) && words.every(w => i._s.includes(w)));
  if (el.sort.value === 'table') return list.sort((a, b) => a.id - b.id);
  const dir = el.sort.value === 'za' ? -1 : 1;
  return list.sort((a, b) => dir * a.name.localeCompare(b.name, 'ru'));
}

/* ---------- карточки ---------- */
function cardHtml(it) {
  const vi = state.vi.get(it.id) || 0, v = it.variants[vi];
  const chips = it.variants.length > 1
    ? `<div class="chips">${it.variants.map((x, i) => `<button type="button" class="chip${i === vi ? ' on' : ''}" data-act="season" data-i="${i}">${esc(x.label)}</button>`).join('')}</div>` : '';
  const meta = [it.section === 'Архив старых' ? 'Архив' : (it.location || it.group), it.variants.length === 1 && v.label && v.label !== 'Общий фон' ? v.label : ''].filter(Boolean).join(' · ');
  return `<article class="card" data-id="${it.id}">
    <div class="thumb loading" data-act="open" role="button" tabindex="0" aria-label="Открыть: ${esc(it.name)}">
      <span class="spin"></span><img loading="lazy" decoding="async" alt="${esc(it.name)}" src="${esc(v.url)}">
      <div class="err">Файл недоступен<br><button type="button" data-act="retry">Повторить</button></div>
    </div>
    <div class="body"><h3>${esc(it.name)}</h3><p class="meta">${esc(meta)}</p>${chips}
      <div class="dl-row"><select class="fmt" aria-label="Формат скачивания">${fmtOptions}</select>
      <button type="button" class="dl" data-act="dl">Скачать</button></div></div></article>`;
}

function render() {
  const list = filtered(), sea = el.sea.value;
  list.forEach(i => { if (sea) { const k = i.variants.findIndex(v => v.label === sea); if (k >= 0) state.vi.set(i.id, k); } });
  el.grid.innerHTML = list.map(cardHtml).join('');
  el.grid.querySelectorAll('.fmt').forEach(s => { s.value = state.fmt; });
  el.empty.hidden = list.length > 0;
  el.count.textContent = `Показано ${list.length} из ${items.length}`;
}

function reload(wrap, img, url) { // перезапуск загрузки картинки
  wrap.classList.remove('failed'); wrap.classList.add('loading');
  img.src = ''; img.src = url;
}
// load/error не всплывают — слушаем в фазе перехвата
document.addEventListener('load', e => { const w = e.target.closest && e.target.closest('.thumb,.m-img'); if (w && e.target.tagName === 'IMG') w.classList.remove('loading', 'failed'); }, true);
document.addEventListener('error', e => { const w = e.target.closest && e.target.closest('.thumb,.m-img'); if (w && e.target.tagName === 'IMG' && e.target.getAttribute('src')) { w.classList.remove('loading'); w.classList.add('failed'); } }, true);

el.grid.addEventListener('change', e => { if (e.target.classList.contains('fmt')) state.fmt = e.target.value; });
el.grid.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const card = t.closest('.card'), it = byId.get(+card.dataset.id), vi = state.vi.get(it.id) || 0;
  if (t.dataset.act === 'open') openModal(it.id);
  else if (t.dataset.act === 'dl') download(it, it.variants[vi], card.querySelector('.fmt').value, t);
  else if (t.dataset.act === 'retry') { e.stopPropagation(); reload(card.querySelector('.thumb'), card.querySelector('img'), it.variants[vi].url); }
  else if (t.dataset.act === 'season') {
    const i = +t.dataset.i; state.vi.set(it.id, i);
    card.querySelectorAll('.chip').forEach((c, k) => c.classList.toggle('on', k === i));
    reload(card.querySelector('.thumb'), card.querySelector('img'), it.variants[i].url);
  }
});
el.grid.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.act === 'open') { e.preventDefault(); e.target.click(); } });

/* ---------- окно просмотра ---------- */
function openModal(id, silent) {
  const it = byId.get(id), vi = state.vi.get(id) || 0; state.modalId = id;
  $('#mTitle').textContent = it.name;
  $('#mMeta').innerHTML = [it.section === 'Архив старых' ? 'Архив старых фонов' : [it.group, it.location].filter(Boolean).join(' · '), it.authors && 'Авторы: ' + it.authors].filter(Boolean).map(esc).join('<br>');
  el.mTabs.innerHTML = it.variants.length > 1 ? it.variants.map((x, i) => `<button type="button" class="chip${i === vi ? ' on' : ''}" data-i="${i}">${esc(x.label)}</button>`).join('') : '';
  el.mFmt.value = state.fmt; el.mWrap.classList.remove('zoom');
  el.mImg.alt = it.name; reload(el.mWrap, el.mImg, it.variants[vi].url);
  el.modal.hidden = false; document.body.style.overflow = 'hidden';
}
function closeModal() { el.modal.hidden = true; document.body.style.overflow = ''; el.mImg.removeAttribute('src'); state.modalId = null; }
el.mTabs.addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  const it = byId.get(state.modalId), i = +b.dataset.i; state.vi.set(it.id, i);
  el.mTabs.querySelectorAll('.chip').forEach((c, k) => c.classList.toggle('on', k === i));
  el.mWrap.classList.remove('zoom'); reload(el.mWrap, el.mImg, it.variants[i].url);
  const card = el.grid.querySelector(`.card[data-id="${it.id}"]`); // синхронизируем карточку
  if (card) { card.querySelectorAll('.chip').forEach((c, k) => c.classList.toggle('on', k === i)); card.querySelector('img').src = it.variants[i].url; }
});
el.mFmt.addEventListener('change', () => { state.fmt = el.mFmt.value; el.grid.querySelectorAll('.fmt').forEach(s => { s.value = state.fmt; }); });
el.mDl.addEventListener('click', () => { const it = byId.get(state.modalId); download(it, it.variants[state.vi.get(it.id) || 0], el.mFmt.value, el.mDl); });
$('#mRetry').addEventListener('click', () => { const it = byId.get(state.modalId); reload(el.mWrap, el.mImg, it.variants[state.vi.get(it.id) || 0].url); });
el.mImg.addEventListener('click', () => el.mWrap.classList.toggle('zoom'));
$('#mClose').addEventListener('click', closeModal);
el.modal.addEventListener('click', e => { if (e.target === el.modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.modal.hidden) closeModal(); });

/* ---------- скачивание и конвертация ---------- */
function toast(msg, bad) {
  el.toast.textContent = msg; el.toast.className = 'toast' + (bad ? ' bad' : ''); el.toast.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.toast.hidden = true; }, bad ? 7000 : 4000);
}
const safeName = s => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120).replace(/[. ]+$/, '');
const baseName = (it, v) => safeName(it.name + (it.variants.length > 1 ? ' — ' + v.label.toLowerCase() : '') + (it.section === 'Архив старых' ? ' (старый)' : ''));
function save(blob, filename) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
}
async function toBitmap(blob) {
  if (window.createImageBitmap) { try { return await createImageBitmap(blob); } catch (_) { /* fallback ниже */ } }
  const img = new Image(); img.src = URL.createObjectURL(blob); await img.decode(); return img;
}
// Перекодирование через Canvas. JPEG: белая подложка под прозрачность, качество 1.0.
async function convert(blob, mime) {
  const bmp = await toBitmap(blob), w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
  let scale = 1;
  for (let n = 0; n < 4; n++) {
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
    const ctx = c.getContext('2d');
    if (mime === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise(r => c.toBlob(r, mime, 1));
    if (out && out.type === mime) return { blob: out, resized: scale < 1 };
    scale = n === 0 ? Math.min(0.9, Math.sqrt(MAX_SAFE_PIXELS / (w * h))) : scale * 0.7; // браузер отказал — уменьшаем
  }
  throw new Error('canvas');
}
async function download(it, v, fmt, btn) {
  const label = btn.textContent; btn.disabled = true; btn.textContent = 'Загрузка…';
  try {
    let blob;
    try { const r = await fetch(v.url, { mode: 'cors' }); if (!r.ok) throw new Error('HTTP ' + r.status); blob = await r.blob(); }
    catch (err) {
      if (fmt === 'orig') { window.open(v.url, '_blank', 'noopener'); return toast('Не удалось скачать напрямую — файл открыт в новой вкладке.', true); }
      return toast('Не удалось получить файл для конвертации (сеть или файл недоступен). Попробуйте «Оригинал».', true);
    }
    const ext = (decodeURIComponent(new URL(v.url, location.href).pathname).match(/\.([a-z0-9]+)$/i) || [, 'png'])[1].toLowerCase();
    const mime = blob.type.startsWith('image/') ? blob.type : (EXT_MIME[ext] || 'image/png');
    const origKey = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpeg' : '';
    const name = baseName(it, v);
    if (fmt === 'orig' || fmt === origKey) return save(blob, `${name}.${ext}`); // тот же формат — отдаём байты без потерь
    try {
      const { blob: out, resized } = await convert(blob, MIME[fmt]);
      save(out, `${name}.${fmt === 'jpeg' ? 'jpg' : 'png'}`);
      if (mime === 'image/gif') toast('Анимация GIF сохраняется только в оригинале — в PNG/JPEG попал первый кадр.');
      else if (resized) toast('Браузер не смог обработать полный размер — файл сохранён в уменьшенном разрешении.', true);
    } catch (err) { toast('Не удалось преобразовать изображение в этом браузере. Скачайте оригинал.', true); }
  } finally { btn.disabled = false; btn.textContent = label; }
}

/* ---------- запуск ---------- */
let timer;
el.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 120); });
[el.sec, el.grp, el.loc, el.sea, el.sort].forEach(s => s.addEventListener('change', render));
$('#reset').addEventListener('click', () => { el.q.value = ''; [el.sec, el.grp, el.loc, el.sea].forEach(s => { s.value = ''; }); el.sort.value = P.sort; state.vi.clear(); render(); });

const miss = $('#missing');
if (missing.length) miss.innerHTML = `<summary>В таблице есть, но файла-изображения нет (${missing.length})</summary><ul>${missing.map(m => `<li>${esc(m.name)}${m.location ? ' — ' + esc(m.location) : ''} (${esc(m.reason)})${m.link ? ` <a href="${esc(m.link)}" target="_blank" rel="noopener">открыть ссылку</a>` : ''}</li>`).join('')}</ul>`;
else miss.hidden = true;
$('#built').textContent = `Данные таблицы от ${built}.`;
render();
})();
