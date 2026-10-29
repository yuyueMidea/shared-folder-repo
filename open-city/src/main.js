import './style.css';
import * as THREE from 'three';
import { createPhysics } from './physics.js';
import { Input } from './input.js';
import { City } from './city.js';
import { VehicleManager } from './vehicles.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { GameAudio } from './audio.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { clamp, angDiff, snapToLane } from './config.js';

const $ = (id) => document.getElementById(id);
const EXIT_SPEED = 4.2;   // m/s ≈ 15 km/h，超过这个速度不能下车

async function boot() {
  // ---------------- 渲染器 / 场景 ----------------
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const HORIZON = 0xbcd6ee;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, 70, 290);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 700);

  // 天空穹顶（顶点色渐变），跟随相机
  {
    const g = new THREE.SphereGeometry(520, 24, 14);
    const top = new THREE.Color(0x4a86d0), hor = new THREE.Color(HORIZON);
    const cols = [];
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = clamp(pos.getY(i) / 520, 0, 1);
      const c = hor.clone().lerp(top, Math.pow(t, 0.6));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    var sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1; scene.add(sky);
  }
  scene.add(new THREE.HemisphereLight(0xd3e4ff, 0x6b6a5e, 1.15));
  const sun = new THREE.DirectionalLight(0xfff0d4, 2.3);
  const sunDir = new THREE.Vector3(-0.45, 0.8, 0.38).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 320 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);

  // ---------------- 物理 + 游戏对象 ----------------
  const { RAPIER, world } = await createPhysics();
  const save = loadSave();
  const input = new Input(canvas);
  const hud = new Hud();
  const audio = new GameAudio();

  const game = {
    RAPIER, world, scene, camera, renderer, input, hud, audio,
    money: save?.money ?? 0, inCar: null,
    focusPos() { return this.inCar ? this.inCar.pos : this.player.pos; },
    onCrash(lost) {
      const now = performance.now();
      if (now - lastCrash < 350) return;
      lastCrash = now; shake = clamp(lost / 14, 0.15, 1); audio.crash(lost);
    },
    save() {
      const p = this.focusPos();
      writeSave({
        money: this.money, missionN: this.missions.n, stepIdx: this.missions.stepIdx,
        player: { x: p.x, z: p.z }, inCar: this.inCar ? this.inCar.id : null,
        cars: this.vehicles.serializeOwned(), camYaw,
      });
    },
  };
  let lastCrash = 0, shake = 0;
  let camYaw = save?.camYaw ?? Math.PI / 2, camPitch = 0.3, camDist = 5;

  game.vehicles = new VehicleManager(game);
  game.vehicles.restoreOwned(save?.cars);
  game.city = new City(game);
  const startPos = save?.player ?? { x: 10, z: 10 };
  game.city.loadAround(startPos.x, startPos.z, 2);
  game.player = new Player(game, startPos.x, startPos.z, camYaw);
  game.traffic = new Traffic(game, 26);
  game.traffic.populate(startPos.x, startPos.z);
  game.missions = new Missions(game, save);

  function enterCar(car) {
    game.inCar = car; car.setOccupied(true); game.player.setHidden(true);
    hud.toast('', 1); $('toast').classList.add('hidden');
  }
  if (save?.inCar && game.vehicles.cars.get(save.inCar)) enterCar(game.vehicles.cars.get(save.inCar));

  function exitCar() {
    const car = game.inCar; if (!car) return;
    if (Math.abs(car.speed) > EXIT_SPEED) { hud.toast('车速太快，无法下车', 1200); return; }
    const p = car.pos, h = car.heading, rx = -Math.cos(h), rz = Math.sin(h), fx = Math.sin(h), fz = Math.cos(h);
    const cands = [[-2.4, 0], [2.4, 0], [-2.4, 2.8], [2.4, 2.8], [0, -3.4]];  // 左侧优先
    let spot = cands[0];
    for (const c of cands) {
      const x = p.x + rx * c[0] + fx * c[1], z = p.z + rz * c[0] + fz * c[1];
      const hit = world.intersectionWithShape({ x, y: 0.95, z }, { x: 0, y: 0, z: 0, w: 1 },
        new RAPIER.Capsule(0.5, 0.35), undefined, undefined, undefined, car.rb);
      if (!hit) { spot = c; break; }
    }
    car.setOccupied(false); game.inCar = null;
    game.player.setHidden(false);
    game.player.teleport(p.x + rx * spot[0] + fx * spot[1], p.z + rz * spot[0] + fz * spot[1]);
    game.player.yaw = h;
    audio.engine(false, 0, 0);
  }

  function interact() {
    if (game.inCar) return exitCar();
    const p = game.player.pos, car = game.vehicles.nearest(p.x, p.z, 4.6);
    if (car) enterCar(car);
  }

  // ---------------- UI：开始 / 暂停 / 指针锁定 ----------------
  let paused = true, started = false, noLockMode = false, skipSave = false;
  const overlay = $('overlay');
  $('loadState').classList.add('hidden'); $('menu').classList.remove('hidden');
  function resume() {
    started = true; paused = false; audio.start(); hud.show(true); overlay.classList.add('hidden');
    try { const r = canvas.requestPointerLock(); if (r?.catch) r.catch(() => {}); } catch { noLockMode = true; }
  }
  $('startBtn').addEventListener('click', resume);
  $('resetBtn').addEventListener('click', () => { skipSave = true; clearSave(); location.reload(); });
  canvas.addEventListener('click', () => { if (!paused && !input.locked && !noLockMode) { try { canvas.requestPointerLock(); } catch {} } });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked && started && !noLockMode) { paused = true; overlay.classList.remove('hidden'); game.save(); }
  });
  document.addEventListener('pointerlockerror', () => { noLockMode = true; paused = false; overlay.classList.add('hidden'); });
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  });
  addEventListener('beforeunload', () => { if (!skipSave) game.save(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !skipSave) game.save(); });

  // ---------------- 主循环 ----------------
  const clock = new THREE.Clock();
  const camTarget = new THREE.Vector3(), camDir = new THREE.Vector3();
  let time = 0, saveT = 0;

  function update(dt) {
    time += dt;

    // 视角输入
    const m = input.consumeMouse();
    camYaw -= m.dx * 0.0024; camPitch = clamp(camPitch + m.dy * 0.0024, -0.05, 1.25);
    camYaw += input.axis('ArrowRight', 'ArrowLeft') * 1.9 * dt;
    camPitch = clamp(camPitch + input.axis('ArrowUp', 'ArrowDown') * 1.2 * dt, -0.05, 1.25);

    if (input.pressed('KeyE')) interact();
    if (input.pressed('KeyR') && game.inCar) {
      const c = game.inCar, p = c.pos, s = snapToLane(p.x, p.z, c.heading);
      c.teleport(s.x, s.z, s.heading); hud.toast('载具已重置', 900);
    }

    // 控制
    let throttle = 0;
    if (game.inCar) {
      const inp = { throttle: input.axis('KeyS', 'KeyW'), steer: input.axis('KeyD', 'KeyA'), brake: input.down('Space') };
      throttle = Math.abs(inp.throttle);
      game.inCar.update(dt, inp);
    } else game.player.update(dt, input, camYaw);
    for (const c of game.vehicles.cars.values()) if (c !== game.inCar) c.update(dt, null);

    // 交通：障碍物 = 所有可驾驶车辆 + 步行的玩家
    const fp = game.focusPos();
    const obstacles = [];
    for (const c of game.vehicles.cars.values()) { const p = c.rb.translation(); obstacles.push({ x: p.x, z: p.z, car: true }); }
    if (!game.inCar) obstacles.push({ x: fp.x, z: fp.z, car: false });
    game.traffic.update(dt, fp.x, fp.z, obstacles);

    // 物理步进
    world.timestep = clamp(dt, 1 / 240, 1 / 30);
    world.step();

    for (const c of game.vehicles.cars.values()) c.sync(dt);
    game.player.sync();

    // 世界流式加载 & 任务
    game.city.update(fp.x, fp.z, 1);
    game.missions.update(dt, time);

    // 音频
    audio.engine(!!game.inCar, game.inCar ? Math.abs(game.inCar.speed) : 0, throttle);

    // 交互提示
    let prompt = null;
    if (game.inCar) { if (Math.abs(game.inCar.speed) < EXIT_SPEED) prompt = '[E] 下车'; }
    else if (game.vehicles.nearest(fp.x, fp.z, 4.6)) prompt = '[E] 驾驶车辆';
    hud.setPrompt(prompt);

    // 自动存档
    saveT += dt; if (saveT > 2.5) { saveT = 0; game.save(); }

    updateCamera(dt, fp);

    hud.frame(dt, {
      money: game.money, mission: game.missions.info,
      kmh: (game.inCar ? game.inCar.speed : (game.player.speedH || 0)) * 3.6,
      chunks: game.city.chunks.size, traffic: game.traffic.cars.length,
      px: fp.x, pz: fp.z, yaw: camYaw, target: game.missions.target,
      trafficPts: game.traffic.cars.map((c) => [c.pose.x, c.pose.z]),
    });
  }

  function updateCamera(dt, fp) {
    const car = game.inCar;
    // 驾车时，若一段时间没动鼠标，视角自动回到车尾
    if (car && performance.now() - input.lastMouseT > 1300 && Math.abs(car.speed) > 3) {
      const want = car.heading + (car.speed < -3 ? Math.PI : 0);
      camYaw += angDiff(camYaw, want) * Math.min(1, 2.4 * dt);
    }
    camTarget.set(fp.x, car ? fp.y + 0.95 : fp.y + 0.78, fp.z);
    const wantDist = car ? 8.3 + Math.min(Math.abs(car.speed), 30) * 0.07 : 5;
    camDir.set(-Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), -Math.cos(camYaw) * Math.cos(camPitch));

    // 相机碰撞：射线打到建筑就拉近
    const hit = world.castRay(new RAPIER.Ray(camTarget, camDir), wantDist, true, undefined, undefined, undefined, car ? car.rb : game.player.rb);
    const limit = hit ? Math.max(1.4, hit.timeOfImpact - 0.35) : wantDist;
    camDist = limit < camDist ? limit : camDist + (limit - camDist) * Math.min(1, 3 * dt);

    camera.position.copy(camTarget).addScaledVector(camDir, camDist);
    if (shake > 0.01) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * shake * 0.5;
      shake *= Math.exp(-6 * dt);
    }
    camera.lookAt(camTarget);
    const fov = 62 + (car ? Math.min(Math.abs(car.speed), 30) * 0.45 : 0);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, 4 * dt); camera.updateProjectionMatrix(); }

    sky.position.copy(camera.position);
    sun.target.position.copy(camTarget);
    sun.position.copy(camTarget).addScaledVector(sunDir, 130);
  }

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!paused) {
      try { update(dt); } catch (e) { console.error(e); }
    }
    input.endFrame();
    renderer.render(scene, camera);
  }
  updateCamera(0.016, game.focusPos());
  frame();
  window.__game = game;   // 方便在控制台调试
}

boot().catch((e) => {
  console.error(e);
  const s = $('loadState'); if (s) s.textContent = '启动失败：' + (e?.message || e);
});
