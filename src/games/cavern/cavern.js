const TILE = 24;
const WORLD_COLS = 190;
const WORLD_ROWS = 78;
const GRAVITY = 0.78;
const MOVE_ACCEL = 0.85;
const FRICTION = 0.78;
const MAX_SPEED = 5.1;
const JUMP_SPEED = -12.4;
const REACH = 5.8;

const AIR = 0;
const GRASS = 1;
const DIRT = 2;
const STONE = 3;
const ORE = 4;
const WOOD = 5;
const LEAF = 6;
const TORCH = 7;
const CRYSTAL = 8;
const PICKAXE = 9;
const AXE = 10;
const SWORD = 11;
const GEM = 12;
const CHEST = 13;

const BIOMES = {
  MEADOW: "Meadow",
  FOREST: "Forest",
  CAVERN: "Cavern",
  DEEP: "Deep"
};

const BLOCKS = {
  [GRASS]: { name: "Grass", color: "#49b85f", solid: true, collectible: DIRT },
  [DIRT]: { name: "Dirt", color: "#96613b", solid: true },
  [STONE]: { name: "Stone", color: "#777f91", solid: true },
  [ORE]: { name: "Ore", color: "#f1c64b", solid: true },
  [WOOD]: { name: "Wood", color: "#a86c39", solid: true },
  [LEAF]: { name: "Leaf", color: "#2f9f5f", solid: true },
  [TORCH]: { name: "Torch", color: "#ffb347", solid: false },
  [CRYSTAL]: { name: "Crystal", color: "#a78bfa", solid: true },
  [PICKAXE]: { name: "Pickaxe", color: "#c7d2fe", solid: false },
  [AXE]: { name: "Axe", color: "#fbbf24", solid: false },
  [SWORD]: { name: "Sword", color: "#e5e7eb", solid: false },
  [GEM]: { name: "Gem Block", color: "#e040fb", solid: true },
  [CHEST]: { name: "Chest", color: "#b45309", solid: true, collectible: null }
};

const PLACEABLES = [DIRT, STONE, ORE, WOOD, TORCH, CRYSTAL, GEM];

const RECIPES = [
  { inputs: { [WOOD]: 3, [STONE]: 2 }, output: PICKAXE, amount: 1, name: "Pickaxe" },
  { inputs: { [WOOD]: 4 }, output: AXE, amount: 1, name: "Axe" },
  { inputs: { [ORE]: 2, [WOOD]: 1 }, output: SWORD, amount: 1, name: "Sword" },
  { inputs: { [CRYSTAL]: 1, [WOOD]: 2 }, output: GEM, amount: 3, name: "Gem Block" }
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function seededNoise(x) {
  const value = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function getBiome(x) {
  if (x <= 40) return BIOMES.MEADOW;
  if (x <= 90) return BIOMES.FOREST;
  if (x <= 140) return BIOMES.CAVERN;
  return BIOMES.DEEP;
}

function terrainHeight(x) {
  const biome = getBiome(x);
  const hillScale = biome === BIOMES.FOREST ? 1.25 : biome === BIOMES.CAVERN ? 0.45 : biome === BIOMES.DEEP ? 0.16 : 1;
  const rolling = (Math.sin(x * 0.105) * 4.5 + Math.sin(x * 0.037 + 1.7) * 7) * hillScale;
  const chip = (seededNoise(x) - 0.5) * 3.2;
  const base = biome === BIOMES.DEEP ? 25 : biome === BIOMES.CAVERN ? 24 : 23;
  return Math.floor(base + rolling + chip);
}

function makeWorld() {
  const world = Array.from({ length: WORLD_ROWS }, () => Array(WORLD_COLS).fill(AIR));
  const worldColor = Array.from({ length: WORLD_ROWS }, () => Array(WORLD_COLS).fill(null));
  const chestLoot = new Map();

  for (let x = 0; x < WORLD_COLS; x += 1) {
    const surface = terrainHeight(x);
    const biome = getBiome(x);
    const dirtDepth = biome === BIOMES.CAVERN ? 2 : biome === BIOMES.DEEP ? 1 : 5;
    const oreThreshold = biome === BIOMES.DEEP ? 0.81 : biome === BIOMES.CAVERN ? 0.87 : 0.92;
    for (let y = surface; y < WORLD_ROWS; y += 1) {
      if (y === surface) {
        world[y][x] = GRASS;
        worldColor[y][x] = biome === BIOMES.FOREST ? "#2f9f50" : biome === BIOMES.DEEP ? "#334155" : "#49b85f";
      } else if (y < surface + dirtDepth) {
        world[y][x] = DIRT;
      } else {
        const oreRoll = seededNoise(x * 9 + y * 3);
        if (biome === BIOMES.DEEP && oreRoll > 0.93) {
          world[y][x] = CRYSTAL;
        } else {
          world[y][x] = oreRoll > oreThreshold ? ORE : STONE;
          if (biome === BIOMES.DEEP && world[y][x] === STONE) worldColor[y][x] = "#4a505f";
        }
      }
    }
  }

  carveCaves(world);
  plantTrees(world, worldColor);
  scatterChests(world, chestLoot);
  return { world, worldColor, chestLoot };
}

function carveCaves(world) {
  for (let y = 16; y < WORLD_ROWS - 6; y += 1) {
    for (let x = 3; x < WORLD_COLS - 3; x += 1) {
      const tunnel =
        Math.sin(x * 0.18 + y * 0.11) +
        Math.sin(x * 0.08 - y * 0.19) +
        (seededNoise(x * 4.3 + y * 8.1) - 0.5);
      const biome = getBiome(x);
      const threshold = biome === BIOMES.CAVERN ? 1.18 : biome === BIOMES.DEEP ? 1.12 : 1.34;
      if (tunnel > threshold && world[y][x] !== GRASS) {
        world[y][x] = AIR;
        if (seededNoise(x + y * 11) > 0.92 && y > 22) {
          world[y - 1][x] = TORCH;
        }
      }
    }
  }
}

function plantTrees(world, worldColor) {
  for (let x = 8; x < WORLD_COLS - 8; x += getBiome(x) === BIOMES.FOREST ? 5 : 9) {
    const biome = getBiome(x);
    if (biome === BIOMES.DEEP || biome === BIOMES.CAVERN) continue;
    if (seededNoise(x * 2.5) < (biome === BIOMES.FOREST ? 0.22 : 0.45)) continue;

    const surface = terrainHeight(x);
    const height = 4 + Math.floor(seededNoise(x * 7) * 3);
    for (let y = surface - height; y < surface; y += 1) {
      if (y > 0) world[y][x] = WOOD;
    }

    for (let ly = surface - height - 2; ly <= surface - height + 2; ly += 1) {
      for (let lx = x - 3; lx <= x + 3; lx += 1) {
        const dist = Math.abs(lx - x) + Math.abs(ly - (surface - height));
        if (dist < 5 && ly > 0 && lx >= 0 && lx < WORLD_COLS && world[ly][lx] === AIR) {
          world[ly][lx] = LEAF;
          if (biome === BIOMES.FOREST) worldColor[ly][lx] = "#1a7a3f";
        }
      }
    }
  }
}

function generateLoot(x, y) {
  const roll = seededNoise(x * 11 + y * 7);
  if (roll < 0.3) return { [ORE]: 3 + Math.floor(roll * 10), [TORCH]: 2 };
  if (roll < 0.6) return { [CRYSTAL]: 1, [WOOD]: 4 };
  if (roll < 0.85) return { [STONE]: 8, [ORE]: 2, [TORCH]: 3 };
  return { [CRYSTAL]: 2, [ORE]: 5 };
}

function scatterChests(world, chestLoot) {
  let placed = 0;
  for (let y = 18; y < WORLD_ROWS - 2 && placed < 22; y += 1) {
    for (let x = 3; x < WORLD_COLS - 3 && placed < 22; x += 1) {
      if (
        placed >= 18 &&
        seededNoise(x * 5.1 + y * 2.3) < 0.985
      ) continue;
      if (
        world[y][x] === AIR &&
        world[y + 1][x] !== AIR &&
        y > terrainHeight(x) + 6 &&
        seededNoise(x * 3.7 + y * 6.1) > 0.94
      ) {
        world[y][x] = CHEST;
        chestLoot.set(`${x},${y}`, generateLoot(x, y));
        placed += 1;
      }
    }
  }
}

function makeInventory() {
  return {
    [DIRT]: 24,
    [STONE]: 10,
    [ORE]: 0,
    [WOOD]: 8,
    [TORCH]: 6,
    [CRYSTAL]: 0,
    [GEM]: 0,
    [PICKAXE]: 0,
    [AXE]: 0,
    [SWORD]: 0
  };
}

export class CavernGame {
  constructor({ canvas, inventoryEl, craftingEl, biomeEl, messageEl, healthEl, resetButton }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.inventoryEl = inventoryEl;
    this.craftingEl = craftingEl;
    this.biomeEl = biomeEl;
    this.messageEl = messageEl;
    this.healthEl = healthEl;
    this.resetButton = resetButton;
    const worldState = makeWorld();
    this.world = worldState.world;
    this.worldColor = worldState.worldColor;
    this.chestLoot = worldState.chestLoot;
    this.lightMap = this.createLightMap();
    this.mineProgress = new Map();
    this.lastMineKey = "";
    this.currentBiome = BIOMES.MEADOW;
    this.biomeOpacity = 1;
    this.inventory = makeInventory();
    this.enemies = this.makeEnemies();
    this.selected = DIRT;
    this.keys = new Set();
    this.pointer = { x: 0, y: 0, down: false, button: 0, tileX: 0, tileY: 0 };
    this.camera = { x: 0, y: 0 };
    this.player = {
      x: 14 * TILE,
      y: (terrainHeight(14) - 3) * TILE,
      w: 17,
      h: 34,
      vx: 0,
      vy: 0,
      grounded: false,
      facing: 1
    };
    this.health = 100;
    this.hurtCooldown = 0;
    this.tick = 0;
    this.animationId = null;

    this.loop = this.loop.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
    this.handleReset = this.handleReset.bind(this);
    this.handleInventoryClick = this.handleInventoryClick.bind(this);
    this.handleCraftingClick = this.handleCraftingClick.bind(this);
    this.handleResize = this.handleResize.bind(this);
  }

  start() {
    this.resize();
    this.updateLighting();
    this.renderInventory();
    this.renderCrafting();
    this.updateHealth();
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("resize", this.handleResize);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    this.inventoryEl.addEventListener("click", this.handleInventoryClick);
    this.craftingEl.addEventListener("click", this.handleCraftingClick);
    this.resetButton.addEventListener("click", this.handleReset);
    this.animationId = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("resize", this.handleResize);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
    this.inventoryEl.removeEventListener("click", this.handleInventoryClick);
    this.craftingEl.removeEventListener("click", this.handleCraftingClick);
    this.resetButton.removeEventListener("click", this.handleReset);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * ratio);
    this.canvas.height = Math.floor(rect.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  handleResize() {
    this.resize();
  }

  handleReset() {
    const worldState = makeWorld();
    this.world = worldState.world;
    this.worldColor = worldState.worldColor;
    this.chestLoot = worldState.chestLoot;
    this.lightMap = this.createLightMap();
    this.mineProgress = new Map();
    this.lastMineKey = "";
    this.inventory = makeInventory();
    this.enemies = this.makeEnemies();
    this.player.x = 14 * TILE;
    this.player.y = (terrainHeight(14) - 3) * TILE;
    this.player.vx = 0;
    this.player.vy = 0;
    this.health = 100;
    this.hurtCooldown = 0;
    this.setMessage("A fresh world rolls out under your boots.");
    this.updateLighting();
    this.renderInventory();
    this.renderCrafting();
    this.updateHealth();
  }

  handleKeyDown(event) {
    const key = event.key.toLowerCase();
    const handled = ["a", "d", "w", " ", "arrowleft", "arrowright", "arrowup", "1", "2", "3", "4", "5", "6", "7"];
    if (!handled.includes(key)) return;
    event.preventDefault();
    this.keys.add(key);

    if (["1", "2", "3", "4", "5", "6", "7"].includes(key)) {
      this.selected = PLACEABLES[Number(key) - 1];
      this.renderInventory();
    }
  }

  handleKeyUp(event) {
    this.keys.delete(event.key.toLowerCase());
  }

  handlePointerMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = event.clientX - rect.left;
    this.pointer.y = event.clientY - rect.top;
    this.updatePointerTile();
  }

  handlePointerDown(event) {
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.pointer.down = true;
    this.pointer.button = event.button;
    this.handlePointerMove(event);
    this.useTool(event.button);
  }

  handlePointerUp() {
    this.pointer.down = false;
  }

  handleContextMenu(event) {
    event.preventDefault();
  }

  handleInventoryClick(event) {
    const button = event.target.closest("[data-block]");
    if (!button) return;
    this.selected = Number(button.dataset.block);
    this.renderInventory();
  }

  handleCraftingClick(event) {
    const button = event.target.closest("[data-recipe]");
    if (!button || button.disabled) return;
    const recipe = RECIPES[Number(button.dataset.recipe)];
    for (const [item, count] of Object.entries(recipe.inputs)) {
      this.inventory[item] -= count;
    }
    this.inventory[recipe.output] = (this.inventory[recipe.output] || 0) + recipe.amount;
    this.setMessage(`Crafted ${recipe.name}.`);
    this.renderInventory();
    this.renderCrafting();
  }

  loop() {
    this.tick += 1;
    this.update();
    this.draw();
    this.animationId = requestAnimationFrame(this.loop);
  }

  update() {
    const left = this.keys.has("a") || this.keys.has("arrowleft");
    const right = this.keys.has("d") || this.keys.has("arrowright");
    const jump = this.keys.has("w") || this.keys.has("arrowup") || this.keys.has(" ");

    if (left) {
      this.player.vx -= MOVE_ACCEL;
      this.player.facing = -1;
    }
    if (right) {
      this.player.vx += MOVE_ACCEL;
      this.player.facing = 1;
    }
    if (jump && this.player.grounded) {
      this.player.vy = JUMP_SPEED;
      this.player.grounded = false;
    }

    this.player.vx *= FRICTION;
    this.player.vx = clamp(this.player.vx, -MAX_SPEED, MAX_SPEED);
    this.player.vy = clamp(this.player.vy + GRAVITY, -18, 18);

    this.moveAxis("x", this.player.vx);
    this.moveAxis("y", this.player.vy);
    this.updateEnemies();

    if (this.hurtCooldown > 0) {
      this.hurtCooldown -= 1;
    }

    if (this.tick % 60 === 0) {
      this.updateLighting();
    }

    const viewW = this.canvas.clientWidth;
    const viewH = this.canvas.clientHeight;
    this.camera.x = clamp(this.player.x - viewW * 0.48, 0, WORLD_COLS * TILE - viewW);
    this.camera.y = clamp(this.player.y - viewH * 0.48, 0, WORLD_ROWS * TILE - viewH);
    this.updateBiomeIndicator();

    this.updatePointerTile();
    if (this.pointer.down && this.tick % 8 === 0) {
      this.useTool(this.pointer.button);
    }
  }

  moveAxis(axis, amount) {
    this.player[axis] += amount;

    const bounds = this.getPlayerBounds();
    if (!this.overlapsSolid(bounds)) {
      if (axis === "y") this.player.grounded = false;
      return;
    }

    const direction = Math.sign(amount);
    while (this.overlapsSolid(this.getPlayerBounds())) {
      this.player[axis] -= direction || 1;
    }

    if (axis === "x") this.player.vx = 0;
    if (axis === "y") {
      if (amount > 0) this.player.grounded = true;
      this.player.vy = 0;
    }
  }

  getPlayerBounds() {
    return {
      left: this.player.x,
      right: this.player.x + this.player.w,
      top: this.player.y,
      bottom: this.player.y + this.player.h
    };
  }

  overlapsSolid(bounds) {
    const startX = Math.floor(bounds.left / TILE);
    const endX = Math.floor((bounds.right - 1) / TILE);
    const startY = Math.floor(bounds.top / TILE);
    const endY = Math.floor((bounds.bottom - 1) / TILE);

    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        if (this.isSolid(x, y)) return true;
      }
    }
    return false;
  }

  isSolid(x, y) {
    if (x < 0 || x >= WORLD_COLS || y >= WORLD_ROWS) return true;
    if (y < 0) return false;
    const block = this.world[y][x];
    return Boolean(BLOCKS[block]?.solid);
  }

  updatePointerTile() {
    this.pointer.tileX = Math.floor((this.pointer.x + this.camera.x) / TILE);
    this.pointer.tileY = Math.floor((this.pointer.y + this.camera.y) / TILE);
  }

  useTool(button) {
    if (!this.isWithinReach(this.pointer.tileX, this.pointer.tileY)) {
      this.setMessage("Too far away.");
      return;
    }

    if (button === 2) {
      this.placeBlock(this.pointer.tileX, this.pointer.tileY);
    } else {
      if (this.attackEnemy(this.pointer.tileX, this.pointer.tileY)) return;
      this.mineBlock(this.pointer.tileX, this.pointer.tileY);
    }
  }

  isWithinReach(tileX, tileY) {
    const playerCenterX = (this.player.x + this.player.w / 2) / TILE;
    const playerCenterY = (this.player.y + this.player.h / 2) / TILE;
    return Math.hypot(tileX + 0.5 - playerCenterX, tileY + 0.5 - playerCenterY) <= REACH;
  }

  mineBlock(x, y) {
    if (!this.inWorld(x, y)) return;
    const block = this.world[y][x];
    if (block === AIR) return;
    const key = `${x},${y}`;
    if (this.lastMineKey && this.lastMineKey !== key) {
      this.mineProgress.delete(this.lastMineKey);
    }
    this.lastMineKey = key;

    const requiredHits = this.getRequiredMineHits(block);
    const progress = (this.mineProgress.get(key) || 0) + 1;
    if (progress < requiredHits) {
      this.mineProgress.set(key, progress);
      this.setMessage(`Mining... (${progress}/${requiredHits})`);
      return;
    }
    this.mineProgress.delete(key);

    if (block === CHEST) {
      const loot = this.chestLoot.get(key) || {};
      const found = Object.entries(loot).map(([item, count]) => {
        this.inventory[item] = (this.inventory[item] || 0) + count;
        return `${count} ${BLOCKS[item].name}`;
      });
      this.chestLoot.delete(key);
      this.world[y][x] = AIR;
      this.worldColor[y][x] = null;
      this.setMessage(`Chest opened! Found: ${found.join(", ")}.`);
      this.renderInventory();
      this.renderCrafting();
      this.updateLighting();
      return;
    }

    const collectible = BLOCKS[block]?.collectible || block;
    if (PLACEABLES.includes(collectible) || collectible === CRYSTAL) {
      this.inventory[collectible] = (this.inventory[collectible] || 0) + 1;
    }
    this.world[y][x] = AIR;
    this.worldColor[y][x] = null;
    this.setMessage(`Collected ${BLOCKS[collectible]?.name || "block"}.`);
    this.renderInventory();
    this.renderCrafting();
    this.updateLighting();
  }

  getRequiredMineHits(block) {
    const hasPickaxe = (this.inventory[PICKAXE] || 0) > 0;
    const hasAxe = (this.inventory[AXE] || 0) > 0;
    if (block === DIRT || block === GRASS) return 1;
    if (block === STONE) return hasPickaxe ? 1 : 3;
    if (block === ORE) return hasPickaxe ? 2 : 4;
    if (block === WOOD) return hasAxe ? 1 : 3;
    if (block === LEAF) return hasAxe ? 1 : 2;
    if (block === CRYSTAL) return hasPickaxe ? 2 : 5;
    if (block === CHEST) return 1;
    return 1;
  }

  placeBlock(x, y) {
    if (!this.inWorld(x, y) || this.world[y][x] !== AIR) return;
    if ((this.inventory[this.selected] || 0) <= 0) {
      this.setMessage(`Out of ${BLOCKS[this.selected].name.toLowerCase()}.`);
      return;
    }

    const blockBounds = {
      left: x * TILE,
      right: x * TILE + TILE,
      top: y * TILE,
      bottom: y * TILE + TILE
    };
    if (this.rectsOverlap(blockBounds, this.getPlayerBounds())) {
      this.setMessage("Give yourself some room.");
      return;
    }

    this.world[y][x] = this.selected;
    this.worldColor[y][x] = null;
    this.inventory[this.selected] -= 1;
    this.setMessage(`Placed ${BLOCKS[this.selected].name.toLowerCase()}.`);
    this.renderInventory();
    this.renderCrafting();
    if (this.selected === TORCH) this.updateLighting();
  }

  rectsOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  inWorld(x, y) {
    return x >= 0 && x < WORLD_COLS && y >= 0 && y < WORLD_ROWS;
  }

  setMessage(text) {
    this.messageEl.textContent = text;
  }

  renderInventory() {
    const placeables = PLACEABLES
      .filter((block) => (this.inventory[block] || 0) > 0 || PLACEABLES.includes(block))
      .map((block, index) => {
      const active = block === this.selected ? "is-active" : "";
      return `
        <button class="inventory-slot ${active}" type="button" data-block="${block}">
          <span class="inventory-key">${index + 1}</span>
          <span class="inventory-swatch" style="--block-color:${BLOCKS[block].color}"></span>
          <span class="inventory-name">${BLOCKS[block].name}</span>
          <strong>${this.inventory[block] || 0}</strong>
        </button>
      `;
    }).join("");
    const tools = [PICKAXE, AXE, SWORD].map((tool) => `
      <div class="tool-row ${this.inventory[tool] > 0 ? "is-owned" : ""}">
        <span>${BLOCKS[tool].name}</span>
        <strong>${this.inventory[tool] > 0 ? "✓" : "—"}</strong>
      </div>
    `).join("");
    this.inventoryEl.innerHTML = `${placeables}<div class="tools-list">${tools}</div>`;
  }

  renderCrafting() {
    this.craftingEl.innerHTML = RECIPES.map((recipe, index) => {
      const canCraft = Object.entries(recipe.inputs).every(([item, count]) => (this.inventory[item] || 0) >= count);
      const ingredients = Object.entries(recipe.inputs).map(([item, count]) => `
        <span class="ingredient-tag">${BLOCKS[item].name} ${this.inventory[item] || 0}/${count}</span>
      `).join("");
      return `
        <article class="recipe-row">
          <div>
            <strong>${recipe.name}</strong>
            <div class="ingredient-list">${ingredients}</div>
          </div>
          <button type="button" data-recipe="${index}" ${canCraft ? "" : "disabled"}>Craft</button>
        </article>
      `;
    }).join("");
  }

  createLightMap() {
    return Array.from({ length: WORLD_ROWS }, () => Array(WORLD_COLS).fill(0));
  }

  updateBiomeIndicator() {
    const x = clamp(Math.floor((this.player.x + this.player.w / 2) / TILE), 0, WORLD_COLS - 1);
    const biome = getBiome(x);
    if (biome !== this.currentBiome) {
      this.currentBiome = biome;
      this.biomeOpacity = 1;
      this.biomeEl.textContent = biome;
    } else {
      this.biomeOpacity = Math.max(0.35, this.biomeOpacity - 0.01);
    }
    this.biomeEl.style.opacity = this.biomeOpacity.toFixed(2);
  }

  updateLighting() {
    const day = (Math.sin(this.tick * 0.002) + 1) / 2;
    this.lightMap = this.createLightMap();

    for (let x = 0; x < WORLD_COLS; x += 1) {
      let light = day;
      for (let y = 0; y < WORLD_ROWS; y += 1) {
        if (this.world[y][x] !== AIR && this.world[y][x] !== TORCH) {
          this.lightMap[y][x] = Math.max(this.lightMap[y][x], light);
          break;
        }
        this.lightMap[y][x] = Math.max(this.lightMap[y][x], light);
        light = Math.max(0, light - 0.05);
      }
    }

    for (let y = 0; y < WORLD_ROWS; y += 1) {
      for (let x = 0; x < WORLD_COLS; x += 1) {
        if (this.world[y][x] === TORCH) this.spreadLight(x, y, 9);
      }
    }
  }

  spreadLight(startX, startY, radius) {
    const queue = [{ x: startX, y: startY, d: 0 }];
    const seen = new Set([`${startX},${startY}`]);
    while (queue.length > 0) {
      const current = queue.shift();
      const value = Math.max(0, 1 - current.d * 0.13);
      this.lightMap[current.y][current.x] = Math.max(this.lightMap[current.y][current.x], value);
      if (current.d >= radius) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const key = `${nx},${ny}`;
        if (!this.inWorld(nx, ny) || seen.has(key)) continue;
        seen.add(key);
        queue.push({ x: nx, y: ny, d: current.d + 1 });
      }
    }
  }

  updateHealth() {
    this.healthEl.textContent = `${Math.max(0, this.health)}%`;
  }

  makeEnemies() {
    const enemies = [];
    for (let i = 0; i < 16; i += 1) {
      const x = 25 + i * 9 + Math.floor(seededNoise(i * 17) * 8);
      const surface = terrainHeight(x);
      enemies.push({
        type: "slime",
        x: x * TILE,
        y: (surface - 1) * TILE,
        w: 22,
        h: 18,
        vx: seededNoise(i * 12) > 0.5 ? 0.7 : -0.7,
        vy: 0,
        health: 4,
        damage: 10,
        hop: Math.floor(seededNoise(i * 33) * 80)
      });
    }
    this.findCaveSpawns().slice(0, 18).forEach((spot, index) => {
      const bat = index % 2 === 0;
      enemies.push({
        type: bat ? "bat" : "spider",
        x: spot.x * TILE,
        y: spot.y * TILE,
        w: bat ? 16 : 18,
        h: bat ? 10 : 12,
        vx: seededNoise(index * 12) > 0.5 ? 0.8 : -0.8,
        vy: 0,
        health: bat ? 2 : 3,
        damage: bat ? 8 : 14,
        hop: 20
      });
    });
    return enemies;
  }

  findCaveSpawns() {
    const spots = [];
    for (let y = 22; y < WORLD_ROWS - 4; y += 1) {
      for (let x = 4; x < WORLD_COLS - 4; x += 1) {
        if (this.world[y][x] !== AIR || y <= terrainHeight(x) + 8) continue;
        const adjacentSolid = this.world[y][x - 1] !== AIR || this.world[y][x + 1] !== AIR || this.world[y - 1][x] !== AIR;
        if (adjacentSolid && seededNoise(x * 13 + y * 5) > 0.965) spots.push({ x, y });
      }
    }
    return spots;
  }

  updateEnemies() {
    for (const enemy of this.enemies) {
      if (enemy.type === "bat") {
        this.updateBat(enemy);
      } else {
        this.updateGroundEnemy(enemy);
      }

      if (this.rectsOverlap(this.enemyBounds(enemy), this.getPlayerBounds()) && this.hurtCooldown <= 0) {
        this.health = Math.max(0, this.health - (enemy.damage || 10));
        this.hurtCooldown = 70;
        this.player.vx += enemy.x < this.player.x ? 5 : -5;
        this.player.vy = -6;
        this.setMessage(this.health > 0 ? "Ouch. Something bit you." : "You fainted. New world resets health.");
        this.updateHealth();
      }
    }

    if (this.health <= 0) {
      this.health = 100;
      this.player.x = 14 * TILE;
      this.player.y = (terrainHeight(14) - 3) * TILE;
      this.player.vx = 0;
      this.player.vy = 0;
      this.setMessage("Back at the meadow. Try not to get cornered.");
      this.updateHealth();
    }
  }

  updateGroundEnemy(enemy) {
      enemy.hop -= 1;
      if (enemy.hop <= 0) {
        enemy.vy = -7.5;
        enemy.vx = (this.player.x > enemy.x ? 1 : -1) * (0.6 + seededNoise(this.tick + enemy.x) * 0.9);
        enemy.hop = (enemy.type === "mini_slime" ? 25 : 55) + Math.floor(seededNoise(this.tick * 0.5 + enemy.y) * 35);
      }

      const tileX = Math.floor((enemy.x + enemy.w / 2) / TILE);
      const ceiling = enemy.type === "spider" && this.isSolid(tileX, Math.floor(enemy.y / TILE) - 1);
      enemy.vy = clamp(enemy.vy + (ceiling ? -GRAVITY * 0.6 : GRAVITY * 0.7), -14, 14);
      this.moveEnemy(enemy, "x", enemy.vx);
      this.moveEnemy(enemy, "y", enemy.vy);
  }

  updateBat(enemy) {
    const dx = this.player.x - enemy.x;
    const dy = this.player.y - enemy.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    enemy.vx += ((dx / len) * 2.4 - enemy.vx) * 0.08;
    enemy.vy += ((dy / len) * 1.8 - enemy.vy) * 0.08;
    const tileX = Math.floor((enemy.x + enemy.w / 2) / TILE);
    const tileY = Math.floor((enemy.y + enemy.h / 2) / TILE);
    if (this.isSolid(tileX + Math.sign(enemy.vx), tileY)) enemy.vx *= -0.7;
    if (this.isSolid(tileX, tileY + Math.sign(enemy.vy))) enemy.vy *= -0.7;
    enemy.x += enemy.vx;
    enemy.y += enemy.vy;
  }

  spawnMiniSlimes(enemy) {
    for (const dir of [-1, 1]) {
      this.enemies.push({
        type: "mini_slime",
        x: enemy.x + dir * 8,
        y: enemy.y,
        w: 10,
        h: 8,
        vx: dir * 1.2,
        vy: -4,
        health: 1,
        damage: 5,
        hop: 15
      });
    }
  }

  moveEnemy(enemy, axis, amount) {
    enemy[axis] += amount;
    if (!this.overlapsSolid(this.enemyBounds(enemy))) return;

    const direction = Math.sign(amount) || 1;
    while (this.overlapsSolid(this.enemyBounds(enemy))) {
      enemy[axis] -= direction;
    }

    if (axis === "x") enemy.vx *= -1;
    if (axis === "y") enemy.vy = 0;
  }

  enemyBounds(enemy) {
    return {
      left: enemy.x,
      right: enemy.x + enemy.w,
      top: enemy.y,
      bottom: enemy.y + enemy.h
    };
  }

  attackEnemy(tileX, tileY) {
    const hitX = tileX * TILE + TILE / 2;
    const hitY = tileY * TILE + TILE / 2;
    const enemy = this.enemies.find((target) => {
      const centerX = target.x + target.w / 2;
      const centerY = target.y + target.h / 2;
      return Math.hypot(centerX - hitX, centerY - hitY) < 30;
    });

    if (!enemy) return false;

    const hasSword = (this.inventory[SWORD] || 0) > 0;
    enemy.health -= hasSword ? 2 : 1;
    enemy.vx += (enemy.x < this.player.x ? -4 : 4) * (hasSword ? 2 : 1);
    enemy.vy = -5;
    if (enemy.health <= 0) {
      if (enemy.type === "slime") this.spawnMiniSlimes(enemy);
      this.enemies = this.enemies.filter((target) => target !== enemy);
      this.inventory[ORE] = (this.inventory[ORE] || 0) + 1;
      this.setMessage("Creature cleared. It dropped a little ore.");
      this.renderInventory();
      this.renderCrafting();
    } else {
      this.setMessage("Bonk.");
    }
    return true;
  }

  draw() {
    const ctx = this.ctx;
    const viewW = this.canvas.clientWidth;
    const viewH = this.canvas.clientHeight;
    const day = (Math.sin(this.tick * 0.002) + 1) / 2;

    const skyTop = this.mixColor([11, 18, 35], [92, 184, 218], day);
    const skyBottom = this.mixColor([23, 22, 42], [255, 205, 113], day * 0.7);
    const gradient = ctx.createLinearGradient(0, 0, 0, viewH);
    gradient.addColorStop(0, skyTop);
    gradient.addColorStop(1, skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewW, viewH);

    this.drawSunMoon(day, viewW);
    this.drawTiles();
    this.drawEnemies();
    this.drawPointerHighlight();
    this.drawPlayer();
    this.drawVignette(viewW, viewH);
  }

  mixColor(a, b, amount) {
    const channels = a.map((value, index) => Math.round(value + (b[index] - value) * amount));
    return `rgb(${channels[0]} ${channels[1]} ${channels[2]})`;
  }

  drawSunMoon(day, viewW) {
    const x = (this.tick * 0.025) % (viewW + 180) - 90;
    const y = 78 + Math.sin(this.tick * 0.002) * 28;
    this.ctx.fillStyle = day > 0.32 ? "#ffe98a" : "#dbe7ff";
    this.ctx.beginPath();
    this.ctx.arc(x, y, day > 0.32 ? 28 : 18, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawTiles() {
    const startX = Math.max(0, Math.floor(this.camera.x / TILE) - 1);
    const endX = Math.min(WORLD_COLS - 1, Math.ceil((this.camera.x + this.canvas.clientWidth) / TILE) + 1);
    const startY = Math.max(0, Math.floor(this.camera.y / TILE) - 1);
    const endY = Math.min(WORLD_ROWS - 1, Math.ceil((this.camera.y + this.canvas.clientHeight) / TILE) + 1);

    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        const block = this.world[y][x];
        if (block === AIR) continue;
        this.drawTile(x, y, block);
      }
    }
  }

  drawTile(x, y, block) {
    const ctx = this.ctx;
    const screenX = Math.floor(x * TILE - this.camera.x);
    const screenY = Math.floor(y * TILE - this.camera.y);
    const info = BLOCKS[block];

    if (block === TORCH) {
      ctx.fillStyle = "#7b4a2c";
      ctx.fillRect(screenX + 10, screenY + 8, 4, 14);
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      ctx.arc(screenX + 12, screenY + 7, 6 + Math.sin(this.tick * 0.2) * 1.2, 0, Math.PI * 2);
      ctx.fill();
      this.drawLightingOverlay(x, y, screenX, screenY);
      return;
    }

    if (block === CHEST) {
      ctx.fillStyle = "#9a4f0f";
      ctx.fillRect(screenX + 2, screenY + 5, TILE - 4, TILE - 7);
      ctx.fillStyle = "#5f2f0b";
      ctx.fillRect(screenX + 2, screenY + 5, TILE - 4, 7);
      const pulse = 0.55 + Math.sin(this.tick * 0.05) * 0.25;
      ctx.fillStyle = `rgba(255, 215, 80, ${pulse})`;
      ctx.fillRect(screenX + 10, screenY + 12, 4, 5);
      this.drawCracks(x, y, screenX, screenY);
      this.drawLightingOverlay(x, y, screenX, screenY);
      return;
    }

    ctx.fillStyle = this.worldColor[y]?.[x] || info.color;
    ctx.fillRect(screenX, screenY, TILE, TILE);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(screenX, screenY, TILE, 4);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(screenX, screenY + TILE - 5, TILE, 5);
    ctx.fillRect(screenX + TILE - 4, screenY, 4, TILE);

    if (block === GRASS) {
      ctx.fillStyle = "#73df6f";
      ctx.fillRect(screenX, screenY, TILE, 7);
    }

    if (block === ORE) {
      ctx.fillStyle = "#ffe087";
      ctx.fillRect(screenX + 5, screenY + 7, 5, 5);
      ctx.fillRect(screenX + 14, screenY + 13, 6, 4);
    }

    if (block === GEM) {
      ctx.fillStyle = "#f0abfc";
      for (let i = 0; i < 4; i += 1) {
        const angle = this.tick * 0.04 + i * Math.PI / 2;
        ctx.beginPath();
        ctx.arc(screenX + 12 + Math.cos(angle) * 6, screenY + 12 + Math.sin(angle) * 6, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (block === CRYSTAL) {
      ctx.fillStyle = "#ddd6fe";
      ctx.beginPath();
      ctx.moveTo(screenX + 12, screenY + 4);
      ctx.lineTo(screenX + 18, screenY + 13);
      ctx.lineTo(screenX + 12, screenY + 21);
      ctx.lineTo(screenX + 6, screenY + 13);
      ctx.closePath();
      ctx.fill();
    }

    this.drawCracks(x, y, screenX, screenY);
    this.drawLightingOverlay(x, y, screenX, screenY);
  }

  drawCracks(x, y, screenX, screenY) {
    const progress = this.mineProgress.get(`${x},${y}`) || 0;
    if (progress <= 0) return;
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(screenX + 5, screenY + 5);
    ctx.lineTo(screenX + 18, screenY + 18);
    if (progress >= 2) {
      ctx.moveTo(screenX + 18, screenY + 5);
      ctx.lineTo(screenX + 6, screenY + 19);
    }
    if (progress >= 3) {
      ctx.moveTo(screenX + 11, screenY + 3);
      ctx.lineTo(screenX + 13, screenY + 21);
    }
    ctx.stroke();
    if (progress >= 3) {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(screenX, screenY, TILE, TILE);
    }
  }

  drawLightingOverlay(x, y, screenX, screenY) {
    const light = clamp(this.lightMap[y]?.[x] ?? 0.35, 0, 1);
    const darkness = 1 - light;
    if (darkness <= 0.02) return;
    this.ctx.fillStyle = `rgba(0, 0, 10, ${darkness})`;
    this.ctx.fillRect(screenX, screenY, TILE, TILE);
  }

  drawPointerHighlight() {
    const { tileX, tileY } = this.pointer;
    if (!this.inWorld(tileX, tileY)) return;
    const x = tileX * TILE - this.camera.x;
    const y = tileY * TILE - this.camera.y;
    const reachable = this.isWithinReach(tileX, tileY);
    this.ctx.strokeStyle = reachable ? "rgba(255,255,255,0.88)" : "rgba(255,79,122,0.85)";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(Math.floor(x) + 2, Math.floor(y) + 2, TILE - 4, TILE - 4);
  }

  drawPlayer() {
    const ctx = this.ctx;
    const x = Math.floor(this.player.x - this.camera.x);
    const y = Math.floor(this.player.y - this.camera.y);

    ctx.fillStyle = "#20263c";
    if (this.hurtCooldown > 0 && Math.floor(this.tick / 5) % 2 === 0) {
      ctx.fillStyle = "#ff4f7d";
    }
    ctx.fillRect(x + 2, y + 12, this.player.w - 4, 20);
    ctx.fillStyle = "#ffcf8a";
    ctx.fillRect(x + 4, y + 2, this.player.w - 8, 12);
    ctx.fillStyle = "#42f5b3";
    ctx.fillRect(x + (this.player.facing > 0 ? 11 : 3), y + 7, 3, 3);
    ctx.fillStyle = "#161a28";
    ctx.fillRect(x + 3, y + 31, 5, 5);
    ctx.fillRect(x + this.player.w - 8, y + 31, 5, 5);
  }

  drawEnemies() {
    for (const enemy of this.enemies) {
      const x = Math.floor(enemy.x - this.camera.x);
      const y = Math.floor(enemy.y - this.camera.y);
      if (x < -40 || x > this.canvas.clientWidth + 40 || y < -40 || y > this.canvas.clientHeight + 40) {
        continue;
      }

      if (enemy.type === "bat") {
        this.drawBat(enemy, x, y);
      } else if (enemy.type === "spider") {
        this.drawSpider(enemy, x, y);
      } else {
        this.drawSlime(enemy, x, y);
      }
    }
  }

  drawSlime(enemy, x, y) {
    const wobble = 0.85 + Math.sin(this.tick * 0.3 + enemy.x) * 0.15;
    this.ctx.save();
    this.ctx.translate(x + enemy.w / 2, y + enemy.h / 2);
    this.ctx.scale(1 / wobble, wobble);
    this.ctx.fillStyle = enemy.type === "mini_slime" ? "#b6ff82" : "#9cff68";
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, enemy.w / 2, enemy.h / 2, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
    this.ctx.fillStyle = "#162319";
    this.ctx.fillRect(x + enemy.w * 0.28, y + enemy.h * 0.38, 3, 3);
    this.ctx.fillRect(x + enemy.w * 0.64, y + enemy.h * 0.38, 3, 3);
  }

  drawBat(enemy, x, y) {
    const ctx = this.ctx;
    ctx.fillStyle = "#6b21a8";
    ctx.beginPath();
    ctx.ellipse(x + enemy.w / 2, y + enemy.h / 2, enemy.w / 2, enemy.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 5);
    ctx.lineTo(x - 8, y + Math.sin(this.tick * 0.4) * 4 + 1);
    ctx.lineTo(x + 3, y + 9);
    ctx.moveTo(x + enemy.w - 2, y + 5);
    ctx.lineTo(x + enemy.w + 8, y + Math.sin(this.tick * 0.4) * 4 + 1);
    ctx.lineTo(x + enemy.w - 3, y + 9);
    ctx.fill();
  }

  drawSpider(enemy, x, y) {
    const ctx = this.ctx;
    ctx.strokeStyle = "#451a03";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      const ly = y + 3 + i * 2;
      ctx.beginPath();
      ctx.moveTo(x + 4, ly);
      ctx.lineTo(x - 5, ly + (i % 2 === 0 ? -4 : 4));
      ctx.moveTo(x + enemy.w - 4, ly);
      ctx.lineTo(x + enemy.w + 5, ly + (i % 2 === 0 ? -4 : 4));
      ctx.stroke();
    }
    ctx.fillStyle = "#451a03";
    ctx.fillRect(x + 2, y + 2, enemy.w - 4, enemy.h - 3);
  }

  drawVignette(viewW, viewH) {
    const depth = clamp((this.camera.y - 260) / 900, 0, 0.72);
    if (depth <= 0) return;
    this.ctx.fillStyle = `rgba(3, 7, 16, ${depth})`;
    this.ctx.fillRect(0, 0, viewW, viewH);

    const px = this.player.x - this.camera.x + this.player.w / 2;
    const py = this.player.y - this.camera.y + this.player.h / 2;
    const glow = this.ctx.createRadialGradient(px, py, 40, px, py, 210);
    glow.addColorStop(0, "rgba(255, 214, 130, 0.22)");
    glow.addColorStop(1, "rgba(255, 214, 130, 0)");
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(0, 0, viewW, viewH);
  }
}
