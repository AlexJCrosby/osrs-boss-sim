import * as THREE from "./vendor/three.module.min.js";
import { createArena } from "./src/arena.js";
import { createPlayer } from "./src/player.js";
import { createOrbitCameraController } from "./src/camera.js";
import { startTicker } from "./src/tick.js";
import { createTargeting } from "./src/targeting.js";
import { createDangerFloor } from "./src/dangerFloor.js";
import { createBoss } from "./src/boss.js";
import { createTornadoes } from "./src/tornadoes.js";




console.log("THREE loaded", THREE.REVISION);

// ===== Config =====
const GRID_W = 12;
const GRID_H = 12;
const TICK_MS = 600;
const PLAYER_SPEED_TILES_PER_TICK = 2;

const GameState = Object.freeze({
  LOBBY: "LOBBY",
  FIGHT: "FIGHT",
});

let state = GameState.LOBBY;
let tickerId = null; // will hold setInterval id

// ===== DOM / HUD =====
const canvas = document.getElementById("game");
const tickEl = document.getElementById("tick");
const targetEl = document.getElementById("target");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");

statusEl.textContent = "Lobby"; // <-- moved here (after statusEl exists)

document.getElementById("resetBtn").addEventListener("click", reset);
startBtn.addEventListener("click", startFight);

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

// ===== Boss =====
const boss = createBoss(THREE, {
  scene,
  startX: 9,
  startY: 9,
});

// ===== Targeting (target + ring + click-to-set) =====
const targeting = createTargeting(THREE, {
  scene,
  canvas,
  targetEl,
  pickTileFromMouse: arena.pickTileFromMouse,
});

// ===== Danger Floor =====
let playerHP = 100; // temporary plumbing (replace with your real HP later)

const dangerFloor = createDangerFloor(THREE, {
  scene,
  gridW: GRID_W,
  gridH: GRID_H,
  getPlayerTile: () => ({ x: player.x, y: player.y }),
  onPlayerDamaged: (amount) => {
    playerHP -= amount;
    console.log(`Danger floor hit: -${amount} HP (now ${playerHP})`);

    if (playerHP <= 0) {
      console.log("Player died (HP <= 0). Resetting...");
      reset();
    }
  },
  config: {
    spawnDelayTicks: 12,
    safeTicks: 6,
    unsafeTicks: 14,
    damageMin: 10,
    damageMax: 20,
  },
});

// ===== Tornadoes =====
const tornadoes = createTornadoes(THREE, {
  scene,
  gridW: GRID_W,
  gridH: GRID_H,
  getPlayerTile: () => ({ x: player.x, y: player.y }),
  onPlayerDamaged: (amount) => {
    playerHP -= amount;
    console.log(`Tornado hit: -${amount} HP (now ${playerHP})`);

    if (playerHP <= 0) {
      console.log("Player died (HP <= 0). Resetting...");
      reset();
    }
  },
  config: {
    firstSpawnTick: 60,
    periodTicks: 54,
    durationTicks: 21,
    slamLeadTicks: 2,

    baseCount: 2,
    countGrowth: 1,

    cornerRegionSize: 3,

    speedTilesPerTick: 1,

    damageMin: 5,
    damageMax: 15,
  },
});


// ===== Camera controller =====
const cameraCtl = createOrbitCameraController(THREE, {
  canvas,
  camera,
  getFocus: () => ({ x: player.x, y: player.y }),
});

// Register wheel ONCE (not per-frame)
cameraCtl.attachZoomWheel();

// ===== Tick loop (movement) =====
let tick = 0;
let ticker = null;

function startFightLoop() {
  if (ticker) return;

  ticker = startTicker({
    tickMs: TICK_MS,
    onTick: () => {
    if (state !== GameState.FIGHT) return;

    tick++;
    tickEl.textContent = String(tick);

    player.stepToward(targeting.target, PLAYER_SPEED_TILES_PER_TICK, GRID_W, GRID_H);

    if (targeting.target && player.x === targeting.target.x && player.y === targeting.target.y) {
      targeting.clear();
    }

    // Danger floor: update + render once per fight tick
    dangerFloor.update(tick);
    dangerFloor.render();

    // Tornadoes: update + render once per fight tick
    tornadoes.update(tick);

    },
  });
}

function stopFightLoop() {
  if (!ticker) return;
  ticker.stop();
  ticker = null;
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

  cameraCtl.update(dt);
  renderer.render(scene, camera);

  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// ===== Game State =====
function startFight() {
  targeting.clear();

  tick = 0;

  dangerFloor.reset();
  tornadoes.reset();

  playerHP = 100;

  tickEl.textContent = "0";

  player.setPos(5, 5);

  state = GameState.FIGHT;
  statusEl.textContent = "Fight";

  startFightLoop();
}


// ===== Reset =====
function reset() {
  stopFightLoop();

  state = GameState.LOBBY;
  statusEl.textContent = "Lobby";

  tick = 0;
  tickEl.textContent = "0";
  dangerFloor.reset();
  tornadoes.reset();

  playerHP = 100;

  targeting.clear();
  player.setPos(5, 5);
}


