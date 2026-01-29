// Generic tile indicator
export function createTileIndicator(THREE, {
  scene,
  getTiles,           
  config = {},
}) {
  const {
    enabled = true,
    color = "#FFB03F",
    opacity255 = 160,    
    y = 0.02,
    inset = 0.03,
    maxTiles = 256,
    renderOrder = 9999,
  } = config;

  const clamp255 = (v) => {
    v = Number(v);
    if (!Number.isFinite(v)) return 255;
    return Math.max(0, Math.min(255, Math.floor(v)));
  };

  // 4 edges -> 4 segments -> 8 verts per tile
  const VERTS_PER_TILE = 8;
  const FLOATS_PER_VERT = 3;
  const positions = new Float32Array(maxTiles * VERTS_PER_TILE * FLOATS_PER_VERT);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setDrawRange(0, 0);

  const mat = new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: clamp255(opacity255) / 255,
    depthTest: false,
    depthWrite: false,
  });

  const obj = new THREE.LineSegments(geo, mat);
  obj.visible = !!enabled;
  obj.renderOrder = renderOrder;
  obj.frustumCulled = false; 
  scene.add(obj);

  function writeTile(offset, x, z) {
    const x0 = x + inset;
    const x1 = x + 1 - inset;
    const z0 = z + inset;
    const z1 = z + 1 - inset;

    // bottom, right, top, left 
    positions.set(
      [
        x0, y, z0,  x1, y, z0,
        x1, y, z0,  x1, y, z1,
        x1, y, z1,  x0, y, z1,
        x0, y, z1,  x0, y, z0,
      ],
      offset
    );
  }

  function sync() {
    const tiles = getTiles?.() || [];
    const count = Math.min(tiles.length, maxTiles);

    for (let i = 0; i < count; i++) {
      const t = tiles[i];
      writeTile(i * VERTS_PER_TILE * FLOATS_PER_VERT, t.x, t.y);
    }

    geo.setDrawRange(0, count * VERTS_PER_TILE);
    geo.attributes.position.needsUpdate = true;
    geo.computeBoundingSphere();
  }

  function setEnabled(v) { obj.visible = !!v; }
  function setColor(hex) {
    const c = String(hex || "");
    if (!c) return;
    try { mat.color.set(c); }
    catch (e) { /* ignore invalid color strings */ }
  }
  function setOpacity255(v) { mat.opacity = clamp255(v) / 255; }

  function dispose() {
    scene.remove(obj);
    geo.dispose();
    mat.dispose();
  }

  // init
  sync();

  return { object: obj, sync, dispose, setEnabled, setColor, setOpacity255 };
}
