import RAPIER from '@dimforge/rapier3d-compat';

/** 初始化 Rapier（compat 版本内嵌 wasm，无需额外配置）并创建世界与无限地面 */
export async function createPhysics() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -25, z: 0 });
  // 一个巨大的静态地面（城市地面是平的）
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(40000, 1, 40000).setTranslation(0, -1, 0).setFriction(0)
  );
  return { RAPIER, world };
}
