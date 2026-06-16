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

const BLOCKS = {
  [GRASS]: { name: "Grass", color: "#49b85f", solid: true, collectible: DIRT },
  [DIRT]: { name: "Dirt", color: "#96613b", solid: true },
  [STONE]: { name: "Stone", color: "#777f91", solid: true },
  [ORE]: { name: "Ore", color: "#f1c64b", solid: true },
  [WOOD]: { name: "Wood", color: "#a86c39", solid: true },
  [LEAF]: { name: "Leaf", color: "#2f9f5f", solid: true },
  [TORCH]: { name: "Torch", color: "#ffb347", solid: false }
};

const PLACEABLES = [DIRT, STONE, ORE, WOOD, TORCH];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function seededNoise(x) {
  const value = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function terrainHeight(x) {
  const rolling = Math.sin(x * 0.105) * 4.5 + Math.sin(x * 0.037 + 1.7) * 7;
  const chip = (seededNoise(x) - 0.5) * 3.2;
  return Math.floor(23 + rolling + chip);
}

function makeWorld() {
  const world = Array.from({ length: WORLD_ROWS }, () => Array(WORLD_COLS).fill(AIR));

  for (let x = 0; x < WORLD_COLS; x += 1) {
    const surface = terrainHeight(x);
    for (let y = surface; y < WORLD_ROWS; y += 1) {
      if (y === surface) world[y][x] = GRASS;
      else if (y < surface + 5) world[y][x] = DIRT;
      else world[y][x] = seededNoise(x * 9 + y * 3) > 0.92 ? ORE : STONE;
    }
  }

  carveCaves(world);
  plantTrees(world);
  return world;
}

function carveCaves(world) {
  for (let y = 16; y < WORLD_ROWS - 6; y += 1) {
    for (let x = 3; x < WORLD_COLS - 3; x += 1) {
      const tunnel =
        Math.sin(x * 0.18 + y * 0.11) +
        Math.sin(x * 0.08 - y * 0.19) +
        (seededNoise(x * 4.3 + y * 8.1) - 0.5);
      if (tunnel > 1.34 && world[y][x] !== GRASS) {
        world[y][x] = AIR;
        if (seededNoise(x + y * 11) > 0.92 && y > 22) {
          world[y - 1][x] = TORCH;
        }
      }
    }
  }
}

function plantTrees(world) {
  for (let x = 8; x < WORLD_COLS - 8; x += 9) {
    if (seededNoise(x * 2.5) < 0.45) continue;

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
        }
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
    [TORCH]: 6
  };
}

export class CavernGame {
  constructor({ canvas, inventoryEl, messageEl, healthEl, resetButton }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.inventoryEl = inventoryEl;
    this.messageEl = messageEl;
    this.healthEl = healthEl;
    this.resetButton = resetButton;
    this.world = makeWorld();
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
    this.handleResize = this.handleResize.bind(this);
  }

  start() {
    this.resize();
    this.renderInventory();
    this.updateHealth();
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("resize", this.handleResize);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    this.inventoryEl.addEventListener("click", this.handleInventoryClick);
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
    this.world = makeWorld();
    this.inventory = makeInventory();
    this.enemies = this.makeEnemies();
    this.player.x = 14 * TILE;
    this.player.y = (terrainHeight(14) - 3) * TILE;
    this.player.vx = 0;
    this.player.vy = 0;
    this.health = 100;
    this.hurtCooldown = 0;
    this.setMessage("A fresh world rolls out under your boots.");
    this.renderInventory();
    this.updateHealth();
  }

  handleKeyDown(event) {
    const key = event.key.toLowerCase();
    const handled = ["a", "d", "w", " ", "arrowleft", "arrowright", "arrowup", "1", "2", "3", "4", "5"];
    if (!handled.includes(key)) return;
    event.preventDefault();
    this.keys.add(key);

    if (["1", "2", "3", "4", "5"].includes(key)) {
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

    const viewW = this.canvas.clientWidth;
    const viewH = this.canvas.clientHeight;
    this.camera.x = clamp(this.player.x - viewW * 0.48, 0, WORLD_COLS * TILE - viewW);
    this.camera.y = clamp(this.player.y - viewH * 0.48, 0, WORLD_ROWS * TILE - viewH);

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

    const collectible = BLOCKS[block]?.collectible || block;
    if (PLACEABLES.includes(collectible)) {
      this.inventory[collectible] = (this.inventory[collectible] || 0) + 1;
    }
    this.world[y][x] = AIR;
    this.setMessage(`Collected ${BLOCKS[collectible]?.name || "block"}.`);
    this.renderInventory();
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
    this.inventory[this.selected] -= 1;
    this.setMessage(`Placed ${BLOCKS[this.selected].name.toLowerCase()}.`);
    this.renderInventory();
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
    this.inventoryEl.innerHTML = PLACEABLES.map((block, index) => {
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
        x: x * TILE,
        y: (surface - 1) * TILE,
        w: 22,
        h: 18,
        vx: seededNoise(i * 12) > 0.5 ? 0.7 : -0.7,
        vy: 0,
        health: 3,
        hop: Math.floor(seededNoise(i * 33) * 80)
      });
    }
    return enemies;
  }

  updateEnemies() {
    for (const enemy of this.enemies) {
      enemy.hop -= 1;
      if (enemy.hop <= 0) {
        enemy.vy = -7.5;
        enemy.vx = (this.player.x > enemy.x ? 1 : -1) * (0.6 + seededNoise(this.tick + enemy.x) * 0.9);
        enemy.hop = 55 + Math.floor(seededNoise(this.tick * 0.5 + enemy.y) * 55);
      }

      enemy.vy = clamp(enemy.vy + GRAVITY * 0.7, -14, 14);
      this.moveEnemy(enemy, "x", enemy.vx);
      this.moveEnemy(enemy, "y", enemy.vy);

      if (this.rectsOverlap(this.enemyBounds(enemy), this.getPlayerBounds()) && this.hurtCooldown <= 0) {
        this.health = Math.max(0, this.health - 12);
        this.hurtCooldown = 70;
        this.player.vx += enemy.x < this.player.x ? 5 : -5;
        this.player.vy = -6;
        this.setMessage(this.health > 0 ? "Ouch. Something bumped you." : "You fainted. New world resets health.");
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

    enemy.health -= 1;
    enemy.vx += enemy.x < this.player.x ? -4 : 4;
    enemy.vy = -5;
    if (enemy.health <= 0) {
      this.enemies = this.enemies.filter((target) => target !== enemy);
      this.inventory[ORE] = (this.inventory[ORE] || 0) + 1;
      this.setMessage("Creature cleared. It dropped a little ore.");
      this.renderInventory();
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
      return;
    }

    ctx.fillStyle = info.color;
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

      this.ctx.fillStyle = "#9cff68";
      this.ctx.beginPath();
      this.ctx.ellipse(x + enemy.w / 2, y + enemy.h / 2, enemy.w / 2, enemy.h / 2, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = "#162319";
      this.ctx.fillRect(x + 6, y + 7, 3, 3);
      this.ctx.fillRect(x + 14, y + 7, 3, 3);
    }
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
