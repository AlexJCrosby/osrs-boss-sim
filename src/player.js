export function createPlayer(THREE, { scene, startX, startY }) {
  // Logical (grid) position
  const player = { x: startX, y: startY };

  // Visual (smooth) position
  let renderX = player.x;
  let renderY = player.y;

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  scene.add(mesh);
  mesh.renderOrder = 5;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function sync() {
    // Draw using the smooth visual position
    mesh.position.set(renderX + 0.5, 0.45, renderY + 0.5);
  }

  function setPos(x, y) {
    player.x = x;
    player.y = y;

    // Teleport visuals too (e.g., on reset/start)
    renderX = player.x;
    renderY = player.y;

    sync();
  }

  // OSRS-style stepping: a "step" can be diagonal (x and y can change together).
  // speed = tiles per tick (you pass 2 for the player)
  function stepToward(target, speed, gridW, gridH) {
    if (!target) return;

    let steps = speed;
    while (steps > 0 && (player.x !== target.x || player.y !== target.y)) {
      const dx = target.x - player.x;
      const dy = target.y - player.y;

      player.x += Math.sign(dx);
      player.y += Math.sign(dy);

      // Keep inside arena each step (safer than clamping only once at the end)
      player.x = clamp(player.x, 0, gridW - 1);
      player.y = clamp(player.y, 0, gridH - 1);

      steps--;
    }
  }

  // Call this every animation frame (not on tick)
  function updateVisual(dt) {
    // Higher = snappier, lower = floatier
    const SMOOTH = 14;

    // Frame-rate independent smoothing
    const t = 1 - Math.exp(-SMOOTH * dt);

    renderX = lerp(renderX, player.x, t);
    renderY = lerp(renderY, player.y, t);

    sync();
  }

  sync();

  return {
    get x() { return player.x; },
    get y() { return player.y; },

    get renderX() { return renderX; },
    get renderY() { return renderY; },

    setPos,
    stepToward,
    updateVisual,
  };
}
