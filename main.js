import * as THREE from "./vendor/three.module.min.js";
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
camera.position.set(6, 10, 16);

// ===== Lights =====
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(10, 20, 10);
scene.add(dir);

// ===== Floor + Grid =====
const floorGeo = new THREE.PlaneGeometry(GRID_W, GRID_H);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 1 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.set(GRID_W / 2, 0, GRID_H / 2);
scene.add(floor);

const grid = new THREE.GridHelper(GRID_W, GRID_W, 0x2b2f3a, 0x2b2f3a);
grid.position.set(GRID_W / 2, 0.001, GRID_H / 2);
scene.add(grid);

// ===== Picking plane (invisible) =====
const pickPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID_W, GRID_H),
  new THREE.MeshBasicMaterial({ visible: false })
);
pickPlane.rotation.x = -Math.PI / 2;
pickPlane.position.copy(floor.position);
scene.add(pickPlane);

const raycaster = new THREE.Raycaster();
const mouseNdc = new THREE.Vector2();

// ===== Player =====
const player = { x: 5, y: 5 };
const playerMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.9, 0.9, 0.9),
  new THREE.MeshBasicMaterial({ color: 0x00ff00 })
);
scene.add(playerMesh);
syncPlayerMesh();

// ===== Target ring =====
let target = null; // {x,y} | null
const targetRing = new THREE.Mesh(
  new THREE.RingGeometry(0.25, 0.45, 32),
  new THREE.MeshBasicMaterial({ color: 0xffcc66, side: THREE.DoubleSide })
);
targetRing.rotation.x = -Math.PI / 2;
targetRing.visible = false;
scene.add(targetRing);

// Right-click to set target
canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  const hit = pickTileFromMouse(e);
  if (!hit) return;

  target = hit;
  targetEl.textContent = `${hit.x},${hit.y}`;
  targetRing.visible = true;
  targetRing.position.set(hit.x + 0.5, 0.01, hit.y + 0.5);
});

// ===== Tick loop (movement) =====
let tick = 0;
setInterval(() => {
  tick++;
  tickEl.textContent = String(tick);

  stepMovement();
}, TICK_MS);

// ===== Camera controls =====
// ===== Orbit camera around player (WASD rotates) =====
const keys = new Set();
window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

// Orbit parameters
let orbitYaw = Math.PI;    // rotation around Y axis
let orbitPitch = 0.65;     // tilt downward (0 = horizontal, ~0.8 good)
let orbitRadius = 14;      // distance from player

// Tuning
const YAW_SPEED = 1.8;     // radians/sec (WASD)
const PITCH_SPEED = 1.4;   // radians/sec (optional)
const MIN_PITCH = 0.2;
const MAX_PITCH = 1.2;

// If you want mouse drag to rotate too, keep this:
// Prevent right-click menu (needed for Alt+RMB drag)
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// Alt + Right-click drag to look around
let dragging = false;
let lastX = 0, lastY = 0;

canvas.addEventListener("mousedown", (e) => {
  // Right mouse button is 2
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

  // Adjust signs if you want to invert
  orbitYaw -= dx * 0.004;
  orbitPitch += dy * 0.004;
  orbitPitch = clamp(orbitPitch, MIN_PITCH, MAX_PITCH);
});


function updateCamera(dt) {
  // WASD rotates around player (no translation)
  // A/D: orbit left/right
  if (keys.has("d")) orbitYaw += YAW_SPEED * dt;
  if (keys.has("a")) orbitYaw -= YAW_SPEED * dt;

  // Optional: W/S adjust pitch (tilt up/down)
  if (keys.has("s")) orbitPitch -= PITCH_SPEED * dt;
  if (keys.has("w")) orbitPitch += PITCH_SPEED * dt;
  orbitPitch = clamp(orbitPitch, MIN_PITCH, MAX_PITCH);

  // Camera position relative to player (player mesh is centered in tile)
  const target = new THREE.Vector3(
    player.x + 0.5,
    0.45,
    player.y + 0.5
  );

  // Convert spherical coords → Cartesian
  const x = target.x + orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const z = target.z + orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
  const y = target.y + orbitRadius * Math.sin(orbitPitch);

  camera.position.set(x, y, z);
  camera.lookAt(target);

  canvas.addEventListener("wheel", (e) => {
  orbitRadius += Math.sign(e.deltaY) * 0.5;
  orbitRadius = clamp(orbitRadius, 6, 15);
  e.preventDefault();
}, { passive: false });
}

// ===== Game logic =====
function stepMovement() {
  if (!target) return;

  if (player.x === target.x && player.y === target.y) {
    clearTarget();
    return;
  }

  let steps = PLAYER_SPEED_TILES_PER_TICK;
  while (steps > 0 && (player.x !== target.x || player.y !== target.y)) {
    if (player.x !== target.x) player.x += Math.sign(target.x - player.x);
    else if (player.y !== target.y) player.y += Math.sign(target.y - player.y);
    steps--;
  }

  player.x = clamp(player.x, 0, GRID_W - 1);
  player.y = clamp(player.y, 0, GRID_H - 1);
  syncPlayerMesh();

  if (player.x === target.x && player.y === target.y) clearTarget();
}

function clearTarget() {
  target = null;
  targetEl.textContent = "none";
  targetRing.visible = false;
}

function syncPlayerMesh() {
  playerMesh.position.set(player.x + 0.5, 0.45, player.y + 0.5);
}

function pickTileFromMouse(e) {
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  mouseNdc.set(x, y);

  raycaster.setFromCamera(mouseNdc, camera);
  const hits = raycaster.intersectObject(pickPlane, false);
  if (hits.length === 0) return null;

  const p = hits[0].point;
  const tx = Math.floor(p.x);
  const ty = Math.floor(p.z);

  if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) return null;
  return { x: tx, y: ty };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

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

  updateCamera(dt);
  renderer.render(scene, camera);

  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// ===== Reset =====
function reset() {
  tick = 0;
  tickEl.textContent = "0";
  clearTarget();
  player.x = 5;
  player.y = 5;
  syncPlayerMesh();
}
