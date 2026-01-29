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
import { createProjectiles } from "./src/projectiles.js";
import {
  ITEM_DEFS,
  inventory,
  clearInventory,
  addItemToInventory,
  removeOneFromSlot,
  renderInventory
} from "./src/inventory.js";

//  Config 
const GRID_W = 12;
const GRID_H = 12;
const TICK_MS = 600;
const PLAYER_SPEED_TILES_PER_TICK = 2;

const GameState = Object.freeze({
  LOBBY: "LOBBY",
  FIGHT: "FIGHT",
});

let state = GameState.LOBBY;

//  DOM / HUD 
const canvas = document.getElementById("game");
const tickEl = document.getElementById("tick");
const startBtn = document.getElementById("startBtn");

//  Boss HP Bar 
const bossBar = document.createElement("div");
bossBar.className = "bossTopBar hidden";

const bossNameEl = document.createElement("div");
bossNameEl.className = "bossName";
bossNameEl.textContent = "Corrupted Hunllef";

const bossHpOuter = document.createElement("div");
bossHpOuter.className = "bossHpOuter";

const bossHpFill = document.createElement("div");
bossHpFill.className = "bossHpFill";

const bossHpText = document.createElement("div");
bossHpText.className = "bossHpText";
bossHpText.textContent = "1000 / 1000";

bossHpOuter.appendChild(bossHpFill);
bossHpOuter.appendChild(bossHpText);

bossBar.appendChild(bossNameEl);
bossBar.appendChild(bossHpOuter);

document.body.appendChild(bossBar);

function setBossBarVisible(isVisible) {
  bossBar.classList.toggle("hidden", !isVisible);
}

function updateBossBarUI() {
  const pct = bossMaxHP > 0 ? Math.max(0, bossHP / bossMaxHP) : 0;
  bossHpFill.style.width = `${pct * 100}%`;
  bossHpText.textContent = `${bossHP} / ${bossMaxHP}`;
}

// Sidebar containers
const settingsHealthEl = document.getElementById("settingsHealth");
const settingsAccessibilityEl = document.getElementById("settingsAccessibility");
const settingsIndicatorsEl = document.getElementById("settingsIndicators");
const settingsKeybindsEl = document.getElementById("settingsKeybinds");

//  Keybinds (persisted) 
function normalizeKeyForBind(k) {
  if (!k) return "";
  return String(k).toLowerCase();
}

const keybinds = {
  prayer: normalizeKeyForBind(localStorage.getItem("kb_openPrayer") || "3"),
  inventory: normalizeKeyForBind(localStorage.getItem("kb_openInventory") || "2"),
};

//  Sidebar helpers 
function addSettingRow(parent, labelText, controls) {
  const row = document.createElement("div");
  row.className = "settings-row";

  const label = document.createElement("div");
  label.className = "row-label";
  label.textContent = labelText;

  const ctrl = document.createElement("div");
  ctrl.className = "settings-controls";
  controls.forEach((el) => ctrl.appendChild(el));

  row.append(label, ctrl);
  parent.appendChild(row);
}

function setSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  if (settingsTabHandle) {
    settingsTabHandle.setAttribute("aria-expanded", open ? "true" : "false");
    settingsTabHandle.setAttribute("aria-label", open ? "Close settings" : "Open settings");
  }
  localStorage.setItem("settingsSidebarOpen", open ? "1" : "0");
}

if (settingsTabHandle) {
  const stored = localStorage.getItem("settingsSidebarOpen");
  setSidebarOpen(stored === "1");

  settingsTabHandle.addEventListener("click", () => {
    const isOpen = document.body.classList.contains("sidebar-open");
    setSidebarOpen(!isOpen);
  });
}

//  Player: equipment + action timers 
const playerAction = {
  equippedWeapon: null, // "STAFF" | "BOW" | null
  attackCd: 0,          // ticks until next attack can fire
  eatCd: 0,             // ticks until can eat again
};

//  Player combat control 
const playerCombat = {
  wantsToAttackBoss: false, // set when boss is clicked
  attackStalled: true,      // set true when player moves
  moveLockTicks: 0,         // 1 tick lock after attack fires
  weaponSpeed: 4,
};

//  Health UX controls (persisted) 
const hpLabel = document.createElement("span");
hpLabel.className = "hint";
hpLabel.textContent = "Start HP:";

const hpInput = document.createElement("input");
hpInput.type = "number";
hpInput.min = "10";
hpInput.max = "99";
hpInput.step = "1";
hpInput.style.width = "64px";

//  Start fish (persisted) 
const fishInput = document.createElement("input");
fishInput.type = "number";
fishInput.min = "0";
fishInput.max = "26";
fishInput.step = "1";
fishInput.style.width = "64px";

const storedStartFish = Number(localStorage.getItem("startFish") || "10");
fishInput.value = String(Math.min(26, Math.max(0, storedStartFish)));

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

// Load persisted (default 10)
fishInput.value = String(Math.min(26, Math.max(0, storedStartFish)));

fishInput.addEventListener("change", () => {
  const v = Math.min(26, Math.max(0, Number(fishInput.value || 0)));
  fishInput.value = String(v);
  localStorage.setItem("startFish", String(v));

  // Live update inventory while NOT in a fight
  if (state !== GameState.FIGHT) {
    seedStarterInventoryFromSettings();
  }
});

// Inject controls into the LEFT sidebar
if (settingsHealthEl) {
  addSettingRow(settingsHealthEl, "Start HP", [hpInput]);
  addSettingRow(settingsHealthEl, "Start fish", [fishInput]);
  addSettingRow(settingsHealthEl, "Show HP bar", [showBarToggle]);
}

hpInput.addEventListener("change", () => {
  const v = Math.min(99, Math.max(10, Number(hpInput.value || 99)));
  hpInput.value = String(v);
  localStorage.setItem("startHP", String(v));
});

showBarToggle.addEventListener("change", () => {
  localStorage.setItem("showHPBar", showBarToggle.checked ? "1" : "0");
  updateHealthUI(); 
});

//  Boss click detection (intercepts BEFORE targeting.js mousedown) 
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();

function setMouseFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

// Boss click handler
canvas.addEventListener(
  "mousedown",
  (e) => {
    if (e.button !== 0) return; // left click only
    if (state !== GameState.FIGHT) return;

    setMouseFromEvent(e);
    raycaster.setFromCamera(mouseNDC, camera);

    const hits = raycaster.intersectObject(boss.mesh, false);
    if (hits.length === 0) return;

    // Boss was clicked -> treat as attack attempt ONLY (no movement target)
    e.preventDefault();
    e.stopImmediatePropagation(); // stops targeting.js mousedown from running
    e.stopPropagation();

    onBossClicked();
  },
  true
);

//  Health UI (orb + optional HP bar) 
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

//  Hit splats 
const hitSplatLayer = document.createElement("div");
hitSplatLayer.className = "hitSplatLayer";
document.body.appendChild(hitSplatLayer);

//  Overhead prayer indicators (DOM overlay) 
function makePrayerOverheadEl(id) {
  const el = document.createElement("div");
  el.className = "overheadPrayer hidden";
  el.id = id;

  const inner = document.createElement("div");
  inner.className = "overheadPrayerInner";
  el.appendChild(inner);

  document.body.appendChild(el);
  return el;
}

const playerPrayerOverhead = makePrayerOverheadEl("playerPrayerOverhead");
const bossPrayerOverhead = makePrayerOverheadEl("bossPrayerOverhead");

function prayerLabel(pr) {
  if (pr === Prayer.RANGE) return "🏹";
  if (pr === Prayer.MAGE) return "🔥";
  return "";
}


function setOverheadText(el, txt) {
  const inner = el.querySelector(".overheadPrayerInner");
  if (inner) inner.textContent = txt;
}

//  Player prayer state 
const Prayer = Object.freeze({
  NONE: "NONE",
  RANGE: "RANGE",
  MAGE: "MAGE",
});

//  3D Prayer Sprites (stable during camera pans) 
function makePrayerSpriteTexture(THREE, emoji) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;

  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);

  // background square
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, 64, 64);

  // subtle border
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 62, 62);

  // emoji
  ctx.font = "44px system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 32, 34);

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makePrayerSprite(THREE, texture) {
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,  
    depthWrite: false,
  });

  const spr = new THREE.Sprite(mat);
  spr.renderOrder = 999;
  spr.scale.set(0.9, 0.9, 1); // size in world units
  return spr;
}

function setSpriteConstantScreenSize(sprite, camera, desiredPx, canvas) {
  if (!sprite) return;

  const dist = camera.position.distanceTo(sprite.position);

  const vFovRad = (camera.fov * Math.PI) / 180;
  const viewHeightWorld = 2 * Math.tan(vFovRad / 2) * dist;

  const pxToWorld = viewHeightWorld / canvas.clientHeight;
  const sizeWorld = desiredPx * pxToWorld;

  sprite.scale.set(sizeWorld, sizeWorld, 1);
}

// Will be created after THREE/scene exist:
let playerPrayerSprite = null;
let bossPrayerSprite = null;
let prayerTexRange = null;
let prayerTexMage = null;

function setSpritePrayer(sprite, pr) {
  if (!sprite) return;
  if (pr === Prayer.MAGE) sprite.material.map = prayerTexMage;
  else if (pr === Prayer.RANGE) sprite.material.map = prayerTexRange;
  else sprite.material.map = null;

  sprite.visible = !!sprite.material.map;
  sprite.material.needsUpdate = true;
}

let playerPrayer = Prayer.NONE;

//  Side panel tabs (Prayer / Inventory) 
const tabPrayerBtn = document.getElementById("tabPrayer");
const tabInventoryBtn = document.getElementById("tabInventory");
const prayerTabEl = document.getElementById("prayerTab");
const inventoryTabEl = document.getElementById("inventoryTab");

function setActiveSideTab(tabName) {
  const isPrayer = tabName === "prayer";

  // Views
  if (prayerTabEl) prayerTabEl.classList.toggle("is-hidden", !isPrayer);
  if (inventoryTabEl) inventoryTabEl.classList.toggle("is-hidden", isPrayer);

  // Buttons
  if (tabPrayerBtn) {
    tabPrayerBtn.classList.toggle("active", isPrayer);
    tabPrayerBtn.setAttribute("aria-selected", String(isPrayer));
  }
  if (tabInventoryBtn) {
    tabInventoryBtn.classList.toggle("active", !isPrayer);
    tabInventoryBtn.setAttribute("aria-selected", String(!isPrayer));
  }
}

//  Global keybind handling for side tabs 
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;

  // Don't trigger while typing in inputs/textareas
  const t = e.target;
  const typing =
    t &&
    (t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.isContentEditable);

  if (typing) return;

  const k = normalizeKeyForBind(e.key);

  if (k === keybinds.inventory) {
    setActiveSideTab("inventory");
    e.preventDefault();
  } else if (k === keybinds.prayer) {
    setActiveSideTab("prayer");
    e.preventDefault();
  }
});

// Click handlers
if (tabPrayerBtn) tabPrayerBtn.addEventListener("click", () => setActiveSideTab("prayer"));
if (tabInventoryBtn) tabInventoryBtn.addEventListener("click", () => setActiveSideTab("inventory"));

// Default tab viewed on load
setActiveSideTab("prayer");

//  Inventory grid placeholders (28 slots) 
const invGridEl = document.getElementById("invGrid");

if (invGridEl) {
  invGridEl.innerHTML = "";
  for (let i = 0; i < 28; i++) {
    const slot = document.createElement("div");
    slot.className = "inv-slot";
    slot.dataset.index = String(i);
    invGridEl.appendChild(slot);
  }
}

function seedStarterInventoryFromSettings() {
  if (!invGridEl) return;

  const fishCount = Math.min(26, Math.max(0, Number(fishInput?.value || 10)));

  clearInventory();

  // Only add weapons that are NOT currently equipped
  if (playerAction.equippedWeapon !== "STAFF") addItemToInventory("STAFF", 1);
  if (playerAction.equippedWeapon !== "BOW") addItemToInventory("BOW", 1);

  addItemToInventory("PADDLEFISH", fishCount);

  renderInventory(invGridEl);
}


//  Inventory: seed + first render 
if (invGridEl) {
  seedStarterInventoryFromSettings();
}

//  Inventory: click -> equip/eat 
if (invGridEl) {
  invGridEl.addEventListener("click", (e) => {
    const slotEl = e.target.closest(".inv-slot");
    if (!slotEl) return;

    const idx = Number(slotEl.dataset.index);
    const stack = inventory.slots[idx];
    if (!stack) return;

    const def = ITEM_DEFS[stack.id];
    if (!def) return;

    // Equip weapon (weapons removed while equipped)
    if (def.type === "WEAPON") {
      const clickedWeapon = stack.id;

      if (!playerAction.equippedWeapon) {
        playerAction.equippedWeapon = clickedWeapon;
        inventory.slots[idx] = null;
        cancelPlayerAttack("equipped weapon");
        renderInventory(invGridEl);
        return;
      }

      const currentlyEquipped = playerAction.equippedWeapon;

      if (currentlyEquipped !== clickedWeapon) {
        playerAction.equippedWeapon = clickedWeapon;
        inventory.slots[idx] = { id: currentlyEquipped, qty: 1 };
        cancelPlayerAttack("swapped weapon");
        renderInventory(invGridEl);
        return;
      }
    }
    // Eat food
    if (def.type === "FOOD") {
      // 1) eat cooldown: once every 3 ticks
      if (playerAction.eatCd > 0) {
        return;
      }

      // 2) consume item
      const removed = removeOneFromSlot(idx);
      if (!removed) return;

      // 3) heal player
      if (typeof currentHP === "number" && typeof maxHP === "number") {
        currentHP = Math.min(maxHP, currentHP + (def.heal ?? 0));
        if (typeof updateHealthUI === "function") updateHealthUI();
      } else {
        console.warn("Hook up heal: currentHP/maxHP/updateHealthUI not found in this scope.");
      }

      // 4) timers: eat cd + attack delay
      playerAction.eatCd = 3;
      playerAction.attackCd += 3; // adds 3 ticks on top of whatever is left
      cancelPlayerAttack("ate food");
      
      // 5) re-render inventory
      renderInventory(invGridEl);

      return;
    }
  });
}

//  Inventory: reset helper 
    function resetInventoryToStarter() {
      if (!invGridEl) return;

      // Reset equipment + timers
      playerAction.attackCd = 0;
      playerAction.eatCd = 0;

      seedStarterInventoryFromSettings();
    }

//  Prayer UI 
const prayRangeBtn = document.getElementById("prayRange");
const prayMageBtn = document.getElementById("prayMage");

function setPlayerPrayer(next) {
  // Toggle behaviour
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

// Player protection prayers mitigate by 75% => take 25% damage
const PROTECT_PRAYER_MULT = 0.25;

// SVG splat background
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
const SPLAT_BLUE_BG = splatSvgDataUri("#1a52d6", "#0b1b4a");

//  God mode (training mode) 
const godToggle = document.createElement("input");
godToggle.type = "checkbox";

// Load persisted value
const storedGodMode = localStorage.getItem("godMode");
godToggle.checked = storedGodMode === "1";

//  Slow-mo speed control (persisted) 
const speedSlider = document.createElement("input");
speedSlider.type = "range";
speedSlider.min = "25";
speedSlider.max = "100";
speedSlider.step = "5";

const speedInput = document.createElement("input");
speedInput.type = "number";
speedInput.min = "25";
speedInput.max = "100";
speedInput.step = "5";
speedInput.style.width = "64px";

const speedInputWrap = document.createElement("div");
speedInputWrap.className = "num-suffix";
speedInputWrap.appendChild(speedInput);

// Load persisted
const storedSpeed = Number(localStorage.getItem("simSpeedPct") || "100");
const startSpeed = Math.min(100, Math.max(25, storedSpeed));
speedSlider.value = String(startSpeed);
speedInput.value = String(startSpeed);


//  Inject into LEFT sidebar
if (settingsAccessibilityEl) {
  addSettingRow(settingsAccessibilityEl, "God mode", [godToggle]);
  addSettingRow(settingsAccessibilityEl, "Speed", [speedSlider, speedInputWrap]);
}

//  Keybind inputs
const kbPrayer = document.createElement("input");
kbPrayer.type = "text";
kbPrayer.maxLength = 16;
kbPrayer.value = keybinds.prayer;
kbPrayer.style.width = "96px";

const kbInventory = document.createElement("input");
kbInventory.type = "text";
kbInventory.maxLength = 16;
kbInventory.value = keybinds.inventory;
kbInventory.style.width = "96px";

function bindKeyInput(inputEl, which) {
  inputEl.addEventListener("keydown", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const k = normalizeKeyForBind(e.key);
    if (!k) return;

    if (k === "shift" || k === "control" || k === "alt" || k === "meta") return;

    keybinds[which] = k;
    inputEl.value = k;

    if (which === "prayer") localStorage.setItem("kb_openPrayer", k);
    if (which === "inventory") localStorage.setItem("kb_openInventory", k);

    inputEl.blur();
  });
}

bindKeyInput(kbPrayer, "prayer");
bindKeyInput(kbInventory, "inventory");

if (settingsKeybindsEl) {
  addSettingRow(settingsKeybindsEl, "Prayer tab", [kbPrayer]);
  addSettingRow(settingsKeybindsEl, "Inventory tab", [kbInventory]);
}


//  HUD helpers 
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


//  Player Tile Indicator UI 
const ptiToggle = document.createElement("input");
ptiToggle.type = "checkbox";
ptiToggle.checked = (localStorage.getItem("ptiEnabled") ?? "1") === "1";

const ptiColor = document.createElement("input");
ptiColor.type = "color";
ptiColor.value = localStorage.getItem("ptiColor") || "#FFB03F";

const ptiHex = document.createElement("input");
ptiHex.type = "text";
ptiHex.value = ptiColor.value.toUpperCase();
ptiHex.style.width = "90px";
ptiHex.placeholder = "#RRGGBB";

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

if (settingsIndicatorsEl) {
  addSettingRow(settingsIndicatorsEl, "Player tile", [ptiToggle, ptiColor, ptiHex, ptiOpacity, ptiOpacityNum]);
}

// !!!  Tornado Tile Indicator UI  !!! 
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

// Inject Tornado row AFTER TTI controls exist
if (settingsIndicatorsEl) {
  addSettingRow(settingsIndicatorsEl, "Tornado tiles", [ttiToggle, ttiColor, ttiHex, ttiOpacity, ttiOpacityNum]);
}

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

  // Optional: force a sync immediately
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


//  Utility: world to screen coords 
function worldToScreen(x, y, z, camera, canvas) {
  const v = new THREE.Vector3(x, y, z);
  v.project(camera);
  const rect = canvas.getBoundingClientRect();
  const sx = (v.x * 0.5 + 0.5) * rect.width + rect.left;
  const sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
  return { x: sx, y: sy, onScreen: v.z > -1 && v.z < 1 };
}


//  Overhead prayer smoothing (prevents jitter during camera pan) 
const overheadSmooth = {
  player: { x: null, y: null },
  boss: { x: null, y: null },
};

function setOverheadTransform(el, smoothState, targetX, targetY) {
  const dpr = window.devicePixelRatio || 1;
  const tx = Math.round(targetX * dpr) / dpr;
  const ty = Math.round(targetY * dpr) / dpr;

  if (smoothState.x == null || smoothState.y == null) {
    smoothState.x = tx;
    smoothState.y = ty;
  }

  const dx = tx - smoothState.x;
  const dy = ty - smoothState.y;

  const DEADZONE_PX = 1.0;   // ignore tiny jitters
  const FOLLOW = 1;        // minimal lag

  if (Math.abs(dx) > DEADZONE_PX) smoothState.x += dx * FOLLOW;
  else smoothState.x = tx;

  if (Math.abs(dy) > DEADZONE_PX) smoothState.y += dy * FOLLOW;
  else smoothState.y = ty;

  smoothState.x = Math.round(smoothState.x * dpr) / dpr;
  smoothState.y = Math.round(smoothState.y * dpr) / dpr;

  el.style.transform = `translate3d(${smoothState.x}px, ${smoothState.y}px, 0) translate(-50%, -100%)`;
}

// Active splats
const hitSplats = [];

//  Hit splats: per-frame update 
function updateHitSplats(dt) {
  for (let i = hitSplats.length - 1; i >= 0; i--) {
    const s = hitSplats[i];
    s.age += dt;

    const t = Math.min(1, s.age / s.life);
    const alpha = 1 - t;

    // Convert world anchor -> screen coords
    const screen = worldToScreen(
      s.anchor.wx,
      s.anchor.wy,
      s.anchor.wz,
      camera,
      canvas
    );

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

/**
 * Spawn a hitsplat at a specific world anchor.
 * anchorWorld: { wx, wy, wz } in world units
 * kind: "damage" | "splash"
 */
function spawnHitSplatAt({ value, kind = "damage", anchorWorld }) {
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

  hitSplats.push({
    el,
    anchor: {
      wx: anchorWorld.wx,
      wy: anchorWorld.wy,
      wz: anchorWorld.wz,
    },
    age: 0,
    life: 0.75,
    risePx: 28,
  });
}

/**
 * Backwards-compatible helper: spawn above player (existing behaviour)
 */
function spawnHitSplat({ value, kind = "damage" }) {
  const anchor = {
    wx: player.renderX + 0.5,
    wy: 1.35,
    wz: player.renderY + 0.5,
  };
  spawnHitSplatAt({ value, kind, anchorWorld: anchor });
}

/**
 * Boss helper: spawn above boss mesh
 */
function spawnBossHitSplat({ value, kind = "damage" }) {
  // getWorldPosition() returns WORLD space, which matches worldToScreen().
  const wp = new THREE.Vector3();
  boss.mesh.getWorldPosition(wp);

  const anchor = { wx: wp.x, wy: wp.y + 0.8, wz: wp.z }; // bump height as needed
  spawnHitSplatAt({ value, kind, anchorWorld: anchor });
}


//  Speed control 
function applySpeedPercent(pct) {
  const p = Math.min(100, Math.max(25, Number(pct) || 100));

  speedSlider.value = String(p);
  speedInput.value = String(p);
  localStorage.setItem("simSpeedPct", String(p));

  // 600ms base tick at 100%
  const tickMs = 600 / (p / 100);
  const tickSec = tickMs / 1000;

  // Update tick engine + visual glides
  ticker.setSpeedPercent(p);
  player.setTickSeconds(tickSec);
  tornadoes.setTickSeconds(tickSec);
}

// Real HP state
let maxHP = Number(hpInput.value);
let currentHP = maxHP;
let godMode = godToggle.checked;

//  Boss HP 
let bossMaxHP = 1000;
let bossHP = bossMaxHP;

function resetBossHP() {
  bossMaxHP = 1000;
  bossHP = bossMaxHP;
  updateBossBarUI();

}

function applyBossHit({ amount, style }) {
  const raw = Number(amount);
  if (!Number.isFinite(raw)) return;

  const dmgRolled = Math.max(0, Math.floor(raw)); 
  const bossPray = boss.getProtectionPrayer?.();

  // Boss protection prayer: 100% mitigation if matched
  const isProtectable = (style === HitStyle.RANGE || style === HitStyle.MAGE || style === "RANGE" || style === "MAGE");
  const styleNorm = (style === HitStyle.MAGE) ? "MAGE" : (style === HitStyle.RANGE ? "RANGE" : style);

  let finalDmg = dmgRolled;
  if (isProtectable && (bossPray === styleNorm)) {
    finalDmg = 0;
  }

  if (finalDmg > 0) {
    bossHP = Math.max(0, bossHP - finalDmg);
  }

  updateBossBarUI();
  spawnBossHitSplat({ value: finalDmg, kind: finalDmg === 0 ? "splash" : "damage" });

}

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

  // Toggle bar visibility
  hpBar.style.display = showBarToggle.checked ? "block" : "none";
}
updateHealthUI();

//  Hit pipeline through applyhit()
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
 * Mitigation rules live here
 * Return a NUMBER (damage amount AFTER mitigation), not a new hit object.
 */
function mitigateHit(hit) {
  let dmg = hit.amount;

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
 * damage entry point.
 */
function applyHit(hit) {
  if (!hit) return;

  const source = hit.source ?? "UNKNOWN";
  const style = hit.style ?? HitStyle.TYPELESS;

  const rawAmount = Number(hit.amount);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) return;

  // Allow mitigation logic to clamp/modify damage
  const mitigated = Math.max(0, Math.floor(mitigateHit({ ...hit, amount: rawAmount })));

  if (mitigated <= 0) return;

  currentHP -= mitigated;
  if (currentHP < 0) currentHP = 0;

  // Accumulate for a single hit splat at end of tick
  pendingDamageThisTick += mitigated;

  updateHealthUI();

  if (currentHP <= 0) {
    if (godMode) {
      currentHP = maxHP;
      updateHealthUI();
    } else {
      reset();
    }
  }
}

speedSlider.addEventListener("input", () => applySpeedPercent(speedSlider.value));
speedInput.addEventListener("change", () => applySpeedPercent(speedInput.value));

document.getElementById("resetBtn").addEventListener("click", reset);
startBtn.addEventListener("click", startFight);

// Prevent right-click menu
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// Renderer / Scene / Camera 
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1115);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(10, 20, 10);
scene.add(dir);

// Arena
const arena = createArena(THREE, {
  scene,
  canvas,
  camera,
  gridW: GRID_W,
  gridH: GRID_H,
});

// Player 
const player = createPlayer(THREE, {
  scene,
  startX: 5,
  startY: 5,
});

//  Projectiles 
const projectiles = createProjectiles(THREE, { scene });

//  Player Tile Indicator instance (owned by player) 
player.createPlayerTileIndicator({
  enabled: (localStorage.getItem("ptiEnabled") ?? "1") === "1",
  color: localStorage.getItem("ptiColor") || "#FFB03F",
  opacity255: Number(localStorage.getItem("ptiOpacity255") || "160"),
});

function bossWorldCenter() {
  return new THREE.Vector3(boss.x, 0, boss.y);
}


function playerWorldCenter() {

  const x = (player.x ?? 0);
  const y = (player.y ?? 0);

  return new THREE.Vector3(x, 0, y);
}

function handleBossAttack({ style, amount }) {
  if (player == null) return;
  // Spawn projectile
  projectiles.spawnBossProjectile({
    style,
    from: bossWorldCenter().add(new THREE.Vector3(0, 0.8, 0)),  // lift a bit
    to: playerWorldCenter().add(new THREE.Vector3(0, 0.5, 0)), // aim at torso-ish
  });

  // Apply damage through the hit pipeline
  applyHit({
    source: HitSource.BOSS,
    style: style, // "RANGE"/"MAGE" matches your HitStyle strings
    amount,
    countsTowardBossSwap: true,
  });
}


//  Boss 
const boss = createBoss(THREE, {
  scene,
  startX: 9,
  startY: 9,
  onAttack: handleBossAttack,
});

//  Create prayer sprite textures + sprites 
prayerTexRange = makePrayerSpriteTexture(THREE, "🏹");
prayerTexMage  = makePrayerSpriteTexture(THREE, "🔥");

playerPrayerSprite = makePrayerSprite(THREE, prayerTexRange);
bossPrayerSprite   = makePrayerSprite(THREE, prayerTexRange);

scene.add(playerPrayerSprite);
scene.add(bossPrayerSprite);

// initial state
setSpritePrayer(playerPrayerSprite, playerPrayer);
setSpritePrayer(bossPrayerSprite, boss.getProtectionPrayer?.() === "MAGE" ? Prayer.MAGE : Prayer.RANGE);


//  Targeting (target + ring + click-to-set) 
const targeting = createTargeting(THREE, {
  scene,
  canvas,
  targetEl: null, // Target display removed from UI
  pickTileFromMouse: arena.pickTileFromMouse,
});

//  Danger Floor 
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

//  Tornadoes 
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



//  Tornado Tile Indicator instance (owned by tornadoes) 
tornadoes.createTornadoesTileIndicator({
  enabled: (localStorage.getItem("ttiEnabled") ?? "1") === "1",
  color: localStorage.getItem("ttiColor") || "#00FF66",
  opacity255: Number(localStorage.getItem("ttiOpacity255") || "160"),
  // Optional: tweak these if you want:
  // y: 0.02,
  // inset: 0.03,
  maxTiles: 64,
});

//  Camera controller 
const cameraCtl = createOrbitCameraController(THREE, {
  canvas,
  camera,
  getFocus: () => ({ x: player.renderX, y: player.renderY }),
});

// Register wheel once (not per-frame)
cameraCtl.attachZoomWheel();

//  Tick loop (movement) 
let tick = 0;

//  Tick damage aggregation (hit splats) 
let pendingDamageThisTick = 0;

function cancelPlayerAttack() {
  if (playerCombat.wantsToAttackBoss) {
  }
  playerCombat.wantsToAttackBoss = false;
  playerCombat.attackStalled = true;
}

function onBossClicked() {
  // Clicking boss = explicit re-arm to attack
  targeting.clear(); // stops movement
  playerCombat.wantsToAttackBoss = true;
  playerCombat.attackStalled = false;
}

//  Ground click cancels attacking (but boss-click does NOT reach here because it stops propagation) 
canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (state !== GameState.FIGHT) return;

  // If not a boss click (boss click listener stops propagation) -> treat it as movement intent.
  cancelPlayerAttack("ground click / movement intent");
});

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

    //  Player action timers: tick down 
    playerAction.attackCd = Math.max(0, playerAction.attackCd - 1);
    playerAction.eatCd = Math.max(0, playerAction.eatCd - 1);

    //  Movement 
    const prevX = player.x;
    const prevY = player.y;

    player.stepToward(targeting.target, PLAYER_SPEED_TILES_PER_TICK, GRID_W, GRID_H);

    const movedThisTick = (player.x !== prevX) || (player.y !== prevY);
    if (movedThisTick) {
      // Any movement cancels attacking and prevents auto-resume
      cancelPlayerAttack("moved this tick");
    }

    // Clear targeting once we arrive
    if (targeting.target && player.x === targeting.target.x && player.y === targeting.target.y) {
      targeting.clear();
    }

    // Sync player tile indicator to player position
    player.syncTileIndicator();

    //  Environment systems 
    dangerFloor.update(tick);
    dangerFloor.render();

    tornadoes.update(tick);

    // Boss: update once per fight tick
    boss.update(tick);

    //  Player attacks boss 
    if (playerCombat.wantsToAttackBoss) {
      // If player is currently pathing / has a movement intent, do not attack
      if (targeting.target) {
        // Do nothing this tick
      } else {
        const weapon = playerAction.equippedWeapon; // "STAFF" | "BOW" | null
        const canAttack =
          (playerAction.attackCd === 0) &&
          (weapon === "STAFF" || weapon === "BOW");

        if (canAttack) {
          // const style = (weapon === "STAFF") ? "MAGE" : "RANGE";

          // Simple range check - set to 15 at the moment. Can be reduced later if desired.
          const px = player.x + 0.5;
          const pz = player.y + 0.5;
          const bx = boss.mesh.position.x;
          const bz = boss.mesh.position.z;

          const dx = Math.abs(px - bx);
          const dz = Math.abs(pz - bz);
          const dist = Math.max(dx, dz);

          const MAX_ATTACK_RANGE = 15;

          if (dist <= MAX_ATTACK_RANGE) {
            const style = (weapon === "STAFF") ? "MAGE" : "RANGE";

            const maxHit = 25;
            const dmg = Math.floor(Math.random() * (maxHit + 1)); // 0..maxHit

            // Notify boss about the player's attack attempt (counts off-prayer even if dmg is 0)
            boss.notifyPlayerAttack?.({ style });

            // Apply boss hit (boss prayer can force this to 0)
            applyBossHit({ amount: dmg, style });

            // Put the weapon on cooldown
            playerAction.attackCd = playerCombat.weaponSpeed;

          }
        }
      }
    }

    //  Player damage hitsplat 
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

//  Resize + render loop 
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
  projectiles.updateVisual(dt);
  cameraCtl.update(dt);
  updateHitSplats(dt);

    //  Update prayer sprites (stable in 3D) 
    // Player
    if (playerPrayerSprite) {
      playerPrayerSprite.position.set(player.renderX + 0.5, 1.55, player.renderY + 0.5);
      setSpritePrayer(playerPrayerSprite, playerPrayer);
      setSpriteConstantScreenSize(playerPrayerSprite, camera, 36, renderer.domElement);
    }

    // Boss
    if (bossPrayerSprite && boss?.mesh) {
      const wp = new THREE.Vector3();
      boss.mesh.getWorldPosition(wp);
      bossPrayerSprite.position.set(wp.x, wp.y + 1.65, wp.z);
      setSpriteConstantScreenSize(bossPrayerSprite, camera, 36, renderer.domElement);
      const bossPr = boss.getProtectionPrayer?.() || "RANGE";
      setSpritePrayer(bossPrayerSprite, bossPr === "MAGE" ? Prayer.MAGE : Prayer.RANGE);
    }


  renderer.render(scene, camera);
  
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

//  Game State 
function startFight() {
  resetBossHP();
  resetInventoryToStarter();
  targeting.clear();

  tick = 0;

  setBossBarVisible(true);
  updateBossBarUI();
  boss.resetCombat();
  dangerFloor.reset();
  tornadoes.reset();
  projectiles.reset();


  maxHP = Math.min(99, Math.max(10, Number(hpInput.value || 99)));
  currentHP = maxHP;
  updateHealthUI();

  pendingDamageThisTick = 0;
  hitSplatLayer.innerHTML = "";
  hitSplats.length = 0;

  tickEl.textContent = "0";

  player.setPos(5, 5);

  state = GameState.FIGHT;

  startFightLoop();
}


//  Reset 
function reset() {
  stopFightLoop();

  state = GameState.LOBBY;

  tick = 0;
  tickEl.textContent = "0";
  dangerFloor.reset();
  tornadoes.reset();
  boss.resetCombat();
  projectiles.reset();
  resetBossHP();
  setBossBarVisible(false);
  boss.resetProtectionPrayer?.();



  // On reset, go back to full HP of the chosen start value
  maxHP = Math.min(99, Math.max(10, Number(hpInput.value || 99)));
  currentHP = maxHP;
  updateHealthUI();

  playerPrayer = Prayer.NONE;
  updatePrayerUI();

  resetInventoryToStarter();

  pendingDamageThisTick = 0;
  hitSplatLayer.innerHTML = "";
  hitSplats.length = 0;

  targeting.clear();
  player.setPos(5, 5);
}
