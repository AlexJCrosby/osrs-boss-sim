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

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // --- Smoothed camera focus (prevents snapping when logical tile updates) ---
  let smoothFx = null;
  let smoothFz = null;
  const FOCUS_Y = 0.45;   // keep constant (matches your old focus.y)
  const FOCUS_SMOOTH = 2; // lower = floatier, higher = tighter

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
    canvas.addEventListener(
      "wheel",
      (e) => {
        orbitRadius += Math.sign(e.deltaY) * 0.5;
        orbitRadius = clamp(orbitRadius, 6, 15);
        e.preventDefault();
      },
      { passive: false }
    );
  }

  function update(dt) {
    // Yaw (left/right)
    const yawRight = keys.has("d") || keys.has("arrowright");
    const yawLeft  = keys.has("a") || keys.has("arrowleft");
    if (yawRight) orbitYaw += YAW_SPEED * dt;
    if (yawLeft)  orbitYaw -= YAW_SPEED * dt;

    // Pitch (up/down)
    const pitchDown = keys.has("s") || keys.has("arrowdown");
    const pitchUp   = keys.has("w") || keys.has("arrowup");
    if (pitchDown) orbitPitch -= PITCH_SPEED * dt;
    if (pitchUp)   orbitPitch += PITCH_SPEED * dt;

    orbitPitch = clamp(orbitPitch, MIN_PITCH, MAX_PITCH);

    // Raw focus (player's smooth render position should be coming from getFocus())
    const f = getFocus();
    const rawFx = f.x + 0.5;
    const rawFz = f.y + 0.5;

    // Initialize smoothing on first frame
    if (smoothFx === null || smoothFz === null) {
      smoothFx = rawFx;
      smoothFz = rawFz;
    }

    // Frame-rate independent smoothing
    const t = 1 - Math.exp(-FOCUS_SMOOTH * dt);
    smoothFx = lerp(smoothFx, rawFx, t);
    smoothFz = lerp(smoothFz, rawFz, t);

    const focus = new THREE.Vector3(smoothFx, FOCUS_Y, smoothFz);

    const x = focus.x + orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
    const z = focus.z + orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
    const y = focus.y + orbitRadius * Math.sin(orbitPitch);

    camera.position.set(x, y, z);
    camera.lookAt(focus);
    }
    
  return { update, attachZoomWheel };
}
