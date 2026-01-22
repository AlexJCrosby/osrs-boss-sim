export function createOrbitCameraController(THREE, { canvas, camera, getFocus }) {
  const keys = new Set();
  window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  let orbitYaw = Math.PI;
  let orbitPitch = 0.65;
  let orbitRadius = 14;

  const YAW_SPEED = 1.8;
  const PITCH_SPEED = 1.4;
  const MIN_PITCH = 0.2;
  const MAX_PITCH = 1.2;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // Alt + RMB drag
  let dragging = false;
  let lastX = 0, lastY = 0;

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 2) return;
    if (!e.altKey) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  window.addEventListener("mouseup", () => (dragging = false));

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    orbitYaw -= dx * 0.004;
    orbitPitch += dy * 0.004;
    orbitPitch = clamp(orbitPitch, MIN_PITCH, MAX_PITCH);
  });

  function attachZoomWheel() {
    canvas.addEventListener("wheel", (e) => {
      orbitRadius += Math.sign(e.deltaY) * 0.5;
      orbitRadius = clamp(orbitRadius, 6, 15);
      e.preventDefault();
    }, { passive: false });
  }

  function update(dt) {
    if (keys.has("d")) orbitYaw += YAW_SPEED * dt;
    if (keys.has("a")) orbitYaw -= YAW_SPEED * dt;
    if (keys.has("s")) orbitPitch -= PITCH_SPEED * dt;
    if (keys.has("w")) orbitPitch += PITCH_SPEED * dt;
    orbitPitch = clamp(orbitPitch, MIN_PITCH, MAX_PITCH);

    const f = getFocus();
    const focus = new THREE.Vector3(f.x + 0.5, 0.45, f.y + 0.5);

    const x = focus.x + orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
    const z = focus.z + orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
    const y = focus.y + orbitRadius * Math.sin(orbitPitch);

    camera.position.set(x, y, z);
    camera.lookAt(focus);
  }

  return { update, attachZoomWheel };
}
