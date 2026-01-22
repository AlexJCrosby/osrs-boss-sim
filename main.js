import * as THREE from "./vendor/three.module.min.js";
import { createArena } from "./src/arena.js";
import { createPlayer } from "./src/player.js";
import { createOrbitCameraController } from "./src/camera.js";
import { startTicker } from "./src/tick.js";
import { createTargeting } from "./src/targeting.js";

console.log("THREE loaded", THREE.REVISION);

// ===== Config =====
const GRID_W = 12;
const GRID_H = 12;
const TICK_MS = 600;
const PLAYER_SPEED_TILES_PER_TICK = 2;

// ===== DOM / HUD =====
const canvas = document.getElementById("game");
const tickEl = document.getElementById("tick");
const targetEl = document.getElementById("target");
document.getElementById("resetBtn").addEventListener("click", reset);

// Prevent right-click menu
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ===== Renderer / Scene / Camera =====
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1115);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);

// ===== Lights =====
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(10, 20, 10);
scene.add(dir);

// ===== Arena =====
const arena = createArena(THREE, {
  scene,
  canvas,
  camera,
  gridW: GRID_W,
  gridH: GRID_H,
});

// ===== Player =====
const player = createPlayer(THREE, {
  scene,
  startX: 5,
  startY: 5,
});

// ===== Targeting (target + ring + click-to-set) =====
const targeting = createTargeting(THREE, {
  scene,
  canvas,
  targetEl,
  pickTileFromMouse: arena.pickTileFromMouse,
});

// ===== Camera controller =====
const cameraCtl = createOrbitCameraController(THREE, {
  canvas,
  camera,
  getFocus: () => ({ x: player.x, y: player.y }),
});

// Register wheel ONCE (not per-frame)
cameraCtl.attachZoomWheel();

// ===== Tick loop =====
let tick = 0;
const ticker = startTicker({
  tickMs: TICK_MS,
  onTick: () => {
    tick++;
    tickEl.textContent = String(tick);

    // movement tick
    player.stepToward(targeting.target, PLAYER_SPEED_TILES_PER_TICK, GRID_W, GRID_H);

    if (targeting.target && player.x === targeting.target.x && player.y === targeting.target.y) {
      targeting.clear();
    }
  },
});

// ===== Resize + render loop =====
function onResize() {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", onResize);
onResize();

let last = performance.now();
function animate(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  cameraCtl.update(dt);
  renderer.render(scene, camera);

  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// ===== Reset =====
function reset() {
  tick = 0;
  tickEl.textContent = "0";

  targeting.clear();
  player.setPos(5, 5);
}
