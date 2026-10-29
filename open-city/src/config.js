// ============ 世界常量 ============
// 城市是无限的方格路网：道路中心线位于 x = i*P、z = j*P
export const P = 80;            // 路网周期（一个街区 + 一条路）
export const ROAD_HALF = 8;     // 道路半宽（路宽 16m）
export const LANE = 2.5;        // 行车道中心线距道路中心的距离（靠右行驶）
export const PARK = 6.5;        // 路边停车位中心距道路中心的距离
export const LOAD_R = 3;        // 流式加载半径（单位：区块）
export const UNLOAD_R = 4;      // 超过此半径卸载

// 四个行驶方向：0=+X 1=+Z 2=-X 3=-Z   (右转 = +1，左转 = +3)
export const DIRS = [
  { x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 },
];

export const CAR_COLORS = [0xd23c3c, 0x2f6fd0, 0xe8e8e8, 0x2c2c30, 0x3aa56b, 0xe3a21a, 0x8a4fd0, 0x3ac0c8];
export const START_CAR_COLOR = 0xff8a1f;

// ============ 数学工具 ============
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** 最短角度差 a→b，范围 (-π, π] */
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** 可播种随机数 */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 整数坐标哈希：区块种子 */
export function hash2(i, j, k = 0) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(k | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// 车头朝向 θ 对应的前向量 = (sinθ, cosθ)；绕 Y 轴旋转 θ 的四元数
export const yawQuat = (h) => ({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) });
export const yawFromQuat = (q) => Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));

/** 把位置吸附到最近的行车道，并按当前朝向选择车道方向（R 键重置载具用） */
export function snapToLane(x, z, heading) {
  const rx = Math.round(x / P) * P, rz = Math.round(z / P) * P;
  if (Math.abs(x - rx) < Math.abs(z - rz)) {            // 南北向道路
    const f = Math.cos(heading) >= 0 ? 1 : -1;
    return { x: rx - f * LANE, z, heading: f > 0 ? 0 : Math.PI };
  }
  const f = Math.sin(heading) >= 0 ? 1 : -1;            // 东西向道路
  return { x, z: rz + f * LANE, heading: f > 0 ? Math.PI / 2 : -Math.PI / 2 };
}
