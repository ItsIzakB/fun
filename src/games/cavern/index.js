import { createShell } from "../../shared/layout.js";
import { CavernGame } from "./cavern.js";
import "./cavern.css";

export function renderCavernPage() {
  const { shell, main } = createShell({ title: "Cavern Crafter", showHomeLink: true });

  main.innerHTML = `
    <section class="cavern-page">
      <div class="game-title cavern-title">
        <p class="eyebrow">Sandbox cabinet</p>
        <h1>Cavern Crafter</h1>
        <p>Explore a generated side-view world, carve tunnels, gather blocks, and build your way around.</p>
      </div>

      <div class="cavern-layout">
        <section class="cavern-stage" aria-label="Cavern Crafter play area">
          <canvas class="cavern-canvas" data-cavern-canvas></canvas>
        </section>

        <aside class="cavern-sidebar" aria-label="Cavern Crafter controls and inventory">
          <section class="cavern-panel">
            <h2>Status</h2>
            <div class="cavern-status">
              <span>Health</span>
              <strong data-cavern-health>100%</strong>
            </div>
          </section>

          <section class="cavern-panel">
            <h2>Inventory</h2>
            <div class="inventory-grid" data-cavern-inventory></div>
          </section>

          <section class="cavern-panel">
            <h2>Controls</h2>
            <dl class="cavern-controls">
              <div><dt>A / D</dt><dd>Move</dd></div>
              <div><dt>W / Space</dt><dd>Jump</dd></div>
              <div><dt>Click</dt><dd>Mine or bonk creatures</dd></div>
              <div><dt>Right click</dt><dd>Place selected</dd></div>
              <div><dt>1-5</dt><dd>Select block</dd></div>
            </dl>
          </section>

          <section class="cavern-panel cavern-actions">
            <p data-cavern-message>Mine with left click. Place with right click.</p>
            <button class="button-link button-link--button" type="button" data-cavern-reset>
              New world
            </button>
          </section>
        </aside>
      </div>
    </section>
  `;

  const game = new CavernGame({
    canvas: main.querySelector("[data-cavern-canvas]"),
    inventoryEl: main.querySelector("[data-cavern-inventory]"),
    messageEl: main.querySelector("[data-cavern-message]"),
    healthEl: main.querySelector("[data-cavern-health]"),
    resetButton: main.querySelector("[data-cavern-reset]")
  });

  game.start();

  return {
    element: shell,
    cleanup: () => game.destroy()
  };
}
