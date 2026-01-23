export function createArena(THREE, { scene, canvas, camera, gridW, gridH }) {
  // floor
  const floorGeo = new THREE.PlaneGeometry(gridW, gridH);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 1 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(gridW / 2, 0, gridH / 2);
  scene.add(floor);

  // grid lines
  const grid = new THREE.GridHelper(gridW, gridW, 0x2b2f3a, 0x2b2f3a);
  grid.position.set(gridW / 2, 0.001, gridH / 2);
  scene.add(grid);

  // invisible picking plane (bigger than arena so off-grid clicks still register)
  const PICK_SCALE = 50; // big enough to cover the viewport comfortably
  const pickPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(gridW * PICK_SCALE, gridH * PICK_SCALE),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pickPlane.rotation.x = -Math.PI / 2;
  pickPlane.position.copy(floor.position);
  scene.add(pickPlane);

  const raycaster = new THREE.Raycaster();
  const mouseNdc = new THREE.Vector2();

  function pickTileFromMouse(e) {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    mouseNdc.set(x, y);

    raycaster.setFromCamera(mouseNdc, camera);
    const hits = raycaster.intersectObject(pickPlane, false);
    if (!hits.length) return null;

        const p = hits[0].point;

    // Convert world position to tile indices
    let tx = Math.floor(p.x);
    let ty = Math.floor(p.z);

    // Snap to nearest valid tile inside the 12x12
    tx = Math.max(0, Math.min(gridW - 1, tx));
    ty = Math.max(0, Math.min(gridH - 1, ty));

    return { x: tx, y: ty };

  }

  return { pickTileFromMouse };
}
