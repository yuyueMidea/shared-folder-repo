const KEY = 'open-city-prototype-v1';

export function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.v === 1 ? s : null; }
  catch { return null; }
}
export function writeSave(data) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, ...data })); } catch { /* 隐私模式等，忽略 */ }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
