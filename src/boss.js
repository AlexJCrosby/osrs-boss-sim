// src/boss.js
export function createBoss(THREE, { scene, startX = 9, startY = 9, onAttack } = {}) {

  // Semi-transparent so the danger floor can still be seen beneath it
  const material = new THREE.MeshStandardMaterial({
    color: 0x66ccff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });

  // ===== Boss geometry (5x5 tiles footprint) =====
  const BOSS_SIZE_TILES = 5;
  const BOSS_HEIGHT = 1.2;

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(BOSS_SIZE_TILES, BOSS_HEIGHT, BOSS_SIZE_TILES),
    material
  );

  const state = { x: startX, y: startY };

  const BOSS_Y = BOSS_HEIGHT / 2;
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

  // ===== Boss combat config =====
  const config = {
    attackSpeedTicks: 5,
    maxHit: 39,
    startStyle: "RANGE", // boss attack style starts ranged (your existing behavior)
    swapEvery: 4,        // swap attack style every 4 counted attacks
  };

  // ===== Boss combat state =====
  const combat = {
    style: config.startStyle,            // "RANGE" | "MAGE"
    cooldown: config.attackSpeedTicks,   // counts down each tick
    countedAttacks: 0,                   // counts toward style swap
  };

  // ===== Boss protection prayer state =====
  const ProtectionPrayer = Object.freeze({
    RANGE: "RANGE",
    MAGE: "MAGE",
  });

  const protection = {
    active: ProtectionPrayer.RANGE, // will be randomized on resetProtectionPrayer()
    offPrayerCount: 0,             // counts ONLY off-prayer player attacks
    swapEveryOffPrayer: 6,
  };

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function toggleStyle() {
    combat.style = (combat.style === "RANGE") ? "MAGE" : "RANGE";
  }

  function notifyCountedAttack(count = 1) {
    combat.countedAttacks += count;
    if (combat.countedAttacks % config.swapEvery === 0) {
      toggleStyle();
    }
  }

  function resetCombat() {
    combat.style = config.startStyle;
    combat.cooldown = config.attackSpeedTicks;
    combat.countedAttacks = 0;
  }

  // --- NEW: protection prayer helpers ---
  function setProtectionPrayer(next) {
    protection.active = (next === ProtectionPrayer.MAGE) ? ProtectionPrayer.MAGE : ProtectionPrayer.RANGE;
  }

  function toggleProtectionPrayer() {
    protection.active = (protection.active === ProtectionPrayer.RANGE) ? ProtectionPrayer.MAGE : ProtectionPrayer.RANGE;
  }

  /**
   * Call THIS on boss reset (NOT startFight), so the starting prayer is stable through fight start.
   */
  function resetProtectionPrayer() {
    // Random initial prayer on reset
    const start = (Math.random() < 0.5) ? ProtectionPrayer.RANGE : ProtectionPrayer.MAGE;
    setProtectionPrayer(start);
    protection.offPrayerCount = 0;
  }

  /**
   * Called when the PLAYER performs an attack on the boss (even if 0 damage).
   * Only OFF-prayer attacks (style != active prayer) count toward the 6-swap rule.
   */
  function notifyPlayerAttack({ style }) {
    if (style !== "RANGE" && style !== "MAGE") return;

    const isOffPrayer = style !== protection.active;
    if (!isOffPrayer) return;

    protection.offPrayerCount += 1;

    if (protection.offPrayerCount % protection.swapEveryOffPrayer === 0) {
      toggleProtectionPrayer();
    }
  }

  function update(/* fightTick */) {
    combat.cooldown -= 1;
    if (combat.cooldown > 0) return;

    const raw = randInt(1, config.maxHit);

    if (typeof onAttack === "function") {
      onAttack({
        style: combat.style,        // "RANGE" | "MAGE"
        amount: raw,                // 1..39
        countsTowardBossSwap: true,
      });
    }

    notifyCountedAttack(1);
    combat.cooldown = config.attackSpeedTicks;
  }

  sync();

  // IMPORTANT: ensure it has a prayer immediately, even before fight starts
  resetProtectionPrayer();

  return {
    get x() { return state.x; },
    get y() { return state.y; },

    // combat
    resetCombat,
    notifyCountedAttack,
    update,

    // protection prayer
    getProtectionPrayer() { return protection.active; },
    resetProtectionPrayer,
    notifyPlayerAttack,

    // positioning / visuals
    setPos,
    reset,
    mesh,
  };
}
