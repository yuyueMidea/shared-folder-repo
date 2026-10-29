import * as T from "three";
import "./style.css";
import {
  SIZE,
  blocks,
  clamp,
  canStand,
  moveWithCollision,
  TARGETS,
  validSave,
} from "./world.js";
const $ = (id) => document.getElementById(id),
  canvas = $("game");
let renderer;
try {
  renderer = new T.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  $("saveInfo").textContent = "WebGL 初始化失败，请启用浏览器硬件加速。";
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.setClearColor(0xb8d4d0);
const scene = new T.Scene();
scene.fog = new T.Fog(0xb8d4d0, 110, 310);
const camera = new T.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 600);
scene.add(new T.HemisphereLight(0xe9f5f0, 0x87927b, 2.8));
const sun = new T.DirectionalLight(0xffe4bd, 3);
sun.position.set(70, 100, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -70,
  right: 70,
  top: 70,
  bottom: -70,
  near: 1,
  far: 250,
});
sun.shadow.bias = -0.001;
scene.add(sun, sun.target);
const cube = new T.BoxGeometry(1, 1, 1),
  cylinder = new T.CylinderGeometry(1, 1, 1, 8),
  sphere = new T.IcosahedronGeometry(1, 0),
  mats = new Map();
function mat(c) {
  if (!mats.has(c))
    mats.set(c, new T.MeshStandardMaterial({ color: c, roughness: 0.88 }));
  return mats.get(c);
}
function box(g, x, y, z, w, h, d, c, shadow = true) {
  const m = new T.Mesh(cube, mat(c));
  m.position.set(x, y, z);
  m.scale.set(w, h, d);
  m.castShadow = shadow;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
const chunks = new Map(),
  palette = [0xb3b9ac, 0xcbbda3, 0x9bb7ae, 0xb6aca0, 0x839f9f];
function makeChunk(cx, cz) {
  const g = new T.Group();
  g.position.set(cx * SIZE, 0, cz * SIZE);
  scene.add(g);
  box(g, 48, -0.25, 48, 96, 0.5, 96, 0x91a28b, false);
  box(g, 48, 0.015, 0, 96, 0.03, 18, 0x485b5c, false);
  box(g, 0, 0.015, 48, 18, 0.03, 96, 0x485b5c, false);
  for (const [x, z, w, d] of [
    [48, 11, 72, 4],
    [11, 48, 4, 72],
    [48, 85, 72, 4],
    [85, 48, 4, 72],
  ])
    box(g, x, 0.11, z, w, 0.22, d, 0xc6cab6, false);
  for (let a = 16; a < 88; a += 12) {
    box(g, a, 0.04, 0, 5, 0.025, 0.18, 0xe6d8a2, false);
    box(g, 0, 0.04, a, 0.18, 0.025, 5, 0xe6d8a2, false);
  }
  for (let a = -6; a <= 6; a += 3) {
    box(g, a, 0.05, 9, 1.5, 0.025, 3, 0xe6e3ce, false);
    box(g, 9, 0.05, a, 3, 0.025, 1.5, 0xe6e3ce, false);
  }
  for (const b of blocks(cx, cz)) {
    const x = b.x - cx * SIZE,
      z = b.z - cz * SIZE;
    box(g, x, b.h / 2, z, b.w, b.h, b.d, palette[b.color]);
    box(g, x, b.h + 0.4, z, b.w + 1, 0.8, b.d + 1, 0x657c79);
    box(g, x, b.h + 1.3, z, 5, 1.8, 5, 0x889b96);
    for (let y = 3; y < b.h - 2; y += 4) {
      box(g, x, y, z - b.d / 2 - 0.04, b.w * 0.77, 1.45, 0.08, 0x536d70, false);
      box(g, x - b.w / 2 - 0.04, y, z, 0.08, 1.45, b.d * 0.76, 0x536d70, false);
    }
  }
  for (const [x, z] of [
    [15, 16],
    [79, 16],
    [16, 78],
    [79, 79],
  ]) {
    box(g, x, 1.4, z, 0.4, 2.8, 0.4, 0x826b51);
    const m = new T.Mesh(sphere, mat(0x547c62));
    m.position.set(x, 4, z);
    m.scale.set(2.6, 3.1, 2.6);
    m.castShadow = true;
    g.add(m);
  }
  for (const [x, z] of [
    [12, 42],
    [42, 12],
  ]) {
    box(g, x, 3, z, 0.15, 6, 0.15, 0x405c59);
    box(g, x, 6, z, 1.5, 0.15, 0.65, 0xffe4a9);
  }
  // Batch static objects by shared geometry/material inside each chunk.
  const groups = new Map();
  g.updateMatrixWorld();
  for (const m of [...g.children]) {
    const key = m.geometry.uuid + "/" + m.material.uuid + "/" + m.castShadow;
    let a = groups.get(key);
    if (!a) groups.set(key, (a = []));
    a.push(m);
  }
  for (const a of groups.values()) {
    const inst = new T.InstancedMesh(a[0].geometry, a[0].material, a.length);
    inst.castShadow = a[0].castShadow;
    inst.receiveShadow = true;
    a.forEach((m, i) => {
      m.updateMatrix();
      inst.setMatrixAt(i, m.matrix);
      g.remove(m);
    });
    inst.computeBoundingSphere();
    g.add(inst);
  }
  chunks.set(`${cx},${cz}`, g);
}
function stream(p) {
  const cx = Math.floor(p.x / SIZE),
    cz = Math.floor(p.z / SIZE),
    r = $("quality").value === "low" ? 1 : 2,
    need = [];
  for (let x = cx - r; x <= cx + r; x++)
    for (let z = cz - r; z <= cz + r; z++)
      if (!chunks.has(`${x},${z}`))
        need.push({ x, z, d: (x - cx) ** 2 + (z - cz) ** 2 });
  need.sort((a, b) => a.d - b.d);
  for (const n of need.slice(0, 2)) makeChunk(n.x, n.z);
  for (const [key, g] of chunks) {
    const [x, z] = key.split(",").map(Number);
    if (Math.abs(x - cx) > r + 1 || Math.abs(z - cz) > r + 1) {
      scene.remove(g);
      g.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
      chunks.delete(key);
    }
  }
}
function carModel(c) {
  const g = new T.Group();
  box(g, 0, 0.7, 0, 1.85, 0.6, 3.7, c);
  box(g, 0, 1.2, -0.2, 1.58, 0.65, 1.9, c);
  box(g, 0, 1.28, 0.79, 1.42, 0.42, 0.04, 0x345559);
  box(g, 0, 1.28, -1.18, 1.42, 0.42, 0.04, 0x345559);
  box(g, -0.8, 1.3, -0.2, 0.03, 0.38, 1.55, 0x345559);
  box(g, 0.8, 1.3, -0.2, 0.03, 0.38, 1.55, 0x345559);
  box(g, 0, 0.6, 1.88, 1.4, 0.15, 0.05, 0xffedbd);
  box(g, 0, 0.6, -1.88, 1.4, 0.15, 0.05, 0xd75c49);
  const wheels = [];
  for (const x of [-0.96, 0.96])
    for (const z of [-1.15, 1.15]) {
      const w = new T.Mesh(cylinder, mat(0x253a3b));
      w.rotation.z = Math.PI / 2;
      w.scale.set(0.39, 0.23, 0.39);
      w.position.set(x, 0.42, z);
      g.add(w);
      wheels.push(w);
    }
  g.userData.wheels = wheels;
  scene.add(g);
  return g;
}
const car = { x: 5, z: 5, yaw: 0, speed: 0, model: carModel(0xef9d43) },
  player = { x: 10, z: 5, yaw: 0, model: new T.Group() };
scene.add(player.model);
box(player.model, 0, 1.05, 0, 0.55, 0.65, 0.32, 0xe9c280);
box(player.model, 0, 1.6, 0, 0.37, 0.4, 0.35, 0xad7958);
box(player.model, 0, 1.83, -0.015, 0.4, 0.12, 0.38, 0x273d3d);
const legs = [
    box(player.model, -0.16, 0.4, 0, 0.2, 0.8, 0.23, 0x314b56),
    box(player.model, 0.16, 0.4, 0, 0.2, 0.8, 0.23, 0x314b56),
  ],
  arms = [
    box(player.model, -0.39, 1, 0, 0.17, 0.65, 0.2, 0xe9c280),
    box(player.model, 0.39, 1, 0, 0.17, 0.65, 0.2, 0xe9c280),
  ];
let driving = false,
  paused = true,
  camYaw = 0.8,
  pitch = 0.38,
  money = 0,
  deliveries = 0,
  carrying = false,
  missionIndex = 0,
  keys = new Set(),
  drag = false,
  time = 0,
  acc = 0,
  last = 0,
  toastUntil = 0,
  autosave = 0,
  walk = 0,
  saveAvailable = true;
const pickup = { x: 12, z: 5, name: "街角配送站" },
  marker = new T.Group();
scene.add(marker);
const ring = new T.Mesh(
  new T.TorusGeometry(2.4, 0.1, 8, 48),
  new T.MeshBasicMaterial({ color: 0xffca66 }),
);
ring.rotation.x = Math.PI / 2;
ring.position.y = 0.18;
marker.add(ring);
const gem = new T.Mesh(new T.OctahedronGeometry(0.65), mat(0xffc45f));
gem.position.y = 3;
marker.add(gem);
function toast(s) {
  $("toast").textContent = s;
  $("toast").style.opacity = "1";
  toastUntil = time + 3;
}
function active() {
  return driving ? car : player;
}
function goal() {
  return carrying ? TARGETS[missionIndex] : pickup;
}
function save() {
  try {
    localStorage.setItem(
      "city-sandbox-v1",
      JSON.stringify({
        version: 1,
        x: player.x,
        z: player.z,
        yaw: player.yaw,
        carX: car.x,
        carZ: car.z,
        carYaw: car.yaw,
        driving,
        money,
        deliveries,
        carrying,
        missionIndex,
      }),
    );
    return true;
  } catch {
    saveAvailable = false;
    $("saveInfo").textContent = "当前浏览器不允许存档；本次仍可正常游玩。";
    return false;
  }
}
try {
  const s = JSON.parse(localStorage.getItem("city-sandbox-v1"));
  if (validSave(s)) {
    Object.assign(player, { x: s.x, z: s.z, yaw: s.yaw });
    Object.assign(car, { x: s.carX, z: s.carZ, yaw: s.carYaw });
    driving = s.driving;
    money = s.money;
    deliveries = s.deliveries;
    carrying = s.carrying === true;
    missionIndex =
      Number.isInteger(s.missionIndex) &&
      s.missionIndex >= 0 &&
      s.missionIndex < TARGETS.length
        ? s.missionIndex
        : 0;
    if (!canStand(player.x, player.z)) Object.assign(player, { x: 10, z: 5 });
    if (!canStand(car.x, car.z, 2.1)) Object.assign(car, { x: 5, z: 5 });
    $("play").innerHTML = "继续探索 <span>↗</span>";
  }
} catch {
  saveAvailable = false;
}
const traffic = [];
for (let i = 0; i < 20; i++)
  traffic.push({
    model: carModel([0x86a7ae, 0xf2e4c9, 0xd47a64, 0x527a6f][i % 4]),
    x: 9999,
    z: 9999,
    yaw: 0,
    speed: 5,
    lane: (i % 5) - 2,
    vertical: i % 2 === 0,
    dir: i % 4 < 2 ? 1 : -1,
    offset: ((i * 53) % 480) - 240,
  });
function interactCar() {
  if (driving) {
    if (Math.abs(car.speed) > 1.5) return toast("请先停车，再下车");
    for (const side of [1, -1]) {
      const x = car.x + Math.cos(car.yaw) * 3 * side,
        z = car.z - Math.sin(car.yaw) * 3 * side;
      if (
        canStand(x, z, 0.55) &&
        !traffic.some((t) => Math.hypot(x - t.x, z - t.z) < 2.5)
      ) {
        Object.assign(player, { x, z, yaw: car.yaw });
        driving = false;
        car.speed = 0;
        save();
        return toast("已下车");
      }
    }
    toast("车门附近没有足够空间");
  } else if (Math.hypot(player.x - car.x, player.z - car.z) < 4.5) {
    driving = true;
    camYaw = car.yaw + Math.PI;
    save();
    toast("W / S 加速与刹车 · A / D 转向");
  } else toast("靠近橙色汽车，按 E 上车");
}
function interactMission() {
  if (driving) return toast("请停车下车后交付");
  const g = goal();
  if (Math.hypot(player.x - g.x, player.z - g.z) > 4)
    return toast("靠近黄色标记后按 F");
  if (!carrying) {
    carrying = true;
    toast(`已取件：前往${goal().name}`);
  } else {
    money += 200;
    deliveries++;
    carrying = false;
    missionIndex = (missionIndex + 1) % TARGETS.length;
    toast("配送完成！获得 ¥ 200，返回配送站继续接单。");
  }
  save();
}
function recover() {
  const p = active();
  p.x = Math.round(p.x / SIZE) * SIZE + 4.5;
  p.z = Math.round(p.z / SIZE) * SIZE + 20;
  if (driving) {
    car.speed = 0;
    car.yaw = 0;
  }
  toast("已移至附近安全道路");
  save();
}
function pause(value) {
  paused = value;
  keys.clear();
  $("overlay").style.display = value ? "flex" : "none";
  if (value) {
    document.exitPointerLock?.();
    save();
    $("play").innerHTML = "继续探索 <span>↗</span>";
  }
  last = performance.now();
  acc = 0;
}
$("play").onclick = () => pause(false);
$("pauseBtn").onclick = () => pause(true);
$("reset").onclick = () => {
  if (confirm("清除本地存档并重新开始？")) {
    try {
      localStorage.removeItem("city-sandbox-v1");
    } catch {}
    location.reload();
  }
};
$("quality").onchange = () => {
  renderer.setPixelRatio(
    Math.min(devicePixelRatio, $("quality").value === "low" ? 1 : 1.5),
  );
  renderer.shadowMap.enabled = $("quality").value !== "low";
};
window.addEventListener("keydown", (e) => {
  if (["KeyW", "KeyA", "KeyS", "KeyD", "Space"].includes(e.code))
    e.preventDefault();
  if (e.code === "Escape") {
    if (!paused) pause(true);
    return;
  }
  if (paused) return;
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === "KeyE") interactCar();
  if (e.code === "KeyF") interactMission();
  if (e.code === "KeyR") recover();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  if (!paused) pause(true);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && !paused) pause(true);
});
canvas.addEventListener("mousedown", () => {
  if (!paused) drag = true;
});
window.addEventListener("mouseup", () => (drag = false));
canvas.addEventListener("dblclick", () => {
  if (!paused) canvas.requestPointerLock?.();
});
window.addEventListener("mousemove", (e) => {
  if (!paused && (drag || document.pointerLockElement === canvas)) {
    camYaw -= e.movementX * 0.004;
    pitch = clamp(pitch + e.movementY * 0.003, 0.12, 1.05);
  }
});
function updateTraffic(dt) {
  const p = active(),
    snapshot = traffic.map((t) => ({ x: t.x, z: t.z }));
  for (let i = 0; i < traffic.length; i++) {
    const t = traffic[i],
      fixed =
        Math.round((t.vertical ? p.x : p.z) / SIZE) * SIZE +
        t.lane * SIZE +
        t.dir * 4.4;
    let along = (t.vertical ? p.z : p.x) + t.offset;
    if (!t.ready || Math.hypot(t.x - p.x, t.z - p.z) > 290) {
      if (t.ready) along = (t.vertical ? p.z : p.x) - t.dir * 225;
      if (t.vertical) {
        t.x = fixed;
        t.z = along;
      } else {
        t.x = along;
        t.z = fixed;
      }
      t.ready = true;
      t.speed = 5;
    }
    const value = t.vertical ? t.z : t.x,
      dist = (((t.dir > 0 ? -value : value) % SIZE) + SIZE) % SIZE,
      green = t.vertical ? time % 16 < 7 : time % 16 >= 8 && time % 16 < 15;
    let desired = 9;
    if (!green && dist > 10 && dist < 27)
      desired = Math.min(desired, Math.max(0, (dist - 12) * 0.8));
    const fx = t.vertical ? 0 : t.dir,
      fz = t.vertical ? t.dir : 0;
    for (let j = 0; j < snapshot.length; j++) {
      if (i === j) continue;
      const o = snapshot[j],
        dx = o.x - t.x,
        dz = o.z - t.z,
        ahead = dx * fx + dz * fz;
      if (ahead > 0 && ahead < 13 && Math.abs(dx * fz - dz * fx) < 2.5)
        desired = Math.min(desired, Math.max(0, (ahead - 5) * 1.1));
    }
    for (const o of [car, ...(!driving ? [player] : [])]) {
      const dx = o.x - t.x,
        dz = o.z - t.z,
        ahead = dx * fx + dz * fz;
      if (ahead > 0 && ahead < 16 && Math.abs(dx * fz - dz * fx) < 2.8)
        desired = Math.min(desired, Math.max(0, (ahead - 5) * 0.9));
    }
    t.speed += clamp(desired - t.speed, -9 * dt, 3 * dt);
    t.x += fx * t.speed * dt;
    t.z += fz * t.speed * dt;
    t.yaw = Math.atan2(fx, fz);
    t.model.position.set(t.x, 0, t.z);
    t.model.rotation.y = t.yaw;
  }
}
const signals = [];
for (let x = -2; x <= 2; x++)
  for (let z = -2; z <= 2; z++) {
    const g = new T.Group();
    box(g, 0, 2.1, 0, 0.13, 4.2, 0.13, 0x375451);
    box(g, 0, 3.8, 0, 0.5, 0.8, 0.4, 0x253d38);
    const a = box(g, 0, 3.9, 0.23, 0.24, 0.25, 0.04, 0x6cbe87, false),
      b = box(g, 0.28, 3.9, 0, 0.04, 0.25, 0.24, 0x6cbe87, false);
    scene.add(g);
    signals.push({ g, a, b, x, z });
  }
function tick(dt) {
  time += dt;
  if (time > toastUntil) $("toast").style.opacity = "0";
  const p = active();
  if (driving) {
    const throttle = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
    car.speed += throttle * 13 * dt;
    car.speed *= Math.exp(
      -(keys.has("Space") ? 5 : throttle ? 0.25 : 1.1) * dt,
    );
    car.speed = clamp(car.speed, -9, 27);
    const steer = (keys.has("KeyA") ? 1 : 0) - (keys.has("KeyD") ? 1 : 0);
    car.yaw +=
      (steer * car.speed * 0.055 * dt) / (1 + Math.abs(car.speed) * 0.035);
    const ox = car.x,
      oz = car.z;
    if (
      moveWithCollision(
        car,
        Math.sin(car.yaw) * car.speed * dt,
        Math.cos(car.yaw) * car.speed * dt,
        2.1,
      )
    )
      car.speed *= 0.7;
    for (const t of traffic) {
      if (Math.hypot(car.x - t.x, car.z - t.z) < 3.3) {
        car.x = ox;
        car.z = oz;
        car.speed *= -0.15;
        break;
      }
    }
    if (
      !drag &&
      document.pointerLockElement !== canvas &&
      Math.abs(car.speed) > 1
    ) {
      const target = car.yaw + Math.PI;
      camYaw +=
        Math.atan2(Math.sin(target - camYaw), Math.cos(target - camYaw)) *
        dt *
        2;
    }
  } else {
    let f = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0),
      s = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
    const n = Math.hypot(f, s);
    if (n) {
      f /= n;
      s /= n;
      const v = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 8 : 4.3,
        dx = (-Math.sin(camYaw) * f + Math.cos(camYaw) * s) * v * dt,
        dz = (-Math.cos(camYaw) * f - Math.sin(camYaw) * s) * v * dt,
        ox = player.x,
        oz = player.z;
      moveWithCollision(player, dx, dz, 0.45);
      if (
        Math.hypot(player.x - car.x, player.z - car.z) < 1.8 ||
        traffic.some((t) => Math.hypot(player.x - t.x, player.z - t.z) < 1.8)
      ) {
        player.x = ox;
        player.z = oz;
      }
      const y = Math.atan2(dx, dz);
      player.yaw +=
        Math.atan2(Math.sin(y - player.yaw), Math.cos(y - player.yaw)) *
        Math.min(1, dt * 14);
      walk += dt * v * 2;
    } else walk = 0;
  }
  updateTraffic(dt);
  player.model.visible = !driving;
  player.model.position.set(player.x, 0, player.z);
  player.model.rotation.y = player.yaw;
  legs.forEach((l, i) => (l.rotation.x = Math.sin(walk + i * Math.PI) * 0.45));
  arms.forEach((l, i) => (l.rotation.x = -Math.sin(walk + i * Math.PI) * 0.4));
  car.model.position.set(car.x, 0, car.z);
  car.model.rotation.y = car.yaw;
  car.model.userData.wheels.forEach(
    (w) => (w.rotation.x += car.speed * dt * 2),
  );
  const target = goal();
  marker.position.set(target.x, 0, target.z);
  gem.rotation.y += dt;
  gem.position.y = 3 + Math.sin(time * 2) * 0.2;
  const cx = Math.round(p.x / SIZE),
    cz = Math.round(p.z / SIZE);
  for (const s of signals) {
    s.g.position.set((cx + s.x) * SIZE + 10, 0, (cz + s.z) * SIZE + 10);
    s.a.material = mat(time % 16 < 7 ? 0x64c78a : 0xe46f56);
    s.b.material = mat(time % 16 >= 8 && time % 16 < 15 ? 0x64c78a : 0xe46f56);
  }
  autosave += dt;
  if (autosave > 8) {
    save();
    autosave = 0;
  }
}
const desired = new T.Vector3(),
  look = new T.Vector3(),
  smoothLook = new T.Vector3(active().x, 1.5, active().z);
function updateCamera(dt, snap = false) {
  const p = active();
  look.set(p.x, driving ? 1.8 : 1.45, p.z);
  smoothLook.lerp(look, snap ? 1 : 1 - Math.exp(-dt * 10));
  const distance = driving ? 10.5 : 6.8;
  let allowed = distance;
  for (let d = 0.4; d < distance; d += 0.25) {
    const x = look.x + Math.sin(camYaw) * d * Math.cos(pitch),
      z = look.z + Math.cos(camYaw) * d * Math.cos(pitch),
      y = look.y + d * Math.sin(pitch);
    if (
      blocks(Math.floor(x / SIZE), Math.floor(z / SIZE)).some(
        (b) =>
          y < b.h + 1 &&
          Math.abs(x - b.x) < b.w / 2 + 0.3 &&
          Math.abs(z - b.z) < b.d / 2 + 0.3,
      )
    ) {
      allowed = Math.max(0.5, d - 0.5);
      break;
    }
  }
  desired.set(
    smoothLook.x + Math.sin(camYaw) * allowed * Math.cos(pitch),
    smoothLook.y + allowed * Math.sin(pitch),
    smoothLook.z + Math.cos(camYaw) * allowed * Math.cos(pitch),
  );
  camera.position.copy(desired);
  camera.lookAt(smoothLook);
  sun.position.set(p.x + 70, 100, p.z + 30);
  sun.target.position.set(p.x, 0, p.z);
}
const ctx = $("map").getContext("2d");
function ui() {
  const p = active(),
    g = goal(),
    dist = Math.hypot(p.x - g.x, p.z - g.z);
  $("money").textContent = `¥ ${money.toLocaleString()}`;
  $("count").textContent = `${deliveries} 次配送完成`;
  $("mode").textContent = driving ? "驾驶 / 橙色旅行车" : "步行探索";
  $("speed").textContent = driving
    ? String(Math.round(Math.abs(car.speed) * 3.6)).padStart(2, "0")
    : "—";
  $("missionTitle").textContent = carrying
    ? `送往${g.name}`
    : "领取你的下一份配送";
  $("missionText").textContent = carrying
    ? `距目的地 ${Math.round(dist)} 米。停车下车，进入光圈按 F 交付。`
    : `前往街角配送站（${Math.round(dist)} 米），按 F 领取包裹。`;
  $("phase").textContent = carrying ? "02 / 送达目的地" : "01 / 领取包裹";
  $("progress").style.width = carrying ? "65%" : "15%";
  let prompt = "";
  if (!driving && dist < 4)
    prompt = carrying ? "F · 交付包裹，领取 ¥ 200" : "F · 领取配送包裹";
  else if (!driving && Math.hypot(player.x - car.x, player.z - car.z) < 4.5)
    prompt = "E · 驾驶橙色汽车";
  else if (driving && Math.abs(car.speed) < 1.5) prompt = "E · 下车";
  $("prompt").textContent = prompt;
  $("prompt").style.display = prompt ? "block" : "none";
  ctx.fillStyle = "#244743";
  ctx.fillRect(0, 0, 220, 220);
  const scale = 0.85,
    px = (x) => 110 + (x - p.x) * scale,
    pz = (z) => 110 + (z - p.z) * scale;
  ctx.strokeStyle = "#819a8d";
  ctx.lineWidth = 14;
  for (
    let a = Math.floor(p.x / SIZE) - 2;
    a <= Math.floor(p.x / SIZE) + 2;
    a++
  ) {
    ctx.beginPath();
    ctx.moveTo(px(a * SIZE), 0);
    ctx.lineTo(px(a * SIZE), 220);
    ctx.stroke();
  }
  for (
    let b = Math.floor(p.z / SIZE) - 2;
    b <= Math.floor(p.z / SIZE) + 2;
    b++
  ) {
    ctx.beginPath();
    ctx.moveTo(0, pz(b * SIZE));
    ctx.lineTo(220, pz(b * SIZE));
    ctx.stroke();
  }
  for (const t of traffic) {
    ctx.fillStyle = "#dae1cb";
    ctx.fillRect(px(t.x) - 2, pz(t.z) - 2, 4, 4);
  }
  ctx.fillStyle = "#eea24b";
  ctx.fillRect(px(car.x) - 3, pz(car.z) - 3, 6, 6);
  ctx.fillStyle = "#ffd275";
  ctx.beginPath();
  ctx.arc(clamp(px(g.x), 9, 211), clamp(pz(g.z), 9, 211), 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(110, 110);
  ctx.rotate(-p.yaw);
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(-5, -5);
  ctx.lineTo(5, -5);
  ctx.fill();
  ctx.restore();
  $("stats").style.display = $("debug").checked ? "block" : "none";
}
for (let i = 0; i < 13; i++) stream(active());
tick(0);
updateCamera(1, true);
ui();
let frame = 0,
  fps = 60;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.1) || 0;
  last = now;
  if (!paused) {
    acc += dt;
    let n = 0;
    while (acc >= 1 / 60 && n++ < 6) {
      tick(1 / 60);
      acc -= 1 / 60;
    }
    updateCamera(dt);
  }
  stream(active());
  renderer.render(scene, camera);
  if (++frame % 8 === 0) {
    ui();
    fps = fps * 0.8 + 0.2 / (dt || 0.016);
    $("stats").textContent =
      `${Math.round(fps)} FPS\n区块 ${chunks.size} / 交通 ${traffic.length}\nDraw calls ${renderer.info.render.calls}\n三角形 ${renderer.info.render.triangles.toLocaleString()}\n坐标 ${Math.round(active().x)}, ${Math.round(active().z)}`;
  }
}
requestAnimationFrame(loop);
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
window.addEventListener("beforeunload", save);
window.__CITY__ = {
  snapshot: () => ({
    paused,
    driving,
    player: { x: player.x, z: player.z },
    car: { x: car.x, z: car.z, speed: car.speed },
    carrying,
    money,
    deliveries,
    chunks: chunks.size,
    traffic: traffic.length,
    saveAvailable,
  }),
};
