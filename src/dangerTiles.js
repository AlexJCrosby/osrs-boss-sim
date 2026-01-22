export function createDangerTilesSystem(THREE, {
  gridW,
  gridH,
  scene,
  getPlayerTile, // function that returns {x,y}
  onPlayerHit,   // callback when player is hit
  config,
}) {
  const {
    spawnEvery = 3,
    countPerWave = 6,
    telegraphTicks = 1,
    activeTicks = 1,
  } = config;

  const tiles = new Map(); // key "x,y" -> tile state

  // visuals (instanced meshes)
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);

  const teleMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, color: 0xffcc00 });
  const actMat  = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.65, color: 0xff3333 });

  const max = gridW * gridH;
  const teleMesh = new THREE.InstancedMesh(geo, teleMat, max);
  const actMesh  = new THREE.InstancedMesh(geo, actMat, max);

  teleMesh.frustumCulled = false;
  actMesh.frustumCulled = false;
  scene.add(teleMesh);
  scene.add(actMesh);

  const m4 = new THREE.Matrix4();
  function setAt(mesh, i, x, y) {
    m4.makeTranslation(x + 0.5, 0.012, y + 0.5);
    mesh.setMatrixAt(i, m4);
  }

  function key(x, y) { return `${x},${y}`; }

  function spawnWave() {
    let placed = 0;
    let safety = 500;
    const p = getPlayerTile();

    while (placed < countPerWave && safety-- > 0) {
      const x = Math.floor(Math.random() * gridW);
      const y = Math.floor(Math.random() * gridH);
      if (x === p.x && y === p.y) continue;

      const k = key(x, y);
      if (tiles.has(k)) continue;

      tiles.set(k, { x, y, phase: "telegraph", left: telegraphTicks });
      placed++;
    }
  }

  function advancePhases(tick) {
    if (tick % spawnEvery === 0) spawnWave();

    for (const [k, t] of tiles) {
      t.left--;
      if (t.left > 0) continue;

      if (t.phase === "telegraph") {
        t.phase = "active";
        t.left = activeTicks;
      } else {
        tiles.delete(k);
      }
    }
  }

  function applyDamage() {
    const p = getPlayerTile();
    const t = tiles.get(key(p.x, p.y));
    if (!t || t.phase !== "active") return;

    tiles.delete(key(p.x, p.y)); // prevents multi-hit spam
    onPlayerHit();
  }

  function render() {
    let ti = 0, ai = 0;
    for (const t of tiles.values()) {
      if (t.phase === "telegraph") setAt(teleMesh, ti++, t.x, t.y);
      else setAt(actMesh, ai++, t.x, t.y);
    }
    teleMesh.count = ti;
    actMesh.count = ai;
    teleMesh.instanceMatrix.needsUpdate = true;
    actMesh.instanceMatrix.needsUpdate = true;
  }

  return {
    update(tick) {
      advancePhases(tick);
      applyDamage();
    },
    render,
    clear() {
      tiles.clear();
      render();
    }
  };
}
