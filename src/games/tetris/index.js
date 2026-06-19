import { createShell } from "../../shared/layout.js";
import { TetrisGame } from "./tetris.js";
import "./tetris.css";

export function renderTetrisPage() {
  const { shell, main } = createShell({ title: "Tetris", showHomeLink: true });

  main.innerHTML = `
    <section class="tetris-page">
      <div class="game-title">
        <p class="eyebrow">First cabinet</p>
        <h1>Tetris</h1>
        <p>Classic falling blocks, crisp canvas rendering, and just enough pressure.</p>
      </div>

      <div class="tetris-layout">
        <section class="tetris-board-panel" aria-label="Tetris play field">
          <canvas class="tetris-canvas" data-tetris-board></canvas>
        </section>

        <aside class="tetris-sidebar" aria-label="Tetris game information">
          <section class="stat-panel">
            <div>
              <span>Score</span>
              <strong data-tetris-score>0</strong>
            </div>
            <div>
              <span>Level</span>
              <strong data-tetris-level>1</strong>
            </div>
            <div>
              <span>Lines</span>
              <strong data-tetris-lines>0</strong>
            </div>
          </section>

          <section class="next-panel">
            <h2>Next</h2>
            <canvas class="next-canvas" data-tetris-next></canvas>
          </section>

          <section class="controls-panel">
            <h2>Controls</h2>
            <dl>
              <div><dt>← / →</dt><dd>Move, or A / D</dd></div>
              <div><dt>↑</dt><dd>Rotate, or W</dd></div>
              <div><dt>↓</dt><dd>Floor drop, or S</dd></div>
              <div><dt>Space</dt><dd>Hard drop</dd></div>
              <div><dt>Enter</dt><dd>Restart after game over</dd></div>
            </dl>
          </section>

          <section class="game-actions">
            <p data-tetris-status>Stack carefully.</p>
            <button class="button-link button-link--button" type="button" data-tetris-restart>
              Restart
            </button>
          </section>
        </aside>
      </div>
    </section>
  `;

  const game = new TetrisGame({
    canvas: main.querySelector("[data-tetris-board]"),
    previewCanvas: main.querySelector("[data-tetris-next]"),
    scoreEl: main.querySelector("[data-tetris-score]"),
    levelEl: main.querySelector("[data-tetris-level]"),
    linesEl: main.querySelector("[data-tetris-lines]"),
    statusEl: main.querySelector("[data-tetris-status]"),
    restartButton: main.querySelector("[data-tetris-restart]")
  });

  game.start();

  return {
    element: shell,
    cleanup: () => game.destroy()
  };
}
