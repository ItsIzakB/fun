const COLS = 10;
const ROWS = 20;
const BLOCK = 28;
const PREVIEW_BLOCK = 22;
const LINES_PER_LEVEL = 4;
const MAX_LEVEL = 20;
const LOCK_DELAY_MS = 1000;
const TOP_OUT_GRACE_MS = 1000;
const RISK_ROW_DURATION_MS = 17000;
const RISK_ROW_COOLDOWN_MS = 11500;

const PIECES = {
  I: {
    color: "#34d6ff",
    matrix: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ]
  },
  J: {
    color: "#4776ff",
    matrix: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0]
    ]
  },
  L: {
    color: "#ff9d35",
    matrix: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0]
    ]
  },
  O: {
    color: "#ffe45e",
    matrix: [
      [1, 1],
      [1, 1]
    ]
  },
  S: {
    color: "#63e86b",
    matrix: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0]
    ]
  },
  T: {
    color: "#c05cff",
    matrix: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0]
    ]
  },
  Z: {
    color: "#ff4f7d",
    matrix: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0]
    ]
  }
};

const PIECE_KEYS = Object.keys(PIECES);

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function rotateMatrix(matrix) {
  const size = matrix.length;
  const rotated = Array.from({ length: size }, () => Array(size).fill(0));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      rotated[x][size - 1 - y] = matrix[y][x];
    }
  }

  return rotated;
}

function createPiece(type) {
  const template = PIECES[type];
  return {
    type,
    color: template.color,
    matrix: cloneMatrix(template.matrix),
    x: Math.floor((COLS - template.matrix.length) / 2),
    y: -1
  };
}

class TetrisAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx.state === "running";
  }

  blip(freq, duration = 0.08, type = "square", volume = 0.16) {
    if (!this.ensure()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  move() { this.blip(210, 0.045, "square", 0.07); }
  rotate() { this.blip(360, 0.07, "triangle", 0.1); }
  drop() { this.blip(95, 0.08, "sawtooth", 0.13); }
  lock() { this.blip(130, 0.1, "square", 0.11); }
  levelUp() { [420, 560, 760].forEach((freq, index) => setTimeout(() => this.blip(freq, 0.09, "triangle", 0.14), index * 70)); }
  gameOver() { this.blip(120, 0.28, "sawtooth", 0.2); setTimeout(() => this.blip(70, 0.38, "sawtooth", 0.18), 120); }
  tSpin() {
    [180, 360, 540, 760, 980].forEach((freq, index) => {
      setTimeout(() => this.blip(freq, 0.12, index % 2 ? "triangle" : "sawtooth", 0.18), index * 48);
    });
  }
  clear(lines) {
    const base = 300 + lines * 70;
    for (let i = 0; i < lines + 1; i += 1) {
      setTimeout(() => this.blip(base + i * 85, 0.08, "sine", 0.13), i * 55);
    }
  }
}

function getDropInterval(level) {
  return Math.max(55, 780 * Math.pow(0.84, level - 1));
}

export class TetrisGame {
  constructor({ canvas, previewCanvas, scoreEl, levelEl, linesEl, statusEl, restartButton }) {
    this.canvas = canvas;
    this.previewCanvas = previewCanvas;
    this.ctx = canvas.getContext("2d");
    this.previewCtx = previewCanvas.getContext("2d");
    this.scoreEl = scoreEl;
    this.levelEl = levelEl;
    this.linesEl = linesEl;
    this.statusEl = statusEl;
    this.restartButton = restartButton;
    this.audio = new TetrisAudio();

    this.board = createBoard();
    this.pieceHistory = [];
    this.active = this.randomPiece();
    this.next = this.randomPiece();
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.dropCounter = 0;
    this.lockDelay = LOCK_DELAY_MS;
    this.topOutTimer = 0;
    this.lastMoveWasRotate = false;
    this.riskRow = null;
    this.riskTimer = 4500;
    this.lastTime = 0;
    this.isGameOver = false;
    this.animationId = null;
    this.effects = {
      particles: [],
      rowFlashes: [],
      floatingTexts: [],
      shockwaves: [],
      boardShake: 0,
      screenFlash: 0
    };

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.restart = this.restart.bind(this);
    this.loop = this.loop.bind(this);
  }

  start() {
    this.resizeCanvases();
    window.addEventListener("keydown", this.handleKeyDown);
    this.restartButton.addEventListener("click", this.restart);
    this.updateStats();
    this.draw();
    this.animationId = requestAnimationFrame(this.loop);
  }

  destroy() {
    window.removeEventListener("keydown", this.handleKeyDown);
    this.restartButton.removeEventListener("click", this.restart);
    cancelAnimationFrame(this.animationId);
  }

  resizeCanvases() {
    this.canvas.width = COLS * BLOCK;
    this.canvas.height = ROWS * BLOCK;
    this.previewCanvas.width = 5 * PREVIEW_BLOCK;
    this.previewCanvas.height = 5 * PREVIEW_BLOCK;
  }

  randomPiece() {
    let type = PIECE_KEYS[Math.floor(Math.random() * PIECE_KEYS.length)];
    const previous = this.pieceHistory[this.pieceHistory.length - 1];
    const beforePrevious = this.pieceHistory[this.pieceHistory.length - 2];

    if (type === previous && type === beforePrevious) {
      const options = PIECE_KEYS.filter((key) => key !== type);
      type = options[Math.floor(Math.random() * options.length)];
    }

    this.pieceHistory.push(type);
    this.pieceHistory = this.pieceHistory.slice(-2);
    return createPiece(type);
  }

  restart() {
    this.board = createBoard();
    this.pieceHistory = [];
    this.active = this.randomPiece();
    this.next = this.randomPiece();
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.dropCounter = 0;
    this.lockDelay = LOCK_DELAY_MS;
    this.topOutTimer = 0;
    this.lastMoveWasRotate = false;
    this.riskRow = null;
    this.riskTimer = 4500;
    this.lastTime = 0;
    this.isGameOver = false;
    this.effects = {
      particles: [],
      rowFlashes: [],
      floatingTexts: [],
      shockwaves: [],
      boardShake: 0,
      screenFlash: 0
    };
    this.statusEl.textContent = "Stack carefully.";
    this.updateStats();
    this.draw();
  }

  loop(time = 0) {
    const delta = time - this.lastTime;
    this.lastTime = time;

    if (!this.isGameOver) {
      if (this.topOutTimer > 0) {
        this.updateTopOutGrace(delta);
      } else {
        this.dropCounter += delta;
        if (this.dropCounter > getDropInterval(this.level)) {
          this.stepDown("gravity");
        }
        this.updateLockDelay(delta);
        this.updateRiskRow(delta);
      }
    }

    this.updateEffects(delta / 1000);
    this.draw();
    this.animationId = requestAnimationFrame(this.loop);
  }

  handleKeyDown(event) {
    const activeElement = document.activeElement;
    if (activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName)) {
      return;
    }

    const handledKeys = ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " ", "Enter"];
    const wasdKeys = ["a", "d", "s", "w"];
    const key = event.key.toLowerCase();
    if (!handledKeys.includes(event.key) && !wasdKeys.includes(key)) return;

    event.preventDefault();
    this.audio.ensure();

    if (event.key === "Enter" && this.isGameOver) {
      this.restart();
      return;
    }

    if (this.isGameOver) return;

    if (event.key === "ArrowLeft" || key === "a") this.move(-1);
    if (event.key === "ArrowRight" || key === "d") this.move(1);
    if (event.key === "ArrowDown" || key === "s") this.firmDrop();
    if (event.key === "ArrowUp" || key === "w") this.rotate();
    if (event.key === " ") this.hardDrop();
  }

  move(direction) {
    this.active.x += direction;
    if (this.collides(this.active)) {
      this.active.x -= direction;
    } else {
      this.lastMoveWasRotate = false;
      this.refreshLockDelayIfGrounded();
      if (this.topOutTimer > 0 && !this.collides(this.active)) this.topOutTimer = 0;
      this.audio.move();
    }
  }

  softDrop(fromInput = false) {
    this.stepDown(fromInput ? "soft" : "gravity");
  }

  firmDrop() {
    let distance = 0;
    while (!this.collides({ ...this.active, y: this.active.y + 1 })) {
      this.active.y += 1;
      distance += 1;
    }
    if (distance > 0) {
      this.score += distance;
      this.updateStats();
      this.audio.drop();
    } else {
      this.audio.move();
    }
    const travelTime = Math.max(LOCK_DELAY_MS, distance * getDropInterval(this.level));
    this.lockDelay = Math.max(this.lockDelay, travelTime);
    this.dropCounter = 0;
  }

  stepDown(source = "gravity") {
    this.active.y += 1;
    if (this.collides(this.active)) {
      this.active.y -= 1;
      this.beginLockDelay(source);
    } else if (source === "soft") {
      this.score += 1;
      this.updateStats();
      this.audio.move();
    }
    this.dropCounter = 0;
  }

  beginLockDelay(source = "gravity") {
    if (this.lockDelay <= 0) {
      this.lockDelay = LOCK_DELAY_MS;
    }
    if (source === "soft") {
      this.lockDelay = Math.max(this.lockDelay, getDropInterval(this.level));
    }
  }

  updateLockDelay(delta) {
    if (!this.isGrounded()) {
      this.lockDelay = LOCK_DELAY_MS;
      return;
    }
    this.lockDelay -= delta;
    if (this.lockDelay <= 0) {
      this.lockPiece();
    }
  }

  refreshLockDelayIfGrounded() {
    if (this.isGrounded()) this.lockDelay = Math.max(this.lockDelay, LOCK_DELAY_MS);
  }

  isGrounded() {
    return this.collides({ ...this.active, y: this.active.y + 1 });
  }

  hardDrop() {
    let distance = 0;
    while (!this.collides({ ...this.active, y: this.active.y + 1 })) {
      this.active.y += 1;
      distance += 1;
    }
    this.score += distance * 2;
    this.lastMoveWasRotate = false;
    this.lockPiece();
    this.dropCounter = 0;
    this.audio.drop();
  }

  rotate() {
    const originalMatrix = this.active.matrix;
    const originalX = this.active.x;
    const rotated = rotateMatrix(this.active.matrix);
    const kicks = [0, -1, 1, -2, 2];

    this.active.matrix = rotated;
    for (const offset of kicks) {
      this.active.x = originalX + offset;
      if (!this.collides(this.active)) {
        this.lastMoveWasRotate = true;
        this.refreshLockDelayIfGrounded();
        if (this.topOutTimer > 0 && !this.collides(this.active)) this.topOutTimer = 0;
        this.audio.rotate();
        return;
      }
    }

    this.active.matrix = originalMatrix;
    this.active.x = originalX;
  }

  lockPiece() {
    const tSpin = this.isTSpin();
    this.active.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        const boardY = this.active.y + y;
        const boardX = this.active.x + x;
        if (boardY >= 0) {
          this.board[boardY][boardX] = this.active.color;
        }
      });
    });

    this.clearLines(tSpin);
    this.audio.lock();
    this.spawnPiece();
  }

  isTSpin() {
    if (this.active.type !== "T" || !this.lastMoveWasRotate) return false;
    const centerX = this.active.x + 1;
    const centerY = this.active.y + 1;
    const corners = [
      [centerX - 1, centerY - 1],
      [centerX + 1, centerY - 1],
      [centerX - 1, centerY + 1],
      [centerX + 1, centerY + 1]
    ];
    const occupied = corners.filter(([x, y]) => {
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y < 0) return false;
      return Boolean(this.board[y][x]);
    }).length;
    return occupied >= 3;
  }

  clearLines(tSpin = false) {
    let cleared = 0;
    const clearedRows = [];

    for (let y = ROWS - 1; y >= 0; y -= 1) {
      if (this.board[y].every(Boolean)) {
        clearedRows.push({ y, colors: [...this.board[y]] });
        this.board.splice(y, 1);
        this.board.unshift(Array(COLS).fill(null));
        cleared += 1;
        y += 1;
      }
    }

    if (cleared > 0) {
      const previousLevel = this.level;
      this.lines += cleared;
      const riskBonus = this.collectRiskRowBonus(clearedRows);
      const clearScore = cleared * cleared * 120 + this.level * 25;
      const tSpinScore = tSpin ? 450 + cleared * 260 + this.level * 45 : 0;
      this.score += clearScore + tSpinScore + riskBonus;
      this.level = Math.min(MAX_LEVEL, 1 + Math.floor(this.lines / LINES_PER_LEVEL));
      if (tSpin) this.audio.tSpin();
      this.statusEl.textContent = this.getClearMessage({ cleared, previousLevel, riskBonus, tSpin });
      this.audio.clear(cleared);
      this.spawnLineClearEffects(clearedRows, cleared, this.level > previousLevel, tSpin);
      if (riskBonus > 0) this.spawnRiskBonusText(riskBonus);
      if (this.level > previousLevel) this.audio.levelUp();
      this.updateStats();
    } else if (tSpin) {
      this.score += 250 + this.level * 35;
      this.audio.tSpin();
      this.spawnTSpinText();
      this.statusEl.textContent = "T-Spin setup. Clean.";
      this.updateStats();
    }
  }

  getClearMessage({ cleared, previousLevel, riskBonus, tSpin }) {
    if (riskBonus > 0) return `Risk row cleared! +${riskBonus.toLocaleString()}`;
    if (tSpin) return `T-Spin${cleared > 0 ? ` ${cleared}` : ""}! Huge bonus.`;
    if (this.level > previousLevel) return `Level ${this.level}. Faster now.`;
    return cleared === 1 ? "Line cleared." : `${cleared} lines cleared. Nice.`;
  }

  updateRiskRow(delta) {
    if (this.riskRow) {
      this.riskRow.time -= delta;
      if (this.riskRow.time <= 0) {
        this.riskRow = null;
        this.riskTimer = RISK_ROW_COOLDOWN_MS;
      }
      return;
    }
    this.riskTimer -= delta;
    if (this.riskTimer <= 0) {
      this.spawnRiskRow();
    }
  }

  spawnRiskRow() {
    const filledRows = this.board
      .map((row, y) => ({ y, filled: row.filter(Boolean).length }))
      .filter((row) => row.y >= 5 && row.filled >= 2 && row.filled <= 9);
    const candidates = filledRows.length
      ? filledRows
      : Array.from({ length: 10 }, (_, index) => ({ y: ROWS - 2 - index, filled: 0 }));
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    this.riskRow = {
      y: pick.y,
      time: RISK_ROW_DURATION_MS,
      maxTime: RISK_ROW_DURATION_MS
    };
    this.statusEl.textContent = "Risk row lit. Clear it for a bonus.";
  }

  collectRiskRowBonus(clearedRows) {
    if (!this.riskRow) return 0;
    const clearedRisk = clearedRows.some((row) => row.y === this.riskRow.y);
    if (clearedRisk) {
      const urgency = 1 - this.riskRow.time / this.riskRow.maxTime;
      const bonus = Math.round((450 + this.level * 90) * (1.15 + urgency * 0.85));
      this.riskRow = null;
      this.riskTimer = RISK_ROW_COOLDOWN_MS;
      return bonus;
    }
    const clearedBelow = clearedRows.filter((row) => row.y > this.riskRow.y).length;
    if (clearedBelow > 0) this.riskRow.y = Math.min(ROWS - 1, this.riskRow.y + clearedBelow);
    return 0;
  }

  spawnRiskBonusText(bonus) {
    this.effects.boardShake = Math.max(this.effects.boardShake, 16);
    this.effects.screenFlash = Math.max(this.effects.screenFlash, 0.5);
    this.effects.floatingTexts.push({
      text: `RISK +${bonus.toLocaleString()}`,
      x: COLS * BLOCK / 2,
      y: this.canvas.height * 0.42,
      vy: -46,
      life: 1.1,
      maxLife: 1.1,
      color: "#63e86b",
      size: 26
    });
  }

  spawnLineClearEffects(rows, cleared, leveledUp, tSpin = false) {
    const isTetris = cleared >= 4;
    this.effects.boardShake = Math.max(this.effects.boardShake, tSpin ? 22 : isTetris ? 18 : 6 + cleared * 3);
    this.effects.screenFlash = Math.max(this.effects.screenFlash, tSpin ? 0.82 : isTetris ? 0.75 : 0.28 + cleared * 0.08);

    rows.forEach((row, rowIndex) => {
      this.effects.rowFlashes.push({
        y: row.y,
        life: isTetris ? 0.62 : 0.42,
        maxLife: isTetris ? 0.62 : 0.42,
        color: tSpin ? "#f2d8ff" : isTetris ? "#f8fbff" : "#ffffff"
      });

      row.colors.forEach((color, x) => {
        const baseX = x * BLOCK + BLOCK / 2;
        const baseY = row.y * BLOCK + BLOCK / 2;
        const burst = isTetris ? 4 : 2;
        for (let i = 0; i < burst; i += 1) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (isTetris ? 160 : 95) + Math.random() * (isTetris ? 180 : 105);
          const life = 0.55 + Math.random() * (isTetris ? 0.65 : 0.4);
          this.effects.particles.push({
            x: baseX + (Math.random() - 0.5) * 10,
            y: baseY + (Math.random() - 0.5) * 10,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - (isTetris ? 65 : 25),
            size: 3 + Math.random() * (isTetris ? 7 : 5),
            color,
            life,
            maxLife: life,
            spin: (Math.random() - 0.5) * 9,
            rotation: Math.random() * Math.PI
          });
        }
      });

      if (isTetris || tSpin) {
        this.effects.shockwaves.push({
          x: COLS * BLOCK / 2,
          y: row.y * BLOCK + BLOCK / 2,
          radius: 10 + rowIndex * 4,
          life: 0.55,
          maxLife: 0.55
        });
      }
    });

    const label = tSpin ? `T-SPIN${cleared > 0 ? ` x${cleared}` : ""}!` : isTetris ? "TETRIS!" : cleared === 3 ? "TRIPLE!" : cleared === 2 ? "DOUBLE!" : "LINE!";
    this.effects.floatingTexts.push({
      text: leveledUp ? `${label} LEVEL UP` : label,
      x: COLS * BLOCK / 2,
      y: Math.max(52, Math.min(...rows.map((row) => row.y)) * BLOCK + 18),
      vy: -42,
      life: tSpin ? 1.35 : isTetris ? 1.15 : 0.85,
      maxLife: tSpin ? 1.35 : isTetris ? 1.15 : 0.85,
      color: tSpin ? "#f2d8ff" : isTetris ? "#f8fbff" : "#ffe45e",
      size: tSpin ? 31 : isTetris ? 30 : 22
    });
  }

  spawnTSpinText() {
    this.effects.boardShake = Math.max(this.effects.boardShake, 14);
    this.effects.screenFlash = Math.max(this.effects.screenFlash, 0.48);
    this.effects.floatingTexts.push({
      text: "T-SPIN!",
      x: COLS * BLOCK / 2,
      y: Math.max(64, this.active.y * BLOCK + 20),
      vy: -38,
      life: 1.05,
      maxLife: 1.05,
      color: "#f2d8ff",
      size: 29
    });
  }

  updateEffects(dt) {
    this.effects.boardShake = Math.max(0, this.effects.boardShake - dt * 42);
    this.effects.screenFlash = Math.max(0, this.effects.screenFlash - dt * 2.4);

    this.effects.rowFlashes = this.effects.rowFlashes.filter((flash) => {
      flash.life -= dt;
      return flash.life > 0;
    });

    this.effects.shockwaves = this.effects.shockwaves.filter((wave) => {
      wave.life -= dt;
      wave.radius += dt * 260;
      return wave.life > 0;
    });

    this.effects.floatingTexts = this.effects.floatingTexts.filter((text) => {
      text.life -= dt;
      text.y += text.vy * dt;
      text.vy *= Math.max(0, 1 - dt * 1.8);
      return text.life > 0;
    });

    this.effects.particles = this.effects.particles.filter((particle) => {
      particle.life -= dt;
      particle.vy += 460 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.rotation += particle.spin * dt;
      particle.vx *= Math.max(0, 1 - dt * 1.7);
      return particle.life > 0;
    });
  }

  spawnPiece() {
    this.active = this.next;
    this.active.x = Math.floor((COLS - this.active.matrix.length) / 2);
    this.active.y = -1;
    this.next = this.randomPiece();
    this.lockDelay = LOCK_DELAY_MS;
    this.lastMoveWasRotate = false;

    if (this.collides(this.active)) {
      this.topOutTimer = TOP_OUT_GRACE_MS;
      this.statusEl.textContent = "Danger. Move fast.";
    } else {
      this.topOutTimer = 0;
    }

    this.updateStats();
  }

  updateTopOutGrace(delta) {
    if (!this.collides(this.active)) {
      this.topOutTimer = 0;
      this.statusEl.textContent = "Escaped the crush.";
      return;
    }
    this.topOutTimer -= delta;
    if (this.topOutTimer <= 0) {
      this.isGameOver = true;
      this.statusEl.textContent = "Game over. Press restart or Enter.";
      this.audio.gameOver();
    }
  }

  collides(piece) {
    for (let y = 0; y < piece.matrix.length; y += 1) {
      for (let x = 0; x < piece.matrix[y].length; x += 1) {
        if (!piece.matrix[y][x]) continue;

        const boardX = piece.x + x;
        const boardY = piece.y + y;

        if (boardX < 0 || boardX >= COLS || boardY >= ROWS) {
          return true;
        }

        if (boardY >= 0 && this.board[boardY][boardX]) {
          return true;
        }
      }
    }
    return false;
  }

  updateStats() {
    this.scoreEl.textContent = this.score.toLocaleString();
    this.levelEl.textContent = this.level.toLocaleString();
    this.linesEl.textContent = this.lines.toLocaleString();
  }

  draw() {
    this.drawBoard();
    this.drawPreview();
  }

  drawBoard() {
    const shake = this.effects.boardShake;
    const shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const shakeY = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    this.ctx.save();
    this.ctx.translate(shakeX, shakeY);

    this.ctx.fillStyle = "#0b1020";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawGrid(this.ctx, COLS, ROWS, BLOCK);
    this.drawRiskRow();

    this.board.forEach((row, y) => {
      row.forEach((color, x) => {
        if (color) this.drawBlock(this.ctx, x, y, BLOCK, color);
      });
    });

    this.drawGhost();
    this.active.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          this.drawBlock(this.ctx, this.active.x + x, this.active.y + y, BLOCK, this.active.color);
        }
      });
    });

    this.drawLineClearEffects();

    if (this.isGameOver) {
      this.ctx.fillStyle = "rgba(7, 10, 20, 0.74)";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = "#ffffff";
      this.ctx.font = "700 26px system-ui, sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.fillText("Game Over", this.canvas.width / 2, this.canvas.height / 2 - 8);
      this.ctx.font = "500 14px system-ui, sans-serif";
      this.ctx.fillText("Press Enter or Restart", this.canvas.width / 2, this.canvas.height / 2 + 20);
    }
    this.ctx.restore();
  }

  drawLineClearEffects() {
    this.ctx.save();

    this.effects.rowFlashes.forEach((flash) => {
      const progress = 1 - flash.life / flash.maxLife;
      const alpha = Math.max(0, flash.life / flash.maxLife);
      const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, 0);
      gradient.addColorStop(0, "rgba(52, 214, 255, 0)");
      gradient.addColorStop(0.5, `rgba(255, 255, 255, ${0.78 * alpha})`);
      gradient.addColorStop(1, "rgba(255, 79, 125, 0)");
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(0, flash.y * BLOCK + 2, this.canvas.width, BLOCK - 4);
      this.ctx.fillStyle = `rgba(255, 228, 94, ${0.28 * alpha})`;
      this.ctx.fillRect(progress * this.canvas.width - 48, flash.y * BLOCK, 96, BLOCK);
    });

    this.effects.shockwaves.forEach((wave) => {
      const alpha = Math.max(0, wave.life / wave.maxLife);
      this.ctx.beginPath();
      this.ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = `rgba(248, 251, 255, ${0.72 * alpha})`;
      this.ctx.lineWidth = 3 + alpha * 4;
      this.ctx.stroke();
    });

    this.effects.particles.forEach((particle) => {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      this.ctx.save();
      this.ctx.translate(particle.x, particle.y);
      this.ctx.rotate(particle.rotation);
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = particle.color;
      this.ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
      this.ctx.fillStyle = `rgba(255, 255, 255, ${0.45 * alpha})`;
      this.ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, Math.max(1, particle.size * 0.28));
      this.ctx.restore();
    });

    this.effects.floatingTexts.forEach((text) => {
      const alpha = Math.max(0, text.life / text.maxLife);
      this.ctx.globalAlpha = alpha;
      this.ctx.textAlign = "center";
      this.ctx.font = `900 ${text.size}px system-ui, sans-serif`;
      this.ctx.lineWidth = 7;
      this.ctx.strokeStyle = "rgba(5, 8, 18, 0.8)";
      this.ctx.strokeText(text.text, text.x, text.y);
      this.ctx.fillStyle = text.color;
      this.ctx.fillText(text.text, text.x, text.y);
    });

    if (this.effects.screenFlash > 0) {
      this.ctx.globalAlpha = Math.min(0.38, this.effects.screenFlash);
      const flash = this.ctx.createRadialGradient(
        this.canvas.width / 2,
        this.canvas.height / 2,
        10,
        this.canvas.width / 2,
        this.canvas.height / 2,
        this.canvas.height * 0.64
      );
      flash.addColorStop(0, "rgba(255, 255, 255, 0.92)");
      flash.addColorStop(0.45, "rgba(52, 214, 255, 0.34)");
      flash.addColorStop(1, "rgba(255, 79, 125, 0)");
      this.ctx.fillStyle = flash;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    this.ctx.restore();
  }

  drawRiskRow() {
    if (!this.riskRow) return;
    const alpha = Math.max(0, this.riskRow.time / this.riskRow.maxTime);
    const y = this.riskRow.y * BLOCK;
    const pulse = 0.5 + Math.sin(performance.now() * 0.012) * 0.18;
    const gradient = this.ctx.createLinearGradient(0, y, this.canvas.width, y);
    gradient.addColorStop(0, `rgba(99, 232, 107, ${0.08 + pulse * 0.08})`);
    gradient.addColorStop(0.5, `rgba(255, 228, 94, ${0.18 + pulse * 0.15})`);
    gradient.addColorStop(1, `rgba(99, 232, 107, ${0.08 + pulse * 0.08})`);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, y + 1, this.canvas.width, BLOCK - 2);

    this.ctx.strokeStyle = `rgba(255, 228, 94, ${0.45 + alpha * 0.4})`;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(2, y + 2, this.canvas.width - 4, BLOCK - 4);

    this.ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + pulse * 0.35})`;
    const meterWidth = (this.canvas.width - 12) * alpha;
    this.ctx.fillRect(6, y + BLOCK - 5, meterWidth, 2);
  }

  drawGhost() {
    const ghost = {
      ...this.active,
      matrix: this.active.matrix
    };

    while (!this.collides({ ...ghost, y: ghost.y + 1 })) {
      ghost.y += 1;
    }

    this.ctx.save();
    this.ctx.globalAlpha = 0.25;
    ghost.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) this.drawBlock(this.ctx, ghost.x + x, ghost.y + y, BLOCK, "#ffffff");
      });
    });
    this.ctx.restore();
  }

  drawPreview() {
    this.previewCtx.fillStyle = "#0b1020";
    this.previewCtx.fillRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
    this.drawGrid(this.previewCtx, 5, 5, PREVIEW_BLOCK);

    const matrix = this.next.matrix;
    const offsetX = Math.floor((5 - matrix.length) / 2);
    const offsetY = Math.floor((5 - matrix.length) / 2);
    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          this.drawBlock(
            this.previewCtx,
            offsetX + x,
            offsetY + y,
            PREVIEW_BLOCK,
            this.next.color
          );
        }
      });
    });
  }

  drawGrid(ctx, cols, rows, size) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= cols; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * size + 0.5, 0);
      ctx.lineTo(x * size + 0.5, rows * size);
      ctx.stroke();
    }
    for (let y = 0; y <= rows; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * size + 0.5);
      ctx.lineTo(cols * size, y * size + 0.5);
      ctx.stroke();
    }
  }

  drawBlock(ctx, x, y, size, color) {
    if (y < 0) return;

    const inset = Math.max(2, Math.floor(size * 0.08));
    const px = x * size;
    const py = y * size;

    ctx.fillStyle = color;
    ctx.fillRect(px + inset, py + inset, size - inset * 2, size - inset * 2);

    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    ctx.fillRect(px + inset, py + inset, size - inset * 2, Math.max(3, size * 0.16));

    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fillRect(px + size - inset * 2, py + inset, inset, size - inset * 2);
    ctx.fillRect(px + inset, py + size - inset * 2, size - inset * 2, inset);
  }
}
