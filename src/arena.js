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

  // invisible picking plane
  const pickPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(gridW, gridH),
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
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.z);

    if (tx < 0 || tx >= gridW || ty < 0 || ty >= gridH) return null;
    return { x: tx, y: ty };
  }

  return { pickTileFromMouse };
}
