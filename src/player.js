import { createTileIndicator } from "./tileIndicator.js";

export function createPlayer(THREE, { scene, startX, startY }) {
  // Logical (grid) position
  const player = { x: startX, y: startY };

  // Visual (smooth) position
  let renderX = player.x;
  let renderY = player.y;
  

    // --- Tick-length movement animation so it glides over the whole tick ---
    let tickSeconds = 0.6; // matches 0.6s tick
    let moveFromX = renderX, moveFromY = renderY;
    let moveToX = renderX, moveToY = renderY;
    let moveElapsed = tickSeconds;

    function beginMoveToCurrentLogical() {
      // start from wherever player is currently drawn 
      moveFromX = renderX;
      moveFromY = renderY;
      moveToX = player.x;
      moveToY = player.y;
      moveElapsed = 0;
    }

    function setTickSeconds(sec) {
      const s = Math.max(0.05, Number(sec) || 0.6);
      tickSeconds = s;

      // Keep animation state sane
      moveElapsed = Math.min(moveElapsed, tickSeconds);
    }


  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  scene.add(mesh);
  mesh.renderOrder = 5;

  // ===== Player tile indicator =====
  let tileIndicator = null;

  function createPlayerTileIndicator(config = {}) {
    if (tileIndicator) return tileIndicator;

    tileIndicator = createTileIndicator(THREE, {
      scene,
      getTiles: () => [{ x: player.x, y: player.y }], // TRUE tile
      config: { maxTiles: 1, ...config },
    });

    return tileIndicator;
  }

  function syncTileIndicator() {
    if (!tileIndicator) return;
    tileIndicator.sync();
  }

  function setTileIndicatorStyle({ enabled, color, opacity255 } = {}) {
    if (!tileIndicator) return;
    if (enabled !== undefined) tileIndicator.setEnabled(enabled);
    if (color !== undefined) tileIndicator.setColor(color);
    if (opacity255 !== undefined) tileIndicator.setOpacity255(opacity255);
  }

  function disposeTileIndicator() {
    if (!tileIndicator) return;
    tileIndicator.dispose();
    tileIndicator = null;
  }

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

    // Teleport visuals too on reset/restart
    renderX = player.x;
    renderY = player.y;

    // also reset animation so player doesn't "glide" after a teleport/reset
    moveFromX = moveToX = renderX;
    moveFromY = moveToY = renderY;
    moveElapsed = tickSeconds;

    sync();
    syncTileIndicator();
  }

  // OSRS-style stepping: a "step" can be diagonal (x and y can change together).
  // speed = tiles per tick (2 for player while run is active)
  function stepToward(target, speed, gridW, gridH) {
    if (!target) return;

    let steps = speed;
    while (steps > 0 && (player.x !== target.x || player.y !== target.y)) {
      const dx = target.x - player.x;
      const dy = target.y - player.y;

      player.x += Math.sign(dx);
      player.y += Math.sign(dy);

      // Keep inside arena each step
      player.x = clamp(player.x, 0, gridW - 1);
      player.y = clamp(player.y, 0, gridH - 1);

      steps--;
    }
    // If player moved logically this tick, start a glide toward the new logical tile
    beginMoveToCurrentLogical();

  }

  function updateVisual(dt) {
    // progress the current move animation
    moveElapsed = Math.min(tickSeconds, moveElapsed + dt);
    const t = moveElapsed / tickSeconds;

    const u = t; // linear

    renderX = lerp(moveFromX, moveToX, u);
    renderY = lerp(moveFromY, moveToY, u);

    sync();
  }


  sync();

  return {
    
    get x() { return player.x; },
    get y() { return player.y; },

    get renderX() { return renderX; },
    get renderY() { return renderY; },

    createPlayerTileIndicator,
    syncTileIndicator,
    setTileIndicatorStyle,
    disposeTileIndicator,

    setTickSeconds,
    setPos,
    stepToward,
    updateVisual,
  };
}
