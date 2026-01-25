import * as THREE from "./vendor/three.module.min.js";
import { createArena } from "./src/arena.js";
import { createPlayer } from "./src/player.js";
import { createOrbitCameraController } from "./src/camera.js";
import { createTicker } from "./src/tick.js";
import { createTargeting } from "./src/targeting.js";
import { createDangerFloor } from "./src/dangerFloor.js";
import { createBoss } from "./src/boss.js";
import { createTornadoes } from "./src/tornadoes.js";
import { createTileIndicator } from "./src/tileIndicator.js";


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

// ===== Player prayer state (MVP) =====
const Prayer = Object.freeze({
  NONE: "NONE",
  RANGE: "RANGE",
  MAGE: "MAGE",
});

// Default for now (until UI exists)
let playerPrayer = Prayer.NONE;

// ===== Prayer UI wiring =====
const prayRangeBtn = document.getElementById("prayRange");
const prayMageBtn = document.getElementById("prayMage");

function setPlayerPrayer(next) {
  // Toggle behaviour: clicking same prayer turns it off
  if (playerPrayer === next) playerPrayer = Prayer.NONE;
  else playerPrayer = next;

  updatePrayerUI();
}

function updatePrayerUI() {
  if (!prayRangeBtn || !prayMageBtn) return;

  prayRangeBtn.classList.toggle("active", playerPrayer === Prayer.RANGE);
  prayMageBtn.classList.toggle("active", playerPrayer === Prayer.MAGE);
}

// Click handlers
if (prayRangeBtn) prayRangeBtn.addEventListener("click", () => setPlayerPrayer(Prayer.RANGE));
if (prayMageBtn) prayMageBtn.addEventListener("click", () => setPlayerPrayer(Prayer.MAGE));

// Ensure correct initial highlight
updatePrayerUI();

// Boss protection prayers mitigate by 75% => take 25% damage
const PROTECT_PRAYER_MULT = 0.25;


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

// ===== God mode (training mode) =====
const godLabel = document.createElement("label");
godLabel.className = "hint";
godLabel.style.display = "inline-flex";
godLabel.style.alignItems = "center";
godLabel.style.gap = "6px";

const godToggle = document.createElement("input");
godToggle.type = "checkbox";

const godText = document.createElement("span");
godText.textContent = "God mode";

godLabel.append(godToggle, godText);

// Load persisted value
const storedGodMode = localStorage.getItem("godMode");
godToggle.checked = storedGodMode === "1";

// Inject into HUD before Start button
hudEl.insertBefore(godLabel, startBtn);

godToggle.addEventListener("change", () => {
  localStorage.setItem("godMode", godToggle.checked ? "1" : "0");
});

// ===== Slow-mo speed control (persisted) =====
const speedLabel = document.createElement("span");
speedLabel.className = "hint";
speedLabel.textContent = "Speed:";

const speedValue = document.createElement("span");
speedValue.className = "hint";
speedValue.style.minWidth = "52px";

const speedSlider = document.createElement("input");
speedSlider.type = "range";
speedSlider.min = "25";
speedSlider.max = "100";
speedSlider.step = "5";
speedSlider.style.width = "140px";

const speedInput = document.createElement("input");
speedInput.type = "number";
speedInput.min = "25";
speedInput.max = "100";
speedInput.step = "5";
speedInput.style.width = "64px";

// Load persisted
const storedSpeed = Number(localStorage.getItem("simSpeedPct") || "100");
const startSpeed = Math.min(100, Math.max(25, storedSpeed));
speedSlider.value = String(startSpeed);
speedInput.value = String(startSpeed);
speedValue.textContent = `${startSpeed}%`;

// Insert into HUD before Start button
hudEl.insertBefore(speedLabel, startBtn);
hudEl.insertBefore(speedSlider, startBtn);
hudEl.insertBefore(speedInput, startBtn);
hudEl.insertBefore(speedValue, startBtn);

// ===== HUD helpers =====
function clamp255(v) {
  v = Number(v);
  if (!Number.isFinite(v)) return 255;
  return Math.max(0, Math.min(255, Math.floor(v)));
}

function normalizeHex(s) {
  s = String(s || "").trim();
  if (!s.startsWith("#")) s = "#" + s;
  if (s.length === 4) {
    s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  return s.toUpperCase();
}


// ===== Player Tile Indicator UI =====
const ptiLabel = document.createElement("label");
ptiLabel.className = "hint";
ptiLabel.style.display = "inline-flex";
ptiLabel.style.alignItems = "center";
ptiLabel.style.gap = "6px";

const ptiToggle = document.createElement("input");
ptiToggle.type = "checkbox";
ptiToggle.checked = (localStorage.getItem("ptiEnabled") ?? "1") === "1";

const ptiToggleText = document.createElement("span");
ptiToggleText.textContent = "Player tile";

ptiLabel.append(ptiToggle, ptiToggleText);

// Color inputs (swatch + hex)
const ptiColor = document.createElement("input");
ptiColor.type = "color";
ptiColor.value = localStorage.getItem("ptiColor") || "#FFB03F";

const ptiHex = document.createElement("input");
ptiHex.type = "text";
ptiHex.value = ptiColor.value.toUpperCase();
ptiHex.style.width = "90px";
ptiHex.placeholder = "#RRGGBB";

// Opacity (0..255 like RuneLite)
const ptiOpacity = document.createElement("input");
ptiOpacity.type = "range";
ptiOpacity.min = "0";
ptiOpacity.max = "255";
ptiOpacity.value = String(Number(localStorage.getItem("ptiOpacity255") || "160"));

const ptiOpacityNum = document.createElement("input");
ptiOpacityNum.type = "number";
ptiOpacityNum.min = "0";
ptiOpacityNum.max = "255";
ptiOpacityNum.step = "1";
ptiOpacityNum.value = ptiOpacity.value;
ptiOpacityNum.style.width = "64px";

// Add to HUD (place before Start button so it’s visible)
hudEl.insertBefore(ptiLabel, startBtn);
hudEl.insertBefore(ptiColor, startBtn);
hudEl.insertBefore(ptiHex, startBtn);
hudEl.insertBefore(ptiOpacity, startBtn);
hudEl.insertBefore(ptiOpacityNum, startBtn);



// !!! ===== Tornado Tile Indicator UI ===== !!! 
const ttiLabel = document.createElement("label");
ttiLabel.className = "hint";
ttiLabel.style.display = "inline-flex";
ttiLabel.style.alignItems = "center";
ttiLabel.style.gap = "6px";

const ttiToggle = document.createElement("input");
ttiToggle.type = "checkbox";
ttiToggle.checked = (localStorage.getItem("ttiEnabled") ?? "1") === "1";

const ttiToggleText = document.createElement("span");
ttiToggleText.textContent = "Tornado tiles";

ttiLabel.append(ttiToggle, ttiToggleText);

// Color inputs (swatch + hex)
const ttiColor = document.createElement("input");
ttiColor.type = "color";
ttiColor.value = localStorage.getItem("ttiColor") || "#00FF66";

const ttiHex = document.createElement("input");
ttiHex.type = "text";
ttiHex.value = ttiColor.value.toUpperCase();
ttiHex.style.width = "90px";
ttiHex.placeholder = "#RRGGBB";

// Opacity (0..255)
const ttiOpacity = document.createElement("input");
ttiOpacity.type = "range";
ttiOpacity.min = "0";
ttiOpacity.max = "255";
ttiOpacity.value = String(Number(localStorage.getItem("ttiOpacity255") || "160"));

const ttiOpacityNum = document.createElement("input");
ttiOpacityNum.type = "number";
ttiOpacityNum.min = "0";
ttiOpacityNum.max = "255";
ttiOpacityNum.step = "1";
ttiOpacityNum.value = ttiOpacity.value;
ttiOpacityNum.style.width = "64px";

// Add to HUD near the other indicator controls
hudEl.insertBefore(ttiLabel, startBtn);
hudEl.insertBefore(ttiColor, startBtn);
hudEl.insertBefore(ttiHex, startBtn);
hudEl.insertBefore(ttiOpacity, startBtn);
hudEl.insertBefore(ttiOpacityNum, startBtn);


function applyTTIUIToWorld() {
  const enabled = ttiToggle.checked;
  const hex = normalizeHex(ttiHex.value);
  const op = clamp255(ttiOpacityNum.value);

  // persist
  localStorage.setItem("ttiEnabled", enabled ? "1" : "0");
  localStorage.setItem("ttiColor", hex);
  localStorage.setItem("ttiOpacity255", String(op));

  // apply to tornadoes-owned indicator
  tornadoes.setTornadoesTileIndicatorStyle({
    enabled,
    color: hex,
    opacity255: op,
  });

  // Optional: force a sync immediately (usually tornadoes update does it each tick anyway)
  tornadoes.syncTornadoesTileIndicator();
}

ttiToggle.addEventListener("change", applyTTIUIToWorld);

ttiColor.addEventListener("input", () => {
  ttiHex.value = ttiColor.value.toUpperCase();
  applyTTIUIToWorld();
});

ttiHex.addEventListener("change", () => {
  const hex = normalizeHex(ttiHex.value);
  ttiHex.value = hex;
  ttiColor.value = hex;
  applyTTIUIToWorld();
});

ttiOpacity.addEventListener("input", () => {
  ttiOpacityNum.value = ttiOpacity.value;
  applyTTIUIToWorld();
});

ttiOpacityNum.addEventListener("change", () => {
  const op = clamp255(ttiOpacityNum.value);
  ttiOpacityNum.value = String(op);
  ttiOpacity.value = String(op);
  applyTTIUIToWorld();
});


// ===== Utility: world to screen coords =====
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

// ===== Speed control =====
function applySpeedPercent(pct) {
  const p = Math.min(100, Math.max(25, Number(pct) || 100));

  speedSlider.value = String(p);
  speedInput.value = String(p);
  speedValue.textContent = `${p}%`;
  localStorage.setItem("simSpeedPct", String(p));

  // 600ms base tick at 100%
  const tickMs = 600 / (p / 100);
  const tickSec = tickMs / 1000;

  // Update tick engine + visual glides
  ticker.setSpeedPercent(p);
  player.setTickSeconds(tickSec);
  tornadoes.setTickSeconds(tickSec);
}


// Real HP state (replaces playerHP)
let maxHP = Number(hpInput.value);
let currentHP = maxHP;
let godMode = godToggle.checked;

godToggle.addEventListener("change", () => {
  godMode = godToggle.checked;
  localStorage.setItem("godMode", godMode ? "1" : "0");
});


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

// ===== Hit pipeline (ALL damage should go through applyHit) =====
const HitSource = Object.freeze({
  FLOOR: "FLOOR",
  TORNADO: "TORNADO",
  BOSS: "BOSS",
});

const HitStyle = Object.freeze({
  RANGE: "RANGE",
  MAGE: "MAGE",
  MELEE: "MELEE",
  TYPELESS: "TYPELESS",
});

/**
 * Mitigation rules live here (player prayers now, boss prayers later).
 * Return a NUMBER (damage amount AFTER mitigation), not a new hit object.
 */
function mitigateHit(hit) {
  let dmg = hit.amount;

  // Only boss standard attacks are affected by protection prayers (for now)
  const isBossAttack = hit.source === HitSource.BOSS;
  const isProtectableStyle = hit.style === HitStyle.RANGE || hit.style === HitStyle.MAGE;

  if (isBossAttack && isProtectableStyle) {
    const prayedCorrectly =
      (hit.style === HitStyle.RANGE && playerPrayer === Prayer.RANGE) ||
      (hit.style === HitStyle.MAGE && playerPrayer === Prayer.MAGE);

    if (prayedCorrectly) {
      dmg = Math.round(dmg * PROTECT_PRAYER_MULT);
    }
  }

  // Safety clamp
  if (!Number.isFinite(dmg)) return 0;
  return Math.max(0, dmg);
}


/**
 * Unified damage entry point.
 * All systems (danger floor, tornadoes, boss, etc.) should call THIS.
 */
function applyHit(hit) {
  if (!hit) return;

  const source = hit.source ?? "UNKNOWN";
  const style = hit.style ?? HitStyle.TYPELESS;

  const rawAmount = Number(hit.amount);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) return;

  // Allow mitigation logic to clamp/modify damage (prayers come here later)
  const mitigated = Math.max(0, Math.floor(mitigateHit({ ...hit, amount: rawAmount })));

  // Still count 0-damage hits in logs if you want later; for now we just no-op
  if (mitigated <= 0) return;

  currentHP -= mitigated;
  if (currentHP < 0) currentHP = 0;

  // Accumulate for a single hit splat at end of tick
  pendingDamageThisTick += mitigated;

  console.log(`[HIT] ${source}/${style}: -${mitigated} HP (now ${currentHP}/${maxHP})`);
  updateHealthUI();

  if (currentHP <= 0) {
    if (godMode) {
      console.log("God mode: lethal damage prevented, refilling HP");
      currentHP = maxHP;
      updateHealthUI();
      // IMPORTANT: do NOT reset, do NOT return early
    } else {
      console.log("Player died (HP <= 0). Resetting...");
      reset();
    }
  }
}


statusEl.textContent = "Lobby"; // <-- moved here (after statusEl exists)

speedSlider.addEventListener("input", () => applySpeedPercent(speedSlider.value));
speedInput.addEventListener("change", () => applySpeedPercent(speedInput.value));

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

// ===== Player Tile Indicator settings (persisted) =====
const storedPTIEnabled = localStorage.getItem("ptiEnabled");
const storedPTIColor = localStorage.getItem("ptiColor") || "#FFB03F";
const storedPTIOpacity = Number(localStorage.getItem("ptiOpacity255") || "160");

// ===== Player Tile Indicator instance (owned by player) =====
player.createPlayerTileIndicator({
  enabled: (localStorage.getItem("ptiEnabled") ?? "1") === "1",
  color: localStorage.getItem("ptiColor") || "#FFB03F",
  opacity255: Number(localStorage.getItem("ptiOpacity255") || "160"),
});

// ===== Boss =====
const boss = createBoss(THREE, {
  scene,
  startX: 9,
  startY: 9,

  onAttack: ({ style, amount }) => {
    // style is "RANGE" or "MAGE"
    applyHit({
      source: HitSource.BOSS,
      style: style,  // matches your HitStyle strings ("RANGE"/"MAGE")
      amount,
      countsTowardBossSwap: true,
    });
  },
});


// ===== Targeting (target + ring + click-to-set) =====
const targeting = createTargeting(THREE, {
  scene,
  canvas,
  targetEl,
  pickTileFromMouse: arena.pickTileFromMouse,
});

// ===== Danger Floor =====
const dangerFloor = createDangerFloor(THREE, {
  scene,
  gridW: GRID_W,
  gridH: GRID_H,
  getPlayerTile: () => ({ x: player.x, y: player.y }),
  onPlayerDamaged: (amount) => {
    applyHit({
      source: HitSource.FLOOR,
      style: HitStyle.TYPELESS,
      amount,
      countsTowardBossSwap: false,
    });
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
    applyHit({
      source: HitSource.TORNADO,
      style: HitStyle.TYPELESS,
      amount,
      countsTowardBossSwap: false,
    });
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



// ===== Tornado Tile Indicator instance (owned by tornadoes) =====
tornadoes.createTornadoesTileIndicator({
  enabled: (localStorage.getItem("ttiEnabled") ?? "1") === "1",
  color: localStorage.getItem("ttiColor") || "#00FF66",
  opacity255: Number(localStorage.getItem("ttiOpacity255") || "160"),
  // Optional: tweak these if you want:
  // y: 0.02,
  // inset: 0.03,
  maxTiles: 64,
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

// ===== Tick damage aggregation (hit splats) =====
let pendingDamageThisTick = 0;




function applyPTIUIToWorld() {
  const enabled = ptiToggle.checked;
  const hex = normalizeHex(ptiHex.value);
  const op = clamp255(ptiOpacityNum.value);

  // persist
  localStorage.setItem("ptiEnabled", enabled ? "1" : "0");
  localStorage.setItem("ptiColor", hex);
  localStorage.setItem("ptiOpacity255", String(op));

  // apply
  player.setTileIndicatorStyle({
    enabled,
    color: hex,
    opacity255: op,
  });
}

ptiToggle.addEventListener("change", applyPTIUIToWorld);

ptiColor.addEventListener("input", () => {
  ptiHex.value = ptiColor.value.toUpperCase();
  applyPTIUIToWorld();
});

ptiHex.addEventListener("change", () => {
  const hex = normalizeHex(ptiHex.value);
  ptiHex.value = hex;
  ptiColor.value = hex; // keep swatch synced if valid
  applyPTIUIToWorld();
});

ptiOpacity.addEventListener("input", () => {
  ptiOpacityNum.value = ptiOpacity.value;
  applyPTIUIToWorld();
});

ptiOpacityNum.addEventListener("change", () => {
  const op = clamp255(ptiOpacityNum.value);
  ptiOpacityNum.value = String(op);
  ptiOpacity.value = String(op);
  applyPTIUIToWorld();
});

// initial apply
applyPTIUIToWorld();

// Create ONE ticker instance for the whole app
const ticker = createTicker({
  baseTickMs: TICK_MS,
  onTick: () => {
    if (state !== GameState.FIGHT) return;

    tick++;
    tickEl.textContent = String(tick);

    player.stepToward(targeting.target, PLAYER_SPEED_TILES_PER_TICK, GRID_W, GRID_H);

    if (targeting.target && player.x === targeting.target.x && player.y === targeting.target.y) {
      targeting.clear();
    }

    // Sync player tile indicator to player position
    player.syncTileIndicator();

    // Danger floor: update + render once per fight tick
    dangerFloor.update(tick);
    dangerFloor.render();

    // Tornadoes: update once per fight tick
    tornadoes.update(tick);

    // Boss: update once per fight tick
    boss.update(tick);


    if (pendingDamageThisTick > 0) {
      spawnHitSplat({ value: pendingDamageThisTick, kind: "damage" });
      pendingDamageThisTick = 0;
    }

  },
});

function startFightLoop() {
  ticker.start();
  // Initial sync of player tile indicator
  
}


function stopFightLoop() {
  ticker.stop();
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

  boss.resetCombat();
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
  boss.resetCombat();

  // On reset, go back to full HP of the chosen start value
  maxHP = Math.min(99, Math.max(10, Number(hpInput.value || 99)));
  currentHP = maxHP;
  updateHealthUI();

  playerPrayer = Prayer.NONE;
  updatePrayerUI();

  pendingDamageThisTick = 0;
  hitSplatLayer.innerHTML = "";
  hitSplats.length = 0;

  targeting.clear();
  player.setPos(5, 5);
}
