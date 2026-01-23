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

// ===== Health UX controls (persisted) =====
const hpLabel = document.createElement("span");
hpLabel.className = "hint";
hpLabel.textContent = "Start HP:";

const hpInput = document.createElement("input");
hpInput.type = "number";
hpInput.min = "10";
hpInput.max = "99";
hpInput.step = "1";
hpInput.style.width = "64px";

const barLabel = document.createElement("label");
barLabel.className = "hint";
barLabel.style.display = "inline-flex";
barLabel.style.alignItems = "center";
barLabel.style.gap = "6px";

const showBarToggle = document.createElement("input");
showBarToggle.type = "checkbox";

const barText = document.createElement("span");
barText.textContent = "Show bar";

barLabel.append(showBarToggle, barText);

// Load persisted settings (or defaults)
const storedStartHP = Number(localStorage.getItem("startHP") || "99");
hpInput.value = String(Math.min(99, Math.max(10, storedStartHP)));

const storedShowBar = localStorage.getItem("showHPBar");
showBarToggle.checked = storedShowBar === null ? true : storedShowBar === "1";

// Inject controls into the existing .hud (top bar)
const hudEl = document.querySelector(".hud");
hudEl.insertBefore(hpLabel, startBtn);
hudEl.insertBefore(hpInput, startBtn);
hudEl.insertBefore(barLabel, startBtn);

hpInput.addEventListener("change", () => {
  const v = Math.min(99, Math.max(10, Number(hpInput.value || 99)));
  hpInput.value = String(v);
  localStorage.setItem("startHP", String(v));
});

showBarToggle.addEventListener("change", () => {
  localStorage.setItem("showHPBar", showBarToggle.checked ? "1" : "0");
  updateHealthUI(); // will be defined below
});

// ===== Health UI (orb + optional bar) =====
const healthHud = document.createElement("div");
healthHud.className = "healthHud";

const hpOrb = document.createElement("div");
hpOrb.className = "hpOrb";

const hpOrbValue = document.createElement("div");
hpOrbValue.className = "hpOrbValue";
hpOrb.appendChild(hpOrbValue);

const hpBar = document.createElement("div");
hpBar.className = "hpBar";

const hpBarFill = document.createElement("div");
hpBarFill.className = "hpBarFill";
hpBar.appendChild(hpBarFill);

healthHud.append(hpBar, hpOrb);
document.body.appendChild(healthHud);

// ===== Hit splats (damage feedback) =====
const hitSplatLayer = document.createElement("div");
hitSplatLayer.className = "hitSplatLayer";
document.body.appendChild(hitSplatLayer);

// Simple inline SVG splat background (no external assets)
function splatSvgDataUri(fill, stroke) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48">
    <path d="M32 2
      L37 10 L48 6 L46 16 L58 18 L50 26
      L60 34 L48 34 L50 46 L38 40 L32 48
      L26 40 L14 46 L16 34 L4 34 L14 26
      L6 18 L18 16 L16 6 L27 10 Z"
      fill="${fill}" stroke="${stroke}" stroke-width="2" />
  </svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

const SPLAT_RED_BG = splatSvgDataUri("#b40000", "#3b0000");
// Optional for later (splash/0):
const SPLAT_BLUE_BG = splatSvgDataUri("#1a52d6", "#0b1b4a");

function worldToScreen(x, y, z, camera, canvas) {
  const v = new THREE.Vector3(x, y, z);
  v.project(camera);
  const rect = canvas.getBoundingClientRect();
  const sx = (v.x * 0.5 + 0.5) * rect.width + rect.left;
  const sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
  return { x: sx, y: sy, onScreen: v.z > -1 && v.z < 1 };
}

// Active splats
const hitSplats = [];
function spawnHitSplat({ value, kind = "damage" }) {
  const el = document.createElement("div");
  el.className = "hitSplat";

  const bg = document.createElement("div");
  bg.className = "splatBg";
  bg.style.backgroundImage = (kind === "splash") ? SPLAT_BLUE_BG : SPLAT_RED_BG;

  const val = document.createElement("div");
  val.className = "splatVal";
  val.textContent = String(value);

  el.append(bg, val);
  hitSplatLayer.appendChild(el);

  // World anchor: above player's head (using render coords)
  const anchor = {
    wx: player.renderX + 0.5,
    wy: 1.35,
    wz: player.renderY + 0.5,
  };

  hitSplats.push({
    el,
    anchor,
    age: 0,
    life: 0.75,
    risePx: 28,
  });
}

function updateHitSplats(dt) {
  for (let i = hitSplats.length - 1; i >= 0; i--) {
    const s = hitSplats[i];
    s.age += dt;

    const t = Math.min(1, s.age / s.life);
    const alpha = 1 - t;

    const screen = worldToScreen(s.anchor.wx, s.anchor.wy, s.anchor.wz, camera, canvas);
    if (!screen.onScreen) {
      // still keep it; it will be removed by lifetime
    }

    // Rise up a bit + fade out
    const y = screen.y - (t * s.risePx);

    s.el.style.left = `${screen.x}px`;
    s.el.style.top = `${y}px`;
    s.el.style.opacity = `${alpha}`;

    if (s.age >= s.life) {
      s.el.remove();
      hitSplats.splice(i, 1);
    }
  }
}


// Real HP state (replaces playerHP)
let maxHP = Number(hpInput.value);
let currentHP = maxHP;

function updateHealthUI() {
  maxHP = Math.min(99, Math.max(10, Number(maxHP || 99)));
  currentHP = Math.min(maxHP, Math.max(0, Number(currentHP || 0)));

  const pct = maxHP <= 0 ? 0 : (currentHP / maxHP);
  const deg = Math.max(0, Math.min(360, pct * 360));

  // Orb: red portion shrinks as HP drops (visual emptying)
  // Remaining is dark/grey.
  hpOrb.style.background = `conic-gradient(#b40000 0deg ${deg}deg, rgba(20,20,20,0.85) ${deg}deg 360deg)`;
  hpOrbValue.textContent = String(currentHP);

  // Bar: scale down from bottom
  hpBarFill.style.transform = `scaleY(${pct})`;

  // Toggle bar visibility (future UX feature; already wired)
  hpBar.style.display = showBarToggle.checked ? "block" : "none";
}
updateHealthUI();

function applyDamage(amount, sourceLabel) {
  currentHP -= amount;
  if (currentHP < 0) currentHP = 0;

  // Accumulate for a single hit splat at end of tick
  // (Works even if multiple tornadoes hit in same tick.)
  pendingDamageThisTick += amount;
  pendingTickIndex = tick;

  console.log(`${sourceLabel} hit: -${amount} HP (now ${currentHP}/${maxHP})`);
  updateHealthUI();

  if (currentHP <= 0) {
    console.log("Player died (HP <= 0). Resetting...");
    reset();
  }
}

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

// (removed) let playerHP = 100;  // temporary plumbing
// Use currentHP/maxHP instead (defined above)

// ===== Danger Floor =====
const dangerFloor = createDangerFloor(THREE, {
  scene,
  gridW: GRID_W,
  gridH: GRID_H,
  getPlayerTile: () => ({ x: player.x, y: player.y }),
  onPlayerDamaged: (amount) => {
  applyDamage(amount, "Danger floor");
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
  applyDamage(amount, "Tornado");
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
  getFocus: () => ({ x: player.renderX, y: player.renderY }),
});

// Register wheel ONCE (not per-frame)
cameraCtl.attachZoomWheel();

// ===== Tick loop (movement) =====
let tick = 0;
let ticker = null;

// ===== Tick damage aggregation (MVP: one splat per tick) =====
let pendingDamageThisTick = 0;
let pendingTickIndex = 0;


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

    // ===== End-of-tick damage feedback =====
    if (pendingDamageThisTick > 0 && pendingTickIndex === tick) {
      spawnHitSplat({ value: pendingDamageThisTick, kind: "damage" });
      pendingDamageThisTick = 0;
      }
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

  player.updateVisual(dt);
  tornadoes.updateVisual(dt);
  cameraCtl.update(dt);
  updateHitSplats(dt);

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

  maxHP = Math.min(99, Math.max(10, Number(hpInput.value || 99)));
  currentHP = maxHP;
  updateHealthUI();

  pendingDamageThisTick = 0;
  hitSplatLayer.innerHTML = "";
  hitSplats.length = 0;

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

  // On reset, go back to full HP of the chosen start value
  maxHP = Math.min(99, Math.max(10, Number(hpInput.value || 99)));
  currentHP = maxHP;
  updateHealthUI();

  pendingDamageThisTick = 0;
  hitSplatLayer.innerHTML = "";
  hitSplats.length = 0;


  targeting.clear();
  player.setPos(5, 5);
}


