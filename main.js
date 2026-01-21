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
  if (e.button !== 2) return;
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
// keys
const keys = new Set();
window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

// mouse drag look
let dragging = false;
let lastX = 0, lastY = 0;

// Initialise yaw/pitch so the camera looks toward center
let yaw = Math.PI;    // facing “back” toward the grid
let pitch = -0.35;

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
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

  yaw -= dx * 0.003;
  pitch -= dy * 0.003;
  pitch = clamp(pitch, -1.2, 0.1);
});

function updateCamera(dt) {
  // forward vector from yaw/pitch
  const forward = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch)
  ).normalize();

  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  const speed = 8; // units per second
  const move = new THREE.Vector3();

  if (keys.has("w")) move.add(forward);
  if (keys.has("s")) move.sub(forward);
  if (keys.has("d")) move.add(right);
  if (keys.has("a")) move.sub(right);

  move.y = 0; // keep horizontal
  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(speed * dt);
    camera.position.add(move);
  }

  // look where we’re facing
  const lookTarget = new THREE.Vector3().copy(camera.position).add(forward);
  camera.lookAt(lookTarget);
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
