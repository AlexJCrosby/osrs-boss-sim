// src/tornadoes.js
export function createTornadoes(THREE, {
  scene,
  gridW,
  gridH,
  getPlayerTile,      // () => ({x,y})
  onPlayerDamaged,    // (amount) => void
  config = {},
}) {
  const {
    // Schedule
    firstSpawnTick = 60,
    periodTicks = 54,
    durationTicks = 21,     // how long tornadoes remain active after spawning
    slamLeadTicks = 2,      // optional: "slam" happens 2 ticks before spawn

    // Wave size
    baseCount = 2,          // wave 1
    countGrowth = 1,        // +1 per wave

    // Spawn corner region size (3x3)
    cornerRegionSize = 3,

    // Movement
    speedTilesPerTick = 1,  // "one tile at a time"

    // Damage
    damageMin = 5,
    damageMax = 15,

    // Visual
    opacity = 0.65,
    color = 0x99ccff,
    y = 0.28,              // above floor, below player
    renderOrder = 3,       // above danger floor; tweak if you want
  } = config;

  // ---- helpers ----
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function sign(n) {
    return n < 0 ? -1 : n > 0 ? 1 : 0;
  }

  // Four corner "3x3" spawn regions
  // Using your 12x12 grid: 0..11
  function cornerRegions() {
    const s = cornerRegionSize;        // 3
    const maxX = gridW - 1;
    const maxY = gridH - 1;

    const lo = 0;
    const hiX = maxX - (s - 1);        // 11 - 2 = 9
    const hiY = maxY - (s - 1);        // 9

    return [
      { name: "BL", x0: lo,  x1: lo + (s - 1), y0: lo,  y1: lo + (s - 1) },
      { name: "BR", x0: hiX, x1: hiX + (s - 1), y0: lo,  y1: lo + (s - 1) },
      { name: "TL", x0: lo,  x1: lo + (s - 1), y0: hiY, y1: hiY + (s - 1) },
      { name: "TR", x0: hiX, x1: hiX + (s - 1), y0: hiY, y1: hiY + (s - 1) },
    ];
  }

  function pickDistinctCorners(n) {
    const regions = cornerRegions();
    const idxs = [0, 1, 2, 3];

    // shuffle
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }

    // if n <= 4, pick distinct; if > 4, will reuse later
    return idxs.slice(0, Math.min(n, 4)).map(i => regions[i]);
  }

  function randomPointInRegion(r) {
    return {
      x: randInt(r.x0, r.x1),
      y: randInt(r.y0, r.y1),
    };
  }

  function greedyStepToward(x, y, tx, ty) {
    // Move 1 tile toward target: prefer x movement first, then y (simple and deterministic)
    if (x !== tx) x += sign(tx - x);
    else if (y !== ty) y += sign(ty - y);
    return { x, y };
  }

  // ---- visuals ----
  const material = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });

  // Simple “tornado-ish” shape: cone + small cylinder base
  const cone = new THREE.ConeGeometry(0.38, 1.2, 12);
  const cyl = new THREE.CylinderGeometry(0.18, 0.28, 0.35, 10);

  function makeTornadoMesh() {
    const g = new THREE.Group();

    const m1 = new THREE.Mesh(cone, material);
    m1.position.y = 0.6;

    const m2 = new THREE.Mesh(cyl, material);
    m2.position.y = 0.15;

    g.add(m1, m2);
    g.renderOrder = renderOrder;

    // Make sure group children also respect renderOrder
    g.traverse((obj) => {
      if (obj.isMesh) obj.renderOrder = renderOrder;
    });

    scene.add(g);
    return g;
  }

  // ---- state ----
  let active = false;
  let waveStartTick = null;
  let waveIndex = -1;         // 0 for first wave
  let tornadoes = [];         // array of { x, y, mesh }

  function currentWaveIndex(fightTick) {
    if (fightTick < firstSpawnTick) return -1;
    return Math.floor((fightTick - firstSpawnTick) / periodTicks);
  }

  function waveSpawnTick(idx) {
    return firstSpawnTick + idx * periodTicks;
  }

  function isWithinActiveWindow(fightTick, idx) {
    const start = waveSpawnTick(idx);
    return fightTick >= start && fightTick < start + durationTicks;
  }

  function ensureWave(fightTick) {
    const idx = currentWaveIndex(fightTick);
    if (idx < 0) return;

    const spawnTick = waveSpawnTick(idx);
    const slamTick = spawnTick - slamLeadTicks;

    // Optional: slam moment (for later animation hooks)
    if (fightTick === slamTick) {
      // No boss animation yet; leaving a log hook for you to confirm timing
      console.log(`Boss slam (tornado warning) at tick ${fightTick} (wave ${idx + 1})`);
    }

    // Spawn exactly on spawn tick
    if (fightTick !== spawnTick) return;

    // Start new wave
    waveIndex = idx;
    waveStartTick = spawnTick;
    active = true;

    // clear previous meshes
    for (const t of tornadoes) scene.remove(t.mesh);
    tornadoes = [];

    const count = baseCount + idx * countGrowth;

    // Prefer distinct corners within wave
    const preferredRegions = pickDistinctCorners(count);

    // First, spawn up to 4 in distinct corners
    for (const r of preferredRegions) {
      const p = randomPointInRegion(r);
      tornadoes.push({ x: p.x, y: p.y, mesh: makeTornadoMesh() });
    }

    // If count > 4, spawn extras into random corners (still biased away from existing if possible)
    while (tornadoes.length < count) {
      const regions = cornerRegions();

      // try to pick a corner name not used if possible, else any
      const used = new Set(tornadoes.map(t => {
        // classify by which quadrant they’re in
        const left = t.x < gridW / 2;
        const bottom = t.y < gridH / 2;
        if (left && bottom) return "BL";
        if (!left && bottom) return "BR";
        if (left && !bottom) return "TL";
        return "TR";
      }));

      const candidates = regions.filter(r => !used.has(r.name));
      const r = (candidates.length ? candidates : regions)[Math.floor(Math.random() * (candidates.length ? candidates : regions).length)];

      const p = randomPointInRegion(r);
      tornadoes.push({ x: p.x, y: p.y, mesh: makeTornadoMesh() });
    }

    // Initial position sync
    render();
    console.log(`Tornadoes spawned: ${count} (wave ${idx + 1}) at tick ${fightTick}`);
  }

  function updateTornadoChase() {
    const p = getPlayerTile();

    for (const t of tornadoes) {
      // Move speedTilesPerTick steps toward player
      let x = t.x;
      let y = t.y;

      let steps = speedTilesPerTick;
      while (steps-- > 0 && (x !== p.x || y !== p.y)) {
        const next = greedyStepToward(x, y, p.x, p.y);
        x = next.x;
        y = next.y;

        x = clamp(x, 0, gridW - 1);
        y = clamp(y, 0, gridH - 1);
      }

      t.x = x;
      t.y = y;

      // Collision: same tile
      if (t.x === p.x && t.y === p.y) {
        const dmg = randInt(damageMin, damageMax);
        onPlayerDamaged(dmg);
      }
    }
  }

  function despawnIfNeeded(fightTick) {
    if (!active) return;
    if (waveStartTick === null) return;

    if (fightTick >= waveStartTick + durationTicks) {
      // Despawn
      for (const t of tornadoes) scene.remove(t.mesh);
      tornadoes = [];
      active = false;
      waveStartTick = null;

      console.log(`Tornadoes despawn at tick ${fightTick}`);
    }
  }

  function render() {
    for (const t of tornadoes) {
      t.mesh.position.set(t.x + 0.5, y, t.y + 0.5);
    }
  }

  function reset() {
    for (const t of tornadoes) scene.remove(t.mesh);
    tornadoes = [];
    active = false;
    waveStartTick = null;
    waveIndex = -1;
  }

  return {
    reset,
    update(fightTick) {
      // Wave management
      ensureWave(fightTick);

      // Only chase during active window
      if (active) {
        updateTornadoChase();
        render();
      }

      despawnIfNeeded(fightTick);
    },
  };
}
