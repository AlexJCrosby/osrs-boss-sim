// src/boss.js
export function createBoss(THREE, { scene, startX = 9, startY = 9 } = {}) {
  const state = {
    x: startX,
    y: startY,
  };

  // Semi-transparent so the danger floor can still be seen beneath it
  const material = new THREE.MeshStandardMaterial({
    color: 0x66ccff,        // light blue (easy to distinguish from player)
    transparent: true,
    opacity: 0.55,
    depthWrite: false,      // helps avoid z-order issues with transparency
  });

  // ===== Boss geometry (5x5 tiles footprint) =====
    const BOSS_SIZE_TILES = 5;     // width/depth in tile units
    const BOSS_HEIGHT = 1.2;       // keep height similar

    const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(BOSS_SIZE_TILES, BOSS_HEIGHT, BOSS_SIZE_TILES),
    material
);


  // Put boss above floor, but below player (your player cube sits around y ~ 0.45)
  // Adjust if needed.
  const BOSS_Y = BOSS_HEIGHT / 2;

  // Make sure it draws "above" the danger floor visually
  mesh.renderOrder = 2;

  scene.add(mesh);

  function sync() {
    mesh.position.set(state.x + 0.5, BOSS_Y, state.y + 0.5);
  }

  function setPos(x, y) {
    state.x = x;
    state.y = y;
    sync();
  }

  function reset({ x = startX, y = startY } = {}) {
    state.x = x;
    state.y = y;
    sync();
  }

  // Placeholder for later boss logic
  function update(/* fightTick */) {}

  sync();

  return {
    get x() { return state.x; },
    get y() { return state.y; },
    setPos,
    reset,
    update,
    mesh, // exposed in case you want to tweak visuals later
  };
}
