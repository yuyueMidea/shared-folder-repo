import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  P, LOAD_R, UNLOAD_R, PARK, DIRS, CAR_COLORS, START_CAR_COLOR, mulberry32, hash2,
} from './config.js';

const PALETTE = [0xe8dcc4, 0xcfd8e3, 0xb85c46, 0xa8a39a, 0xf0e6d0, 0xb6d1c2, 0x9aa6b8, 0xd9b68f];

/** 程序化立面贴图：一个 4m×3.5m 的“窗格”单元，(0,0) 处是纯墙面色，供屋顶/地面等无纹理物体采样 */
function makeFacadeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  const grad = g.createLinearGradient(0, 26, 0, 102);
  grad.addColorStop(0, '#6f90b8'); grad.addColorStop(1, '#2a3650');
  g.fillStyle = grad; g.fillRect(22, 26, 84, 76);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(22, 26, 84, 5);
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(62, 26, 4, 76);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(14, 108, 100, 5);   // 窗台阴影
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 把很多方块合并成一个网格的批处理器（每区块只产生 2 个 draw call） */
class Batch {
  constructor() { this.geos = []; }
  box(cx, cy, cz, sx, sy, sz, color, facade = false) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(cx, cy, cz);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3); const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uv = g.attributes.uv;
    if (facade) {
      // 侧面按尺寸重复窗格；顶/底面取墙色像素
      const sizes = [sz, sz, 0, 0, sx, sx];
      const fv = Math.max(1, Math.round(sy / 3.5));
      for (let f = 0; f < 6; f++) {
        for (let k = 0; k < 4; k++) {
          const i = f * 4 + k;
          if (f === 2 || f === 3) uv.setXY(i, 0.01, 0.01);
          else uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(sizes[f] / 4)), uv.getY(i) * fv);
        }
      }
    } else {
      for (let i = 0; i < n; i++) uv.setXY(i, 0.01, 0.01);
    }
    this.geos.push(g);
  }
  build() {
    if (!this.geos.length) return null;
    const m = mergeGeometries(this.geos, false);
    this.geos.forEach((g) => g.dispose());
    return m;
  }
}

export class City {
  constructor(game) {
    this.game = game;
    this.chunks = new Map();
    this.material = new THREE.MeshLambertMaterial({ map: makeFacadeTexture(), vertexColors: true });
  }

  update(px, pz, maxBuild = 1) {
    const ci = Math.floor(px / P), cj = Math.floor(pz / P);
    for (const [k, c] of this.chunks) {
      if (Math.max(Math.abs(c.i - ci), Math.abs(c.j - cj)) > UNLOAD_R) { this.unload(k, c); }
    }
    const need = [];
    for (let di = -LOAD_R; di <= LOAD_R; di++) for (let dj = -LOAD_R; dj <= LOAD_R; dj++) {
      if (!this.chunks.has(`${ci + di},${cj + dj}`)) need.push({ i: ci + di, j: cj + dj, d: di * di + dj * dj });
    }
    need.sort((a, b) => a.d - b.d);
    for (let n = 0; n < Math.min(maxBuild, need.length); n++) this.build(need[n].i, need[n].j);
  }

  /** 同步加载周围 r 个区块（开局用） */
  loadAround(px, pz, r) {
    const ci = Math.floor(px / P), cj = Math.floor(pz / P);
    for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      if (!this.chunks.has(`${ci + di},${cj + dj}`)) this.build(ci + di, cj + dj);
    }
  }

  unload(key, c) {
    const { scene, world, vehicles } = this.game;
    for (const m of c.meshes) { scene.remove(m); m.geometry.dispose(); }
    for (const col of c.colliders) world.removeCollider(col, false);
    for (const id of c.parked) vehicles.despawnParked(id);
    this.chunks.delete(key);
  }

  /** 生成一个区块（含：路面/人行道/标线、建筑、路灯、树、静态碰撞体、路边停放车辆） */
  build(i, j) {
    const { RAPIER, world, scene, vehicles } = this.game;
    const rng = mulberry32(hash2(i, j, 1));
    const ground = new Batch(), struct = new Batch();
    const colliders = [];
    const x0 = i * P, z0 = j * P;
    const solid = (cx, cy, cz, hx, hy, hz) => {
      colliders.push(world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setFriction(0)));
    };

    // ---- 地面：沥青 + 人行道板 ----
    ground.box(x0 + P / 2, -0.1, z0 + P / 2, P, 0.2, P, 0x3a3d42);
    ground.box(x0 + P / 2, 0.01, z0 + P / 2, 64, 0.04, 64, 0xb9b6ae);

    // ---- 车道虚线（黄色）----
    for (let s = 14; s < P - 14; s += 6) {
      ground.box(x0, 0.012, z0 + s + 1.5, 0.2, 0.024, 3, 0xe8c547);
      ground.box(x0 + s + 1.5, 0.012, z0, 3, 0.024, 0.2, 0xe8c547);
    }
    // ---- 路口斑马线（本区块左上角路口的四个方向）----
    for (let k = 0; k < 4; k++) {
      const f = DIRS[k], r = { x: -f.z, z: f.x };
      for (let off = -6.6; off <= 6.7; off += 1.2) {
        const cx = x0 + f.x * 10.8 + r.x * off, cz = z0 + f.z * 10.8 + r.z * off;
        if (f.x !== 0) ground.box(cx, 0.012, cz, 2.4, 0.024, 0.5, 0xeeeeee);
        else ground.box(cx, 0.012, cz, 0.5, 0.024, 2.4, 0xeeeeee);
      }
    }

    // ---- 街区：划分地块 → 建筑 / 小广场 ----
    const bx = x0 + 12, bz = z0 + 12, SZ = 56;
    const downtown = Math.max(0, 1 - Math.hypot(i - 3, j - 3) / 7);
    const mode = rng();
    let lots;
    if (mode < 0.25) lots = [[0, 0, 56, 56]];
    else if (mode < 0.6) lots = [[0, 0, 27, 27], [29, 0, 27, 27], [0, 29, 27, 27], [29, 29, 27, 27]];
    else if (rng() < 0.5) lots = [[0, 0, 56, 27], [0, 29, 56, 27]];
    else lots = [[0, 0, 27, 56], [29, 0, 27, 56]];

    for (const [lx, lz, lw, ld] of lots) {
      const r = rng();
      const cx0 = bx + lx + lw / 2, cz0 = bz + lz + ld / 2;
      if (r < 0.14) {                       // 小公园：草地 + 树
        ground.box(cx0, 0.04, cz0, lw - 1, 0.06, ld - 1, 0x5f8f4e);
        const n = 3 + Math.floor(rng() * 4);
        for (let t = 0; t < n; t++) this.tree(struct, solid, cx0 + (rng() - 0.5) * (lw - 6), cz0 + (rng() - 0.5) * (ld - 6), rng);
        continue;
      }
      const m = 1 + rng() * 2.2;
      const w = lw - 2 * m, d = ld - 2 * m;
      const floors = Math.max(2, Math.round((8 + rng() * 12 + downtown * rng() * 75) / 3.5));
      const h = floors * 3.5;
      const color = PALETTE[Math.floor(rng() * PALETTE.length)];
      struct.box(cx0, h / 2 + 0.03, cz0, w, h, d, color, true);
      struct.box(cx0 + (rng() - 0.5) * (w - 6), h + 0.6, cz0 + (rng() - 0.5) * (d - 6), 3, 1.2, 3, 0x7e8388);
      solid(cx0, h / 2, cz0, w / 2, h / 2, d / 2);
    }

    // ---- 街边路灯与行道树（沿人行道）----
    const lampSpots = [];
    for (const s of [20, 52]) {
      lampSpots.push([x0 + 9.5, z0 + s], [x0 + P - 9.5, z0 + s], [x0 + s, z0 + 9.5], [x0 + s, z0 + P - 9.5]);
    }
    for (const [lx, lz] of lampSpots) {
      struct.box(lx, 3, lz, 0.16, 6, 0.16, 0x33373c);
      struct.box(lx, 6.1, lz, 0.7, 0.18, 0.7, 0xfff0b8);
      solid(lx, 3, lz, 0.1, 3, 0.1);
    }
    for (const s of [36]) {
      if (rng() < 0.6) this.tree(struct, solid, x0 + 9.8, z0 + s + rng() * 4, rng);
      if (rng() < 0.6) this.tree(struct, solid, x0 + P - 9.8, z0 + s + rng() * 4, rng);
      if (rng() < 0.6) this.tree(struct, solid, x0 + s + rng() * 4, z0 + 9.8, rng);
      if (rng() < 0.6) this.tree(struct, solid, x0 + s + rng() * 4, z0 + P - 9.8, rng);
    }

    // ---- 路边停放车辆（确定性随机；(0,0) 区块有任务用的橙色轿车）----
    const defs = [];
    if (i === 0 && j === 0) defs.push({ id: 'start', x: 26, z: PARK, heading: Math.PI / 2, color: START_CAR_COLOR });
    for (let n = 0; n < 2; n++) {
      if (rng() < 0.5) {                    // 沿东西向道路 z = z0
        const east = rng() < 0.5;
        defs.push({ id: `p${i},${j},h${n}`, x: x0 + 16 + rng() * (P - 32), z: z0 + (east ? PARK : -PARK),
          heading: east ? Math.PI / 2 : -Math.PI / 2, color: CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)] });
      }
      if (rng() < 0.5) {                    // 沿南北向道路 x = x0
        const south = rng() < 0.5;
        defs.push({ id: `p${i},${j},v${n}`, x: x0 + (south ? -PARK : PARK), z: z0 + 16 + rng() * (P - 32),
          heading: south ? 0 : Math.PI, color: CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)] });
      }
    }
    const parked = [];
    defs.forEach((d, idx) => {
      if (d.id !== 'start' && defs.some((o, k) => k < idx && Math.hypot(o.x - d.x, o.z - d.z) < 7)) return;
      vehicles.spawnParked(d); parked.push(d.id);
    });

    // ---- 构建网格 ----
    const meshes = [];
    const gg = ground.build(), sg = struct.build();
    if (gg) { const m = new THREE.Mesh(gg, this.material); m.receiveShadow = true; scene.add(m); meshes.push(m); }
    if (sg) { const m = new THREE.Mesh(sg, this.material); m.castShadow = m.receiveShadow = true; scene.add(m); meshes.push(m); }
    this.chunks.set(`${i},${j}`, { i, j, meshes, colliders, parked });
  }

  tree(struct, solid, x, z, rng) {
    const s = 0.9 + rng() * 0.6;
    struct.box(x, 1.4 * s, z, 0.45, 2.8 * s, 0.45, 0x6b4a2f);
    struct.box(x, 3.6 * s, z, 3 * s, 2.4 * s, 3 * s, 0x3f7d3a);
    struct.box(x, 5.2 * s, z, 1.9 * s, 1.4 * s, 1.9 * s, 0x4f9448);
    solid(x, 1.4, z, 0.25, 1.4, 0.25);
  }
}
