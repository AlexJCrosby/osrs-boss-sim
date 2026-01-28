// inventory.js (ES module)
// ===== Inventory: Item defs + state =====
export const ITEM_DEFS = {
  STAFF: { id: "STAFF", name: "Staff", type: "WEAPON", stackable: false, icon: "🪄" },
  BOW: { id: "BOW", name: "Bow", type: "WEAPON", stackable: false, icon: "🏹" },
  PADDLEFISH: { id: "PADDLEFISH", name: "Paddlefish", type: "FOOD", stackable: false, heal: 20, icon: "🐟" },
};

export const inventory = {
  slots: new Array(28).fill(null),
};

function makeItemStack(id, qty = 1) {
  return { id, qty };
}

// ===== Core helpers =====
export function clearInventory() {
  inventory.slots.fill(null);
}

export function addItemToInventory(id, qty = 1) {
  const def = ITEM_DEFS[id];
  if (!def) return false;

  if (def.stackable) {
    const idx = inventory.slots.findIndex((s) => s && s.id === id);
    if (idx !== -1) {
      inventory.slots[idx].qty += qty;
      return true;
    }
  }

  for (let i = 0; i < qty; i++) {
    const emptyIdx = inventory.slots.findIndex((s) => s === null);
    if (emptyIdx === -1) return false;
    inventory.slots[emptyIdx] = makeItemStack(id, 1);
  }
  return true;
}

export function removeOneFromSlot(slotIndex) {
  const stack = inventory.slots[slotIndex];
  if (!stack) return false;

  if (stack.qty > 1) stack.qty -= 1;
  else inventory.slots[slotIndex] = null;

  return true;
}

// ===== Rendering =====
export function renderInventory(invGridEl) {
  if (!invGridEl) return;

  const slotEls = invGridEl.querySelectorAll(".inv-slot");
  if (slotEls.length !== 28) return; // main.js owns slot creation

  for (let i = 0; i < 28; i++) {
    const el = slotEls[i];
    const stack = inventory.slots[i];

    el.classList.toggle("filled", !!stack);

    if (!stack) {
      el.innerHTML = "";
      continue;
    }

        const def = ITEM_DEFS[stack.id];
    const icon = def?.icon ?? "📦";
    const name = def?.name ?? stack.id;

    // Tooltip text
    const tooltip =
      def?.type === "FOOD" && typeof def.heal === "number"
        ? `${name} +${def.heal} HP`
        : `${name}`;

    el.innerHTML = `
      <div class="inv-item" data-item="${stack.id}" title="${tooltip}">
        <div class="inv-item-icon">${icon}</div>
        ${stack.qty > 1 ? `<div class="inv-item-qty">${stack.qty}</div>` : ""}
      </div>
    `;
  }
}
