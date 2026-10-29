import * as THREE from 'three';
import { yawQuat, yawFromQuat, clamp, CAR_COLORS } from './config.js';

// ---------- 共享几何体 / 材质（所有车辆复用，减少 draw call 与显存） ----------
let S = null;
function shared() {
  if (S) return S;
  S = {
    body: new THREE.BoxGeometry(1.9, 0.62, 4.4),
    cabin: new THREE.BoxGeometry(1.66, 0.5, 2.3),
    roof: new THREE.BoxGeometry(1.7, 0.08, 2.0),
    bumper: new THREE.BoxGeometry(1.94, 0.2, 0.2),
    light: new THREE.BoxGeometry(0.42, 0.16, 0.08),
    wheel: new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14),
    glass: new THREE.MeshLambertMaterial({ color: 0x1b2837 }),
    tire: new THREE.MeshLambertMaterial({ color: 0x141414 }),
    head: new THREE.MeshBasicMaterial({ color: 0xfff4c8 }),
    bodyMats: new Map(),
  };
  S.wheel.rotateZ(Math.PI / 2); // 轮轴沿 X
  return S;
}
function bodyMat(color) {
  const s = shared();
  if (!s.bodyMats.has(color)) s.bodyMats.set(color, new THREE.MeshLambertMaterial({ color }));
  return s.bodyMats.get(color);
}

/** 构建一辆车的可视模型。原点在地面中心，车头朝 +Z */
export function buildCarMesh(color) {
  const s = shared();
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
  };
  const bm = bodyMat(color);
  add(s.body, bm, 0, 0.62, 0);
  add(s.cabin, s.glass, 0, 1.18, -0.2);
  add(s.roof, bm, 0, 1.46, -0.2);
  add(s.bumper, s.tire, 0, 0.42, 2.2);
  add(s.bumper, s.tire, 0, 0.42, -2.2);
  add(s.light, s.head, 0.65, 0.72, 2.2);
  add(s.light, s.head, -0.65, 0.72, 2.2);
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x6a0d0d });
  add(s.light, tailMat, 0.7, 0.72, -2.2);
  add(s.light, tailMat, -0.7, 0.72, -2.2);

  const frontPivots = [], spinners = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(sx * 0.95, 0.36, sz * 1.4);
      const spin = new THREE.Group();
      const w = new THREE.Mesh(s.wheel, s.tire); w.castShadow = true;
      spin.add(w); pivot.add(spin); g.add(pivot);
      spinners.push(spin);
      if (sz > 0) frontPivots.push(pivot);
    }
  }
  return { group: g, frontPivots, spinners, tailMat };
}

const HALF = { x: 0.95, y: 0.6, z: 2.2 };
const REST_Y = 0.62; // 车体碰撞盒中心高度

// ---------- 玩家可驾驶车辆（动态刚体 + 街机式操控） ----------
export class Car {
  constructor(game, def) {
    this.game = game;
    this.id = def.id;
    this.color = def.color;
    this.owned = !!def.owned;
    this.occupied = false;
    this.speed = 0;        // 沿车头方向的有符号速度 m/s
    this.cmdSf = 0;
    this.steer = 0;
    this.wheelAngle = 0;
    this.heading = def.heading;
    this.isStart = def.id === 'start';

    const { RAPIER, world, scene } = game;
    this.rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(def.x, REST_Y, def.z)
        .setRotation(yawQuat(def.heading))
        .enabledRotations(false, true, false)   // 只允许绕 Y 旋转（不会翻车）
        .setLinearDamping(4)
        .setCcdEnabled(true)
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(HALF.x, HALF.y, HALF.z).setDensity(300).setFriction(0).setRestitution(0.12), this.rb
    );

    const m = buildCarMesh(def.color);
    Object.assign(this, { mesh: m.group, frontPivots: m.frontPivots, spinners: m.spinners, tailMat: m.tailMat });
    scene.add(this.mesh);
    this.sync();
  }

  get pos() { const t = this.rb.translation(); return { x: t.x, y: t.y, z: t.z }; }

  setOccupied(v) {
    this.occupied = v;
    if (v) { this.cmdSf = this.speed;
      this.owned = true; this.game.vehicles.taken.add(this.id); }
    this.rb.setLinearDamping(v ? 0 : 4);
  }

  /** input: { throttle:-1..1, steer:-1..1(左为正), brake:bool }，null 表示无人驾驶 */
  update(dt, input) {
    const rb = this.rb;
    const h = yawFromQuat(rb.rotation());
    this.heading = h;
    const v = rb.linvel();
    const fx = Math.sin(h), fz = Math.cos(h), rx = -fz, rz = fx;
    let sf = v.x * fx + v.z * fz;      // 前向速度
    let lat = v.x * rx + v.z * rz;     // 侧向速度
    this.speed = sf;

    if (!input) {
      // 无人驾驶：几乎静止时放任刚体休眠，否则快速衰减
      if (Math.abs(sf) < 0.15 && Math.abs(lat) < 0.15 && Math.abs(v.y) < 0.2) { this.setBrake(false); return; }
      const k = Math.exp(-5 * dt);
      rb.setLinvel({ x: v.x * k, y: v.y, z: v.z * k }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      this.setBrake(false);
      return;
    }

    // 碰撞检测：本帧实测速度比上一帧指令速度掉得多，说明撞到东西了
    const lost = this.cmdSf - sf;
    if (lost > 6) this.game.onCrash(lost);

    const MAX_F = 28, MAX_R = 9, ACC = 13;
    const t = input.throttle;
    let braking = false;
    if (t > 0) {
      if (sf < -0.5) { sf += 30 * dt; braking = true; }
      else sf += ACC * (1 - Math.max(sf, 0) / MAX_F) * t * dt;
    } else if (t < 0) {
      if (sf > 0.5) { sf -= 28 * dt; braking = true; }
      else sf = Math.max(sf - 9 * dt, -MAX_R);
    } else {
      const d = Math.min(Math.abs(sf), 3.2 * dt); sf -= Math.sign(sf) * d;   // 发动机制动
    }
    if (input.brake) {
      const d = Math.min(Math.abs(sf), 26 * dt); sf -= Math.sign(sf) * d; braking = true;
    }

    // 侧向抓地：手刹时松开，产生漂移
    lat *= Math.exp(-(input.brake ? 1.3 : 9) * dt);

    // 转向：速度越快，可用转角越小
    const MAXS = 0.62, WB = 2.7;
    const target = input.steer * MAXS / (1 + Math.pow(Math.abs(sf) / 11, 1.4));
    this.steer += (target - this.steer) * Math.min(1, 9 * dt);
    let yaw = (sf / WB) * Math.tan(this.steer);
    if (input.brake) yaw *= 1.35;

    this.cmdSf = sf;
    rb.setLinvel({ x: fx * sf + rx * lat, y: v.y, z: fz * sf + rz * lat }, true);
    rb.setAngvel({ x: 0, y: yaw, z: 0 }, true);
    this.setBrake(braking);
  }

  setBrake(on) { this.tailMat.color.setHex(on ? 0xff2a2a : 0x6a0d0d); }

  /** 物理步进之后同步可视模型 */
  sync(dt = 0) {
    const t = this.rb.translation(), q = this.rb.rotation();
    this.mesh.position.set(t.x, t.y - REST_Y, t.z);
    this.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    this.wheelAngle += this.speed * dt / 0.36;
    for (const s of this.spinners) s.rotation.x = this.wheelAngle;
    for (const p of this.frontPivots) p.rotation.y = this.steer;
  }

  teleport(x, z, heading) {
    this.rb.setTranslation({ x, y: REST_Y, z }, true);
    this.rb.setRotation(yawQuat(heading), true);
    this.rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.cmdSf = 0; this.speed = 0; this.heading = heading;
  }

  dispose() {
    this.game.scene.remove(this.mesh);
    this.game.world.removeCollider(this.collider, false);
    this.game.world.removeRigidBody(this.rb);
  }
}

// ---------- 载具管理：路边停放车辆随区块出现/消失，被开走的车会被记住 ----------
export class VehicleManager {
  constructor(game) {
    this.game = game;
    this.cars = new Map();
    this.taken = new Set();   // 已被玩家占有的车 id：不会再在原位置重新生成
  }

  spawnParked(def) {
    if (this.taken.has(def.id) || this.cars.has(def.id)) return;
    this.cars.set(def.id, new Car(this.game, def));
  }

  despawnParked(id) {
    const c = this.cars.get(id);
    if (c && !c.owned) { c.dispose(); this.cars.delete(id); }
  }

  restoreOwned(list) {
    for (const d of list || []) {
      this.taken.add(d.id);
      if (!this.cars.has(d.id)) this.cars.set(d.id, new Car(this.game, { ...d, heading: d.h, owned: true }));
    }
  }

  serializeOwned() {
    const out = [];
    for (const c of this.cars.values()) {
      if (!c.owned) continue;
      const p = c.pos;
      out.push({ id: c.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), h: +c.heading.toFixed(3), color: c.color });
    }
    return out;
  }

  nearest(x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const c of this.cars.values()) {
      if (c.occupied) continue;
      const p = c.rb.translation();
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
}
