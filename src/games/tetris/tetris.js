const COLS = 10;
const ROWS = 20;
const BLOCK = 28;
const PREVIEW_BLOCK = 22;
const LINES_PER_LEVEL = 4;
const MAX_LEVEL = 20;

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
    this.lastTime = 0;
    this.isGameOver = false;
    this.animationId = null;

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
    this.lastTime = 0;
    this.isGameOver = false;
    this.statusEl.textContent = "Stack carefully.";
    this.updateStats();
    this.draw();
  }

  loop(time = 0) {
    const delta = time - this.lastTime;
    this.lastTime = time;

    if (!this.isGameOver) {
      this.dropCounter += delta;
      if (this.dropCounter > getDropInterval(this.level)) {
        this.softDrop();
      }
    }

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
    if (event.key === "ArrowDown" || key === "s") this.softDrop(true);
    if (event.key === "ArrowUp" || key === "w") this.rotate();
    if (event.key === " ") this.hardDrop();
  }

  move(direction) {
    this.active.x += direction;
    if (this.collides(this.active)) {
      this.active.x -= direction;
    } else {
      this.audio.move();
    }
  }

  softDrop(fromInput = false) {
    this.active.y += 1;
    if (this.collides(this.active)) {
      this.active.y -= 1;
      this.lockPiece();
    } else if (fromInput) {
      this.score += 1;
      this.updateStats();
      this.audio.move();
    }
    this.dropCounter = 0;
  }

  hardDrop() {
    let distance = 0;
    while (!this.collides({ ...this.active, y: this.active.y + 1 })) {
      this.active.y += 1;
      distance += 1;
    }
    this.score += distance * 2;
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
        this.audio.rotate();
        return;
      }
    }

    this.active.matrix = originalMatrix;
    this.active.x = originalX;
  }

  lockPiece() {
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

    this.clearLines();
    this.audio.lock();
    this.spawnPiece();
  }

  clearLines() {
    let cleared = 0;

    for (let y = ROWS - 1; y >= 0; y -= 1) {
      if (this.board[y].every(Boolean)) {
        this.board.splice(y, 1);
        this.board.unshift(Array(COLS).fill(null));
        cleared += 1;
        y += 1;
      }
    }

    if (cleared > 0) {
      const previousLevel = this.level;
      this.lines += cleared;
      this.score += cleared * cleared * 120 + this.level * 25;
      this.level = Math.min(MAX_LEVEL, 1 + Math.floor(this.lines / LINES_PER_LEVEL));
      this.statusEl.textContent =
        this.level > previousLevel
          ? `Level ${this.level}. Faster now.`
          : cleared === 1 ? "Line cleared." : `${cleared} lines cleared. Nice.`;
      this.audio.clear(cleared);
      if (this.level > previousLevel) this.audio.levelUp();
      this.updateStats();
    }
  }

  spawnPiece() {
    this.active = this.next;
    this.active.x = Math.floor((COLS - this.active.matrix.length) / 2);
    this.active.y = -1;
    this.next = this.randomPiece();

    if (this.collides(this.active)) {
      this.isGameOver = true;
      this.statusEl.textContent = "Game over. Press restart or Enter.";
      this.audio.gameOver();
    }

    this.updateStats();
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
    this.ctx.fillStyle = "#0b1020";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawGrid(this.ctx, COLS, ROWS, BLOCK);

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
