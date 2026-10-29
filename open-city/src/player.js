import * as THREE from 'three';
import { angDiff, clamp } from './config.js';

const FEET = 0.85;   // 胶囊中心到脚底的距离

function buildHumanoid() {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, c, x, y, z, parent = g) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  };
  box(0.52, 0.7, 0.3, 0x2f6fd0, 0, 1.15, 0);        // 躯干
  box(0.3, 0.3, 0.3, 0xe8b894, 0, 1.68, 0);         // 头
  box(0.32, 0.12, 0.32, 0x2a1d14, 0, 1.86, -0.02);  // 头发
  const limb = (x, y, w, h, c) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0); g.add(pivot);
    box(w, h, w, c, 0, -h / 2, 0, pivot); return pivot;
  };
  const legL = limb(-0.14, 0.8, 0.2, 0.8, 0x2b2f3a);
  const legR = limb(0.14, 0.8, 0.2, 0.8, 0x2b2f3a);
  const armL = limb(-0.36, 1.46, 0.16, 0.62, 0xe8b894);
  const armR = limb(0.36, 1.46, 0.16, 0.62, 0xe8b894);
  return { group: g, legL, legR, armL, armR };
}

export class Player {
  constructor(game, x, z, yaw = 0) {
    this.game = game;
    const { RAPIER, world, scene } = game;
    this.rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, FEET + 0.02, z)
        .enabledRotations(false, false, false).setLinearDamping(0).setCcdEnabled(true)
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(0.5, 0.35).setFriction(0).setDensity(170), this.rb
    );
    const h = buildHumanoid(); Object.assign(this, h);
    this.mesh = h.group;
    this.yaw = yaw;
    this.phase = 0;
    this.grounded = true;
    this.hidden = false;
    this.lastSafe = { x, z };
    scene.add(this.mesh);
    this.sync(0);
  }

  get pos() { const t = this.rb.translation(); return { x: t.x, y: t.y, z: t.z }; }

  setHidden(v) {
    this.hidden = v;
    this.mesh.visible = !v;
    this.rb.setEnabled(!v);
  }

  teleport(x, z) {
    this.rb.setTranslation({ x, y: FEET + 0.05, z }, true);
    this.rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }

  update(dt, input, camYaw) {
    if (this.hidden) return;
    const { RAPIER, world } = this.game;
    const t = this.rb.translation(), v = this.rb.linvel();

    // 地面检测：向下发射射线（排除自身）
    const hit = world.castRay(new RAPIER.Ray(t, { x: 0, y: -1, z: 0 }), 1.2, true, undefined, undefined, undefined, this.rb);
    this.grounded = !!hit && hit.timeOfImpact < FEET + 0.12 && v.y < 2;

    // 相机相对的移动方向
    const iz = input.axis('KeyS', 'KeyW'), ix = input.axis('KeyA', 'KeyD');
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -fz, rz = fx;
    let mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
    const len = Math.hypot(mx, mz);
    const moving = len > 0.01;
    if (moving) { mx /= len; mz /= len; }
    const speed = input.down('ShiftLeft') || input.down('ShiftRight') ? 8 : 4.2;
    const k = 1 - Math.exp(-(this.grounded ? 14 : 4) * dt);
    const vx = v.x + ((moving ? mx * speed : 0) - v.x) * k;
    const vz = v.z + ((moving ? mz * speed : 0) - v.z) * k;
    let vy = v.y;
    if (this.grounded && input.pressed('Space')) { vy = 7; this.grounded = false; }
    this.rb.setLinvel({ x: vx, y: vy, z: vz }, true);

    // 朝向与动画
    if (moving) this.yaw += angDiff(this.yaw, Math.atan2(mx, mz)) * Math.min(1, 12 * dt);
    const hs = Math.hypot(vx, vz);
    this.phase += hs * dt * 1.7;
    const amp = clamp(hs / 6, 0, 1) * 0.9;
    const sw = Math.sin(this.phase) * amp;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    this.armL.rotation.x = -sw; this.armR.rotation.x = sw;
    this.speedH = hs;

    if (this.grounded && t.y > 0.5 && t.y < 1.2) this.lastSafe = { x: t.x, z: t.z };
    if (t.y < -5) this.teleport(this.lastSafe.x, this.lastSafe.z);
  }

  sync() {
    const t = this.rb.translation();
    this.mesh.position.set(t.x, t.y - FEET, t.z);
    this.mesh.rotation.y = this.yaw;
  }
}
