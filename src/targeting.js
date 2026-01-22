export function createTargeting(THREE, { scene, canvas, targetEl, pickTileFromMouse }) {
  let target = null;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.45, 32),
    new THREE.MeshBasicMaterial({ color: 0xffcc66, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  function setTarget(hit) {
    target = hit;
    targetEl.textContent = `${hit.x},${hit.y}`;
    ring.visible = true;
    ring.position.set(hit.x + 0.5, 0.01, hit.y + 0.5);
  }

  function clear() {
    target = null;
    targetEl.textContent = "none";
    ring.visible = false;
  }

  // NOTE: Your current code uses left click (button 0). Keep that unless you want right click (2).
  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const hit = pickTileFromMouse(e);
    if (!hit) return;
    setTarget(hit);
  });

  return {
    get target() { return target; },
    clear,
  };
}
