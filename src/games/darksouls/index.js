import { createShell } from "../../shared/layout.js";
import { BOSS_NAME, CONTROLS, WEAPONS } from "./config.js";
import { DarkSoulsGame } from "./darksouls.js";
import "./darksouls.css";

export function renderDarkSoulsPage() {
  const { shell, main } = createShell({ title: BOSS_NAME, showHomeLink: true });

  const controls = CONTROLS.map(
    ([key, label]) => `<div><dt>${key}</dt><dd>${label}</dd></div>`
  ).join("");
  const weapons = Object.entries(WEAPONS)
    .map(
      ([id, weapon]) => `
        <button class="weapon-choice" type="button" data-weapon="${id}">
          <strong>${weapon.label}</strong>
          <span>${weapon.description}</span>
        </button>
      `
    )
    .join("");

  main.innerHTML = `
    <section class="souls-page">
      <div class="game-title souls-title">
        <p class="eyebrow">Third trial</p>
        <h1>${BOSS_NAME}</h1>
        <p>A dark fantasy duel in cursed ruins. Read the wind-up, spend stamina carefully, and survive.</p>
      </div>

      <section class="souls-stage" data-souls-stage>
        <canvas class="souls-canvas" data-souls-canvas aria-label="${BOSS_NAME} game canvas"></canvas>

        <div class="souls-hud" aria-hidden="false">
          <div class="boss-hud">
            <span>${BOSS_NAME}</span>
            <div class="souls-bar souls-bar--boss">
              <i data-boss-hp></i>
              <b data-boss-shield></b>
            </div>
          </div>

          <div class="player-hud">
            <div class="souls-bar souls-bar--hp"><i data-player-hp></i></div>
            <div class="souls-bar souls-bar--stamina"><i data-player-stamina></i></div>
          </div>

          <aside class="souls-controls" aria-label="Controls">
            <h2>Controls</h2>
            <dl>${controls}</dl>
          </aside>

          <div class="souls-message" data-souls-message>Hold right mouse to block. Time it just before impact to parry.</div>
        </div>

        <div class="souls-end-screen" data-souls-end hidden>
          <div>
            <strong data-souls-end-title>YOU DIED</strong>
            <p data-souls-end-copy>The dungeon keeps what panic gives it.</p>
            <button class="button-link button-link--button" type="button" data-souls-retry>Try Again</button>
            <a class="button-link" href="/" data-link data-souls-home hidden>Return to Home</a>
          </div>
        </div>

        <div class="souls-weapon-screen" data-souls-weapon>
          <div>
            <p class="eyebrow">Choose your weapon</p>
            <h2>Steel decides your rhythm.</h2>
            <div class="weapon-choice-grid">${weapons}</div>
          </div>
        </div>
      </section>
    </section>
  `;

  const game = new DarkSoulsGame({
    stage: main.querySelector("[data-souls-stage]"),
    canvas: main.querySelector("[data-souls-canvas]"),
    hpBar: main.querySelector("[data-player-hp]"),
    staminaBar: main.querySelector("[data-player-stamina]"),
    bossHpBar: main.querySelector("[data-boss-hp]"),
    bossShieldBar: main.querySelector("[data-boss-shield]"),
    messageEl: main.querySelector("[data-souls-message]"),
    endScreen: main.querySelector("[data-souls-end]"),
    endTitle: main.querySelector("[data-souls-end-title]"),
    endCopy: main.querySelector("[data-souls-end-copy]"),
    retryButton: main.querySelector("[data-souls-retry]"),
    homeLink: main.querySelector("[data-souls-home]"),
    weaponScreen: main.querySelector("[data-souls-weapon]"),
    weaponButtons: main.querySelectorAll("[data-weapon]")
  });

  game.start();

  return {
    element: shell,
    cleanup: () => game.destroy()
  };
}
