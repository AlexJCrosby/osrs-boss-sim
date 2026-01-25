// src/boss.js
export function createBoss(THREE, { scene, startX = 9, startY = 9, onAttack } = {}) {


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

const state = {
  x: startX,
  y: startY,
};

  // Put boss above floor, but below player (your player cube sits around y ~ 0.45)
  // Adjust if needed.
  const BOSS_Y = BOSS_HEIGHT / 2;

  // Make sure it draws "above" the danger floor visually
  mesh.renderOrder = 2;

  scene.add(mesh);

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // for boss standard attacks
  const raw = randInt(1, 39);


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

    // ===== Boss combat config =====
  const config = {
    attackSpeedTicks: 5,
    maxHit: 39,
    startStyle: "RANGE", // fight starts ranged
    swapEvery: 4,        // swap every 4 counted attacks
  };

  // ===== Boss combat state =====
  const combat = {
    style: config.startStyle, // "RANGE" | "MAGE"
    cooldown: config.attackSpeedTicks, // counts down each tick
    countedAttacks: 0, // counts toward style swap
  };

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function toggleStyle() {
    combat.style = (combat.style === "RANGE") ? "MAGE" : "RANGE";
  }

  // Call this whenever an attack should count toward the 4-attack swap rule
  function notifyCountedAttack(count = 1) {
    combat.countedAttacks += count;
    if (combat.countedAttacks % config.swapEvery === 0) {
      toggleStyle();
    }
  }

  /**
   * Reset boss combat state for a new fight.
   * (Doesn't move the boss; that's still handled by reset/setPos.)
   */
  function resetCombat() {
    combat.style = config.startStyle;
    combat.cooldown = config.attackSpeedTicks;
    combat.countedAttacks = 0;
  }

  /**
   * Update once per fight tick.
   * onAttack is provided via createBoss options.
   */
  function update(/* fightTick */) {
    // Count down and attack when ready
    combat.cooldown -= 1;

    if (combat.cooldown > 0) return;

    // Perform a standard attack
    const raw = randInt(1, config.maxHit);

    // Emit attack event (main.js will convert to applyHit)
    if (typeof onAttack === "function") {
      onAttack({
        style: combat.style,            // "RANGE" | "MAGE"
        amount: raw,                    // 1..39
        countsTowardBossSwap: true,     // standard attacks count
      });
    }

    // Count it toward the swap rule (excluding stomp - stomp isn't implemented here)
    notifyCountedAttack(1);

    // Reset cooldown
    combat.cooldown = config.attackSpeedTicks;
  }


  sync();

  return {
    get x() { return state.x; },
    get y() { return state.y; },
    setPos,
    reset,
    resetCombat,
    notifyCountedAttack,
    update,
    mesh, // exposed in case you want to tweak visuals later
  };
}
