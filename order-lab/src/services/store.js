import { reactive } from "vue";
import { clone, createOrder, transition, expire } from "../domain/orders";
const KEY = "pinxiang-order-lab-v1";
export const store = reactive({
  db: null,
  role: "buyer",
  error: "",
  ready: false,
  offset: 0,
  now: Date.now(),
});
export function currentTime() {
  return Date.now() + store.offset;
}
function save(db, offset = store.offset) {
  localStorage.setItem(KEY, JSON.stringify({ version: 1, db, offset }));
}
export async function init() {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}mockdata.json`);
    if (!r.ok) throw new Error("mockdata.json 加载失败");
    const seed = await r.json();
    let cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      throw new Error("本地数据损坏，请点击恢复演示数据");
    }
    if (
      cached &&
      (cached.version !== 1 ||
        !Array.isArray(cached.db?.orders) ||
        !Array.isArray(cached.db?.products))
    )
      throw new Error("本地数据格式不兼容，请恢复演示数据");
    store.db = cached ? cached.db : hydrate(seed);
    store.offset = cached?.offset || 0;
    store.now = currentTime();
    expire(store.db, store.now);
    save(store.db);
    store.ready = true;
    store.error = "";
  } catch (e) {
    store.error = e.message;
  }
}
export function hydrate(seed) {
  const db = clone(seed),
    now = Date.now();
  db.sequence = 100;
  for (const o of db.orders) {
    for (const key of [
      "createdAt",
      "paidAt",
      "shippedAt",
      "completedAt",
      "payDeadline",
    ])
      if (typeof o[key] === "number") o[key] = now + o[key];
    if (o.group?.deadline) o.group.deadline += now;
    for (const e of [...o.events, ...o.logistics]) e.time += now;
    if (o.afterSale) o.afterSale.createdAt += now;
    if (o.review) o.review.time += now;
  }
  return db;
}
// Commit only after persistence succeeds, so a failed write never silently changes UI.
export function transact(fn) {
  const db = clone(store.db);
  const result = fn(db, currentTime());
  save(db);
  store.db = db;
  store.now = currentTime();
  return result;
}
export function order(input) {
  return transact((db, now) => createOrder(db, input, now));
}
export function act(id, action, payload, role = store.role) {
  return transact((db, now) => transition(db, id, action, payload, role, now));
}
export function tick() {
  if (!store.ready) return;
  store.now = currentTime();
  const db = clone(store.db);
  if (expire(db, store.now)) {
    save(db);
    store.db = db;
  }
}
export function advance(hours) {
  const offset = store.offset + hours * 3600000,
    db = clone(store.db);
  expire(db, Date.now() + offset);
  save(db, offset);
  store.db = db;
  store.offset = offset;
  store.now = currentTime();
}
export async function reset() {
  localStorage.removeItem(KEY);
  store.offset = 0;
  store.ready = false;
  await init();
}
export function exportData() {
  const blob = new Blob([JSON.stringify(store.db, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "order-lab-export.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
