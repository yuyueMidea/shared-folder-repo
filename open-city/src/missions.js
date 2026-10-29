import * as THREE from 'three';
import { P, mulberry32, hash2 } from './config.js';

// ---------- 任务定义 ----------
// 第 0 单是手写的新手任务；之后的任务由种子随机生成，永不枯竭。
// 每个任务由 3 个步骤组成：上车 → 开到指定路口并停车 → 下车步行进入任务区域
const cache = [];
export function makeMission(n) {
  if (cache[n]) return cache[n];
  let m;
  if (n === 0) {
    m = {
      title: '第一单：送货上门', reward: 500,
      steps: [
        { type: 'getCar', text: '走到闪烁的橙色轿车旁，按 E 上车' },
        { type: 'driveTo', x: 4 * P, z: 1 * P, r: 10, text: '驾车前往小地图上的黄点：沿大路向东，穿过几个路口，避让车辆。到达后减速停车' },
        { type: 'walkTo', x: 4 * P + 10, z: 1 * P + 34, r: 4, text: '按 E 下车，步行进入黄色任务区域' },
      ],
    };
  } else {
    const prev = makeMission(n - 1).steps[2];
    const pI = Math.round((prev.x - 10) / P), pJ = Math.floor(prev.z / P);
    const rng = mulberry32(hash2(n, 7, 3));
    let I = pI, J = pJ;
    for (let k = 0; k < 40; k++) {
      I = pI + Math.round((rng() - 0.5) * 14); J = pJ + Math.round((rng() - 0.5) * 14);
      if (Math.abs(I - pI) + Math.abs(J - pJ) >= 4 && Math.abs(I) <= 14 && Math.abs(J) <= 14) break;
    }
    const dist = Math.abs(I - pI) + Math.abs(J - pJ);
    m = {
      title: `委托 #${n + 1}`, reward: 200 + dist * 60,
      steps: [
        { type: 'getCar', text: '找一辆车，走近按 E 上车' },
        { type: 'driveTo', x: I * P, z: J * P, r: 10, text: '驾车前往小地图上的黄点路口，到达后减速停车' },
        { type: 'walkTo', x: I * P + 10, z: J * P + 20 + rng() * 30, r: 4, text: '按 E 下车，步行进入黄色任务区域' },
      ],
    };
  }
  cache[n] = m;
  return m;
}

// ---------- 任务标记：地面圆环 + 光柱 ----------
function makeMarker() {
  const g = new THREE.Group();
  const col = 0xffcf3f;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 64), new THREE.MeshBasicMaterial({ color: col, fog: false }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.15; g.add(ring);
  const disk = new THREE.Mesh(new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.2, depthWrite: false }));
  disk.rotation.x = -Math.PI / 2; disk.position.y = 0.12; g.add(disk);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 70, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 35; g.add(beam);
  g.visible = false;
  return { group: g, ring, beam };
}

export class Missions {
  constructor(game, save) {
    this.game = game;
    this.n = save?.missionN ?? 0;
    this.stepIdx = save?.stepIdx ?? 0;
    this.mission = makeMission(this.n);
    this.marker = makeMarker();
    game.scene.add(this.marker.group);
    this.target = null;
    this.info = { title: '', text: '', dist: 0 };
  }

  get step() { return this.mission.steps[this.stepIdx]; }

  update(dt, time) {
    const g = this.game, s = this.step, pp = g.focusPos();
    let target = null, done = false;

    if (s.type === 'getCar') {
      if (g.inCar) done = true;
      else {
        const car = g.vehicles.cars.get('start') && this.n === 0 ? g.vehicles.cars.get('start') : g.vehicles.nearest(pp.x, pp.z, 300);
        if (car) { const p = car.pos; target = { x: p.x, z: p.z, r: 2.6 }; }
      }
    } else if (s.type === 'driveTo') {
      target = { x: s.x, z: s.z, r: s.r };
      if (g.inCar && Math.hypot(pp.x - s.x, pp.z - s.z) < s.r && Math.abs(g.inCar.speed) < 5.5) done = true;
    } else if (s.type === 'walkTo') {
      target = { x: s.x, z: s.z, r: s.r };
      if (!g.inCar && Math.hypot(pp.x - s.x, pp.z - s.z) < s.r) done = true;
    }

    this.target = target;
    const mk = this.marker;
    if (target) {
      mk.group.visible = true;
      mk.group.position.set(target.x, 0, target.z);
      const pulse = 1 + Math.sin(time * 4) * 0.04;
      mk.group.scale.set(target.r * pulse, 1, target.r * pulse);
      mk.beam.material.opacity = 0.12 + 0.06 * (0.5 + 0.5 * Math.sin(time * 3));
    } else mk.group.visible = false;

    let text = s.text;
    if (s.type === 'walkTo' && g.inCar) text = '按 E 下车（车速降到 15 km/h 以下），然后步行进入黄色任务区域';
    if (s.type === 'driveTo' && !g.inCar) text = '回到车上（靠近车辆按 E），继续前往黄点';
    this.info.title = `${this.mission.title}  ·  报酬 $${this.mission.reward}`;
    this.info.text = text;
    this.info.dist = target ? Math.hypot(pp.x - target.x, pp.z - target.z) : 0;

    if (done) this.advance();
  }

  advance() {
    const g = this.game;
    this.stepIdx++;
    if (this.stepIdx >= this.mission.steps.length) {
      g.money += this.mission.reward;
      g.hud.toast(`任务完成！\n+$${this.mission.reward}`, 3600);
      g.audio.chime();
      this.n++; this.stepIdx = 0; this.mission = makeMission(this.n);
    } else {
      g.hud.toast(this.stepIdx === 1 ? '目的地已标记' : '到达！下车吧', 1800);
    }
    g.save();
  }
}
