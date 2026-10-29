import * as THREE from 'three';
import { P, ROAD_HALF, LANE, DIRS, CAR_COLORS, TAU, yawQuat } from './config.js';
import { buildCarMesh } from './vehicles.js';

// ---------------- 路径：全部用二次贝塞尔表示（直线 = 控制点取中点） ----------------
const entryPt = (I, J, d) => {
  const f = DIRS[d], r = { x: -f.z, z: f.x };
  return { x: I * P - f.x * ROAD_HALF + r.x * LANE, z: J * P - f.z * ROAD_HALF + r.z * LANE };
};
const exitPt = (I, J, d) => {
  const f = DIRS[d], r = { x: -f.z, z: f.x };
  return { x: I * P + f.x * ROAD_HALF + r.x * LANE, z: J * P + f.z * ROAD_HALF + r.z * LANE };
};
function makePath(p0, p1, p2) {
  let len = 0, px = p0.x, pz = p0.z;
  for (let k = 1; k <= 10; k++) {
    const t = k / 10, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    const x = a * p0.x + b * p1.x + c * p2.x, z = a * p0.z + b * p1.z + c * p2.z;
    len += Math.hypot(x - px, z - pz); px = x; pz = z;
  }
  return { p0, p1, p2, len };
}
/** 路段：从 (I,J) 路口出口，直行到下一个路口入口 */
function segmentPath(I, J, d) {
  const p0 = exitPt(I, J, d), p2 = entryPt(I + DIRS[d].x, J + DIRS[d].z, d);
  return makePath(p0, { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 }, p2);
}
/** 路口内：从入口方向 dIn 转到出口方向 dOut */
function turnPath(I, J, dIn, dOut) {
  const p0 = entryPt(I, J, dIn), p2 = exitPt(I, J, dOut), f = DIRS[dIn];
  let p1;
  if (dIn === dOut) p1 = { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 };
  else { const k = (p2.x - p0.x) * f.x + (p2.z - p0.z) * f.z; p1 = { x: p0.x + f.x * k, z: p0.z + f.z * k }; }
  return makePath(p0, p1, p2);
}
function evalPath(path, t, out) {
  const { p0, p1, p2 } = path, u = 1 - t;
  out.x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
  out.z = u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z;
  const tx = 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
  const tz = 2 * u * (p1.z - p0.z) + 2 * t * (p2.z - p1.z);
  out.h = Math.atan2(tx, tz);
}

class TrafficCar {
  constructor(game, I, J, d, t) {   // (I,J,d)：刚离开的路口与方向
    this.game = game;
    this.dir = d;
    this.nodeI = I + DIRS[d].x; this.nodeJ = J + DIRS[d].z;   // 正在驶向的路口
    this.state = 'seg';
    this.path = segmentPath(I, J, d);
    this.t = t;
    this.cruise = 8.5 + Math.random() * 5;
    this.speed = this.cruise;
    this.stuck = 0; this.ghost = 0;
    this.pose = { x: 0, z: 0, h: 0 };
    this.outDir = d;
    evalPath(this.path, this.t, this.pose);

    const { RAPIER, world, scene } = game;
    this.rb = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pose.x, 0.62, this.pose.z));
    this.collider = world.createCollider(RAPIER.ColliderDesc.cuboid(0.95, 0.6, 2.2).setFriction(0), this.rb);
    const m = buildCarMesh(CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]);
    this.mesh = m.group; this.spinners = m.spinners; this.frontPivots = m.frontPivots; this.tailMat = m.tailMat;
    this.wheelAngle = 0;
    scene.add(this.mesh);
    this.apply();
  }

  /** 前方障碍检测 → 目标速度；再加减速到目标速度 */
  step(dt, obstacles, others) {
    const { x, z, h } = this.pose;
    const fx = Math.sin(h), fz = Math.cos(h), rx = -fz, rz = fx;
    let gap = Infinity;
    const scan = (ox, oz, half, width) => {
      const dx = ox - x, dz = oz - z;
      const along = dx * fx + dz * fz;
      if (along < 0.5 || along > 24) return;
      if (Math.abs(dx * rx + dz * rz) > width) return;
      gap = Math.min(gap, along - half);
    };
    // 玩家 / 行人 / 其他可驾驶车辆：永远要避让
    for (const o of obstacles) scan(o.x, o.z, o.car ? 4.4 : 2.4, o.car ? 2.3 : 1.7);
    // 其他交通车：路口互相卡死时，“幽灵通过”几秒打破死锁（交通车之间不会物理碰撞）
    if (this.ghost <= 0) for (const o of others) if (o !== this) scan(o.pose.x, o.pose.z, 4.4, 2.3);
    const cruise = this.state === 'turn' ? Math.min(this.cruise, 6) : this.cruise;
    const safe = gap === Infinity ? cruise : Math.sqrt(2 * 5 * Math.max(gap - 1.2, 0));
    const target = Math.min(cruise, safe);
    if (this.speed < target) this.speed = Math.min(target, this.speed + 4 * dt);
    else this.speed = Math.max(target, this.speed - 10 * dt);
    this.braking = this.speed > target + 0.3;

    // 被堵死太久就“幽灵通过”几秒，避免路口死锁
    if (target < 0.3 && this.speed < 0.3) this.stuck += dt; else this.stuck = 0;
    if (this.stuck > 3.5) { this.ghost = 3; this.stuck = 0; }
    if (this.ghost > 0) this.ghost -= dt;

    this.t += this.speed * dt / this.path.len;
    while (this.t >= 1) { this.t -= 1; this.nextPath(); }
    evalPath(this.path, this.t, this.pose);
    this.wheelAngle += this.speed * dt / 0.36;
    this.apply();
  }

  nextPath() {
    if (this.state === 'seg') {            // 到达路口入口：随机选择直行/右转/左转
      const r = Math.random();
      this.outDir = r < 0.2 ? (this.dir + 1) % 4 : r < 0.4 ? (this.dir + 3) % 4 : this.dir;
      this.path = turnPath(this.nodeI, this.nodeJ, this.dir, this.outDir);
      this.state = 'turn';
    } else {                               // 驶出路口：进入下一路段
      this.dir = this.outDir;
      this.path = segmentPath(this.nodeI, this.nodeJ, this.dir);
      this.nodeI += DIRS[this.dir].x; this.nodeJ += DIRS[this.dir].z;
      this.state = 'seg';
    }
  }

  apply() {
    const { x, z, h } = this.pose;
    this.rb.setNextKinematicTranslation({ x, y: 0.62, z });
    this.rb.setNextKinematicRotation(yawQuat(h));
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = h;
    for (const s of this.spinners) s.rotation.x = this.wheelAngle;
    this.tailMat.color.setHex(this.braking ? 0xff2a2a : 0x6a0d0d);
  }

  dispose() {
    this.game.scene.remove(this.mesh);
    this.game.world.removeCollider(this.collider, false);
    this.game.world.removeRigidBody(this.rb);
  }
}

export class Traffic {
  constructor(game, target = 26) {
    this.game = game; this.target = target; this.cars = []; this.cool = 0;
  }

  /** 在玩家周围 [minD, maxD] 的环形区域内，选一条随机车道放一辆车 */
  spawnOne(fx, fz, minD, maxD) {
    for (let a = 0; a < 10; a++) {
      const ang = Math.random() * TAU, dist = minD + Math.random() * (maxD - minD);
      const qx = fx + Math.cos(ang) * dist, qz = fz + Math.sin(ang) * dist;
      let I, J, d;
      if (Math.random() < 0.5) { J = Math.round(qz / P); d = Math.random() < 0.5 ? 0 : 2; I = Math.floor(qx / P) + (d === 2 ? 1 : 0); }
      else { I = Math.round(qx / P); d = Math.random() < 0.5 ? 1 : 3; J = Math.floor(qz / P) + (d === 3 ? 1 : 0); }
      const car = new TrafficCar(this.game, I, J, d, Math.random() * 0.95);
      const { x, z } = car.pose;
      const bad = Math.hypot(x - fx, z - fz) < minD * 0.9 || this.cars.some((o) => Math.hypot(o.pose.x - x, o.pose.z - z) < 10);
      if (bad) { car.dispose(); continue; }
      this.cars.push(car); return true;
    }
    return false;
  }

  populate(fx, fz) {
    for (let n = 0; n < this.target; n++) this.spawnOne(fx, fz, 45, 230);
  }

  update(dt, fx, fz, obstacles) {
    for (const c of this.cars) c.step(dt, obstacles, this.cars);
    // 过远的删除
    for (let k = this.cars.length - 1; k >= 0; k--) {
      const c = this.cars[k];
      if (Math.hypot(c.pose.x - fx, c.pose.z - fz) > 290) { c.dispose(); this.cars.splice(k, 1); }
    }
    this.cool -= dt;
    if (this.cars.length < this.target && this.cool <= 0) { this.spawnOne(fx, fz, 150, 240); this.cool = 0.3; }
  }
}
