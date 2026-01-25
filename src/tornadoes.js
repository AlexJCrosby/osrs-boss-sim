import { createTileIndicator } from "./tileIndicator.js";

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

    // Movement (LOGIC)
    speedTilesPerTick = 1,  // one tile per tick (keep this)

    // Visual smoothing
    tickSeconds: initialTickSeconds = 0.6,

    

    y = 0.28,               // above floor, below player

    // Damage
    damageMin = 5,
    damageMax = 15,

    // Visual
    opacity = 0.65,
    color = 0x99ccff,
    renderOrder = 3,        // above danger floor; tweak if you want
  } = config;

  let tickSeconds = initialTickSeconds;

  function setTickSeconds(sec) {
    tickSeconds = Math.max(0.05, Number(sec) || 0.6);

    // Clamp any in-flight animations so they don't jump
    for (const t of tornadoes) {
      t.moveElapsed = Math.min(t.moveElapsed, tickSeconds);
    }
  }


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

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Four corner "3x3" spawn regions
  function cornerRegions() {
    const s = cornerRegionSize;
    const maxX = gridW - 1;
    const maxY = gridH - 1;

    const lo = 0;
    const hiX = maxX - (s - 1);
    const hiY = maxY - (s - 1);

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

    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }

    return idxs.slice(0, Math.min(n, 4)).map(i => regions[i]);
  }

  function randomPointInRegion(r) {
    return {
      x: randInt(r.x0, r.x1),
      y: randInt(r.y0, r.y1),
    };
  }

  // OSRS-style 1-step: can move diagonally in a single step
  function greedyStepToward(x, y, tx, ty) {
    const dx = tx - x;
    const dy = ty - y;
    x += sign(dx);
    y += sign(dy);
    return { x, y };
  }

  // ---- visuals ----
  const material = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });

  const cone = new THREE.ConeGeometry(0.38, 1.2, 12);
  const cyl  = new THREE.CylinderGeometry(0.18, 0.28, 0.35, 10);

  function makeTornadoMesh() {
    const g = new THREE.Group();

    const m1 = new THREE.Mesh(cone, material);
    m1.position.y = 0.6;

    const m2 = new THREE.Mesh(cyl, material);
    m2.position.y = 0.15;

    g.add(m1, m2);
    g.renderOrder = renderOrder;

    g.traverse((obj) => {
      if (obj.isMesh) obj.renderOrder = renderOrder;
    });

    scene.add(g);
    return g;
  }

  // ---- state ----
  let active = false;
  let waveStartTick = null;
  let waveIndex = -1;

  // Each tornado:
  // { x, y, mesh, renderX, renderY, moveFromX, moveFromY, moveToX, moveToY, moveElapsed }
  let tornadoes = [];

  // ===== Tornadoes tile indicator (owned by tornadoes) =====
  let tileIndicator = null;

  function getTornadoTiles() {
    // Show whenever tornado objects exist (regardless of active flag)
    if (!tornadoes.length) return [];
    return tornadoes.map(t => ({ x: t.x, y: t.y }));
  }


  function createTornadoesTileIndicator(config = {}) {
    if (tileIndicator) return tileIndicator;

    tileIndicator = createTileIndicator(THREE, {
      scene,
      getTiles: getTornadoTiles,
      config: {
        // Allow multiple tiles. Pick a cap that’s safely above your max tornado count.
        maxTiles: 64,
        ...config,
      },
    });

    return tileIndicator;
  }

  function syncTornadoesTileIndicator() {
    if (!tileIndicator) return;
    // (debug log optional)
    // const tiles = getTornadoTiles();
    // console.log("TTI sync tiles:", tiles.length, "active:", active, "tornadoes:", tornadoes.length);
    tileIndicator.sync();
  }

  function setTornadoesTileIndicatorStyle({ enabled, color, opacity255 } = {}) {
    if (!tileIndicator) return;
    if (enabled !== undefined) tileIndicator.setEnabled(enabled);
    if (color !== undefined) tileIndicator.setColor(color);
    if (opacity255 !== undefined) tileIndicator.setOpacity255(opacity255);
  }

  function disposeTornadoesTileIndicator() {
    if (!tileIndicator) return;
    tileIndicator.dispose();
    tileIndicator = null;
  }


  function currentWaveIndex(fightTick) {
    if (fightTick < firstSpawnTick) return -1;
    return Math.floor((fightTick - firstSpawnTick) / periodTicks);
  }

  function waveSpawnTick(idx) {
    return firstSpawnTick + idx * periodTicks;
  }

  function beginMoveToCurrentLogical(t) {
    // Start from current drawn position (prevents snapping if tick updates mid-glide)
    t.moveFromX = t.renderX;
    t.moveFromY = t.renderY;
    t.moveToX = t.x;
    t.moveToY = t.y;
    t.moveElapsed = 0;
  }

  function syncMesh(t) {
    t.mesh.position.set(t.renderX + 0.5, y, t.renderY + 0.5);
  }

  function ensureWave(fightTick) {
    const idx = currentWaveIndex(fightTick);
    if (idx < 0) return;

    const spawnTick = waveSpawnTick(idx);
    const slamTick = spawnTick - slamLeadTicks;

    if (fightTick === slamTick) {
      console.log(`Boss slam (tornado warning) at tick ${fightTick} (wave ${idx + 1})`);
    }

    if (fightTick !== spawnTick) return;

    waveIndex = idx;
    waveStartTick = spawnTick;
    active = true;

    for (const t of tornadoes) scene.remove(t.mesh);
    tornadoes = [];

    const count = baseCount + idx * countGrowth;

    const preferredRegions = pickDistinctCorners(count);

    for (const r of preferredRegions) {
      const p = randomPointInRegion(r);
      const mesh = makeTornadoMesh();

      const t = {
        x: p.x,
        y: p.y,
        mesh,

        renderX: p.x,
        renderY: p.y,

        moveFromX: p.x,
        moveFromY: p.y,
        moveToX: p.x,
        moveToY: p.y,
        moveElapsed: tickSeconds,
      };

      syncMesh(t);
      tornadoes.push(t);
    }

    while (tornadoes.length < count) {
      const regions = cornerRegions();

      const used = new Set(tornadoes.map(t => {
        const left = t.x < gridW / 2;
        const bottom = t.y < gridH / 2;
        if (left && bottom) return "BL";
        if (!left && bottom) return "BR";
        if (left && !bottom) return "TL";
        return "TR";
      }));

      const candidates = regions.filter(r => !used.has(r.name));
      const pool = candidates.length ? candidates : regions;
      const r = pool[Math.floor(Math.random() * pool.length)];

      const p = randomPointInRegion(r);
      const mesh = makeTornadoMesh();

      const t = {
        x: p.x,
        y: p.y,
        mesh,

        renderX: p.x,
        renderY: p.y,

        moveFromX: p.x,
        moveFromY: p.y,
        moveToX: p.x,
        moveToY: p.y,
        moveElapsed: tickSeconds,
      };

      syncMesh(t);
      tornadoes.push(t);
    }

    console.log(`Tornadoes spawned: ${count} (wave ${idx + 1}) at tick ${fightTick}`);
    syncTornadoesTileIndicator();
  }

  function updateTornadoChase() {
    const p = getPlayerTile();

    for (const t of tornadoes) {
      let x = t.x;
      let y0 = t.y;

      let steps = speedTilesPerTick;
      while (steps-- > 0 && (x !== p.x || y0 !== p.y)) {
        const next = greedyStepToward(x, y0, p.x, p.y);
        x = clamp(next.x, 0, gridW - 1);
        y0 = clamp(next.y, 0, gridH - 1);
      }

      const moved = (x !== t.x) || (y0 !== t.y);

      t.x = x;
      t.y = y0;

      if (moved) beginMoveToCurrentLogical(t);

      if (t.x === p.x && t.y === p.y) {
        const dmg = randInt(damageMin, damageMax);
        onPlayerDamaged(dmg);
      }
    }

    // Sync ONCE after all tornadoes updated
    syncTornadoesTileIndicator();
  }


  function despawnIfNeeded(fightTick) {
    if (!active) return;
    if (waveStartTick === null) return;

    if (fightTick >= waveStartTick + durationTicks) {
      console.log("DESPAWN trigger", { fightTick, waveStartTick, durationTicks });
      for (const t of tornadoes) scene.remove(t.mesh);
      tornadoes = [];
      active = false;
      waveStartTick = null;
      console.log(`Tornadoes despawn at tick ${fightTick}`);
      console.log("DESPAWN", { fightTick, waveStartTick, durationTicks }); // temporary debugging
      syncTornadoesTileIndicator();
    }
  }

  // Call this every animation frame (like player.updateVisual(dt))
  function updateVisual(dt) {
    if (!active) return;

    for (const t of tornadoes) {
      // advance current tick glide
      t.moveElapsed = Math.min(tickSeconds, t.moveElapsed + dt);
      const alpha = tickSeconds <= 0 ? 1 : (t.moveElapsed / tickSeconds);

      // LINEAR (OSRS-like)
      const u = alpha;

      t.renderX = lerp(t.moveFromX, t.moveToX, u);
      t.renderY = lerp(t.moveFromY, t.moveToY, u);

      syncMesh(t);
    }
  }

  function reset() {
    for (const t of tornadoes) scene.remove(t.mesh);
    tornadoes = [];
    active = false;
    waveStartTick = null;
    waveIndex = -1;
    syncTornadoesTileIndicator();
  }

  return {
    reset,
    updateVisual,
    setTickSeconds,
    createTornadoesTileIndicator,
    syncTornadoesTileIndicator,
    setTornadoesTileIndicatorStyle,
    disposeTornadoesTileIndicator,
    update(fightTick) {
      ensureWave(fightTick);
      

      if (active) {
        updateTornadoChase();
      }

      despawnIfNeeded(fightTick);
    },
  };
}
