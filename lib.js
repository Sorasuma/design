// Общие функции каталога и админки: чтение/запись catalog.json и сопоставление файлов из папки с фонами.
(() => {
'use strict';
const VERSION = 'catalog-2';
const DEFAULT_SOURCE = { owner: 'Sorasuma', repo: 'design', branch: 'main', path: 'dop' };
const norm = s => String(s).toLowerCase().replace(/ё/g, 'е');
const key = s => norm(s).replace(/[\s_-]+/g, '');
const dec = u => { try { return decodeURIComponent(u).toLowerCase().split('?')[0]; } catch (_) { return String(u).toLowerCase().split('?')[0]; } };
const SEA_ORDER = ['Общий фон', 'Зима', 'Осень', 'Весна', 'Лето', '200×300', '100×150', 'Старый формат', 'Птицы', 'Зверьки', 'Рыбы'];
const DOP_RE = /^(.*?)[_\s-]+(зима|осень|весна|лето|общий[_\s-]?фон|общий)$/i;
const source = () => ({ ...DEFAULT_SOURCE, ...(window.DOP_SOURCE || {}) });
const rawBase = S => `https://raw.githubusercontent.com/${S.owner}/${S.repo}/${S.branch}/${S.path}`;
const plainUrl = (S, name) => `${rawBase(S)}/${String(name).split('/').map(encodeURIComponent).join('/')}`; // name может содержать подпапку: headers/файл.jpg
const catalogUrl = S => `${rawBase(S)}/catalog.json`;

// «Название_сезон.jpg» -> { name, label }
function parse(filename) {
  const base = filename.replace(/\.[^.]+$/, ''), m = base.match(DOP_RE);
  return { name: (m ? m[1] : base).replace(/_+/g, ' ').trim(), label: m ? (/общий/i.test(m[2]) ? 'Общий фон' : m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()) : 'Общий фон' };
}
// Добавляет/заменяет один вариант у фона (по названию). Нет такого фона — создаёт карточку в «Новые фоны».
function upsert(items, name, label, url, touched) {
  const k = key(name); if (!k) return null;
  let it = items.find(i => i.section === 'Актуальные' && key(i.name) === k);
  if (!it) {
    it = { name, section: 'Актуальные', group: '', location: 'Новые фоны', authors: '', variants: [] };
    if (items.some(i => i.id !== undefined)) it.id = Math.max(0, ...items.map(i => i.id || 0)) + 1;
    items.push(it);
  }
  // был один «общий фон», пришёл сезонный файл — он заменяет общий фон
  if (label !== 'Общий фон' && !(touched && touched.has(it)) && it.variants.length === 1 && it.variants[0].label === 'Общий фон') it.variants.length = 0;
  const old = it.variants.find(v => v.label === label);
  if (old) old.url = url; else { it.variants.push({ label, url }); it.variants.sort((a, b) => SEA_ORDER.indexOf(a.label) - SEA_ORDER.indexOf(b.label)); }
  return it;
}
// files: [{ name, url, sha }] -> Map(фон -> сезон) для изменённых карточек; touched.refreshed — сколько ссылок получили новую версию файла
function merge(items, files) {
  const known = new Map(), touched = new Map(); touched.refreshed = 0;
  items.forEach(i => i.variants.forEach(v => known.set(dec(v.url), v)));
  for (const f of files) {
    const nu = f.url + (f.sha ? '?v=' + f.sha.slice(0, 7) : ''), v = known.get(dec(f.url));
    if (v) { // файл уже есть в каталоге: если его заменили под тем же именем — обновляем версию в ссылке (иначе покажется картинка из кэша)
      const cur = (v.url.match(/\?v=([0-9a-f]+)/) || [])[1];
      if (f.sha && cur !== f.sha.slice(0, 7)) { v.url = nu; touched.refreshed++; }
      continue;
    }
    const { name, label } = parse(f.name), it = upsert(items, name, label, nu, touched);
    if (it) touched.set(it, label);
  }
  return touched;
}
const toB64 = str => { const b = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), c => c.charCodeAt(0)));
window.DopLib = { VERSION, source, norm, key, dec, SEA_ORDER, parse, upsert, merge, plainUrl, catalogUrl, rawBase, toB64, fromB64 };
})();
