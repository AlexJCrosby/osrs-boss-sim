// src/playerTileIndicator.js
export function createPlayerTileIndicator(THREE, {
  scene,
  getPlayerTile, // () => ({x,y})  <-- MUST return logical tile
  config = {},
}) {
  const {
    y = 0.02,              // slightly above floor
    color = "#FFB03F",
    opacity255 = 160,      // 0..255 (RuneLite style)
    enabled = true,
    renderOrder = 9999,
    thickness = 2,         // line width (mostly ignored on many platforms, but keep for intent)
    inset = 0.03,          // pulls border slightly inward so it doesn't z-fight with grid lines
  } = config;

  function clamp255(v) {
    v = Number(v);
    if (!Number.isFinite(v)) return 255;
    return Math.max(0, Math.min(255, Math.floor(v)));
  }

  // ---- geometry: a square outline (LineLoop) ----
  // Tile corners (x..x+1, y..y+1), inset slightly to avoid overlapping grid lines.
  const s0 = inset;
  const s1 = 1 - inset;

  const points = [
    new THREE.Vector3(s0, 0, s0),
    new THREE.Vector3(s1, 0, s0),
    new THREE.Vector3(s1, 0, s1),
    new THREE.Vector3(s0, 0, s1),
  ];

  const geo = new THREE.BufferGeometry().setFromPoints(points);

  const mat = new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: clamp255(opacity255) / 255,
    depthTest: false,  // draw over EVERYTHING
    depthWrite: false,
    linewidth: thickness, // note: many browsers ignore linewidth for WebGL lines
  });

  const line = new THREE.LineLoop(geo, mat);
  line.renderOrder = renderOrder;
  line.visible = !!enabled;
  scene.add(line);

  function setEnabled(v) {
    line.visible = !!v;
  }

  function setColor(hex) {
    try {
      line.material.color.set(hex);
    } catch {
      // ignore invalid input
    }
  }

  function setOpacity255(v) {
    const o = clamp255(v);
    line.material.opacity = o / 255;
  }

  function syncToPlayer() {
    const p = getPlayerTile();
    if (!p) return;

    // Position the line so its local points align to tile bounds
    // Local points are 0..1 square; world tile is [x..x+1], [y..y+1]
    line.position.set(p.x, y, p.y);
  }

  // initialize placement
  syncToPlayer();

  return {
    mesh: line, // keep the API stable for your main.js
    syncToPlayer,
    setEnabled,
    setColor,
    setOpacity255,
  };
}
