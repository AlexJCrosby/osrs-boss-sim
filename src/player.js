export function createPlayer(THREE, { scene, startX, startY }) {
  const player = { x: startX, y: startY };

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  scene.add(mesh);
  mesh.renderOrder = 5;


  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function sync() {
    mesh.position.set(player.x + 0.5, 0.45, player.y + 0.5);
  }

  function setPos(x, y) {
    player.x = x;
    player.y = y;
    sync();
  }

    function stepToward(target, speed, gridW, gridH) {
    if (!target) return;

    let steps = speed;

    while (steps > 0 && (player.x !== target.x || player.y !== target.y)) {
      const dx = target.x - player.x;
      const dy = target.y - player.y;

      // OSRS-style step: can move diagonally (x and y in the same step)
      player.x += Math.sign(dx); // -1, 0, or 1
      player.y += Math.sign(dy); // -1, 0, or 1

      // keep inside arena
      player.x = clamp(player.x, 0, gridW - 1);
      player.y = clamp(player.y, 0, gridH - 1);

      steps--;
    }

    sync();
  }


  return {
    get x() { return player.x; },
    get y() { return player.y; },
    setPos,
    stepToward,
  };
}
