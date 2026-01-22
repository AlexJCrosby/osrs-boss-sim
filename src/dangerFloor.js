// src/dangerFloor.js
export function createDangerFloor(THREE, {
  scene,
  gridW,
  gridH,
  getPlayerTile,        // () => ({x,y})
  onPlayerDamaged,      // (amount) => void
  config = {},
}) {
  const {
    // When fight tick reaches this number, the danger floor first appears.
    spawnDelayTicks = 12,

    // Cycle: safe for 6 ticks, unsafe for 14 ticks, then move+reset.
    safeTicks = 6,
    unsafeTicks = 14,

    damageMin = 10,
    damageMax = 20,

    // Cosmetic
    safeColor = 0x8b0033,   // crimson-ish
    unsafeColor = 0xff9900, // orange
    opacity = 0.60,
    yOffset = 0.012,
  } = config;

  // Arena must be divisible into 2x2 quadrants (12x12 -> 6x6 corners)
  const halfW = Math.floor(gridW / 2);
  const halfH = Math.floor(gridH / 2);

  // Quadrant origins in tile coords (x,y)
  // (These assume your tile coords are 0..gridW-1 and 0..gridH-1, as in your current code.)
  const corners = [
    { name: "BL", ox: 0,      oy: 0 },       // bottom-left
    { name: "BR", ox: halfW,  oy: 0 },       // bottom-right
    { name: "TL", ox: 0,      oy: halfH },   // top-left
    { name: "TR", ox: halfW,  oy: halfH },   // top-right
  ];

  const zoneSize = halfW; // 6 in a 12x12

  // Visual: one instanced mesh drawing the full 6x6 overlay (36 tiles)
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    color: safeColor,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
  });

  const maxInstances = zoneSize * zoneSize; // 36
  const mesh = new THREE.InstancedMesh(geo, mat, maxInstances);
  mesh.frustumCulled = false;
  scene.add(mesh);

  // Hide by default until the fight starts / system is activated
  mesh.count = 0;
  mesh.instanceMatrix.needsUpdate = true;


  const m4 = new THREE.Matrix4();

  // ----- internal state -----
  let spawned = false;        // has it appeared yet this fight?
  let active = false;         // should render / apply damage?
  let cornerIndex = 0;        // 0..3
  let cycleTick = 0;          // 1..(safe+unsafe), resets on move
  let phase = "safe";         // "safe" | "unsafe"

  function randInt(min, max) {
    // inclusive
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pickNewCorner(excludeIndex) {
    // pick randomly among the other 3 corners
    const options = [0, 1, 2, 3].filter((i) => i !== excludeIndex);
    return options[Math.floor(Math.random() * options.length)];
  }

  function isPlayerInZone(px, py, ox, oy) {
    return px >= ox && px < ox + zoneSize && py >= oy && py < oy + zoneSize;
  }

  function setPhase(newPhase) {
    phase = newPhase;
    if (phase === "safe") {
      mesh.material.color.setHex(safeColor);
    } else {
      mesh.material.color.setHex(unsafeColor);
    }
  }

  function ensureSpawned(fightTick) {
    if (spawned) return;
    if (fightTick < spawnDelayTicks) return;

    spawned = true;
    active = true;
    cornerIndex = Math.floor(Math.random() * 4);
    cycleTick = 0;
    setPhase("safe");
  }

  function advanceOneTick() {
    cycleTick++;

    // Safe window first, then unsafe window
    if (cycleTick <= safeTicks) {
      if (phase !== "safe") setPhase("safe");
    } else {
      if (phase !== "unsafe") setPhase("unsafe");
    }

    // End of cycle => move corner + reset cycle to start safe again
    const cycleLen = safeTicks + unsafeTicks;
    if (cycleTick >= cycleLen) {
      const prev = cornerIndex;
      cornerIndex = pickNewCorner(prev);
      cycleTick = 0;
      setPhase("safe");
    }
  }

  function applyDamageIfNeeded() {
    if (!active) return;
    if (phase !== "unsafe") return;

    const p = getPlayerTile();
    const c = corners[cornerIndex];

    if (isPlayerInZone(p.x, p.y, c.ox, c.oy)) {
      const dmg = randInt(damageMin, damageMax);
      onPlayerDamaged(dmg);
    }
  }

  function render() {
    if (!active) {
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
      return;
    }

    const c = corners[cornerIndex];

    // Fill 6x6 tiles
    let i = 0;
    for (let dy = 0; dy < zoneSize; dy++) {
      for (let dx = 0; dx < zoneSize; dx++) {
        const x = c.ox + dx;
        const y = c.oy + dy;

        // center each tile at (x+0.5, y+0.5)
        m4.makeTranslation(x + 0.5, yOffset, y + 0.5);
        mesh.setMatrixAt(i++, m4);
      }
    }

    mesh.count = i; // 36
    mesh.instanceMatrix.needsUpdate = true;
  }

  function reset() {
    spawned = false;
    active = false;
    cycleTick = 0;
    cornerIndex = 0;
    setPhase("safe");
    render(); // clears visuals (count=0)
  }

  return {
    // Call once per fight tick (only while in FIGHT state)
    update(fightTick) {
      ensureSpawned(fightTick);
      if (!active) return;

      advanceOneTick();
      applyDamageIfNeeded();
    },

    // Call after update (or every frame if you want — tick is fine)
    render,

    // Call on Start/Reset
    reset,

    // Optional: for debugging
    debugState() {
      const c = corners[cornerIndex];
      return { active, spawned, phase, cycleTick, corner: c.name, ox: c.ox, oy: c.oy };
    }
  };
}
