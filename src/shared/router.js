import { games, getGameByPath } from "./games.js";
import { createShell, renderNotFound } from "./layout.js";

let activeCleanup = null;

function cleanupCurrentPage() {
  if (typeof activeCleanup === "function") {
    activeCleanup();
  }
  activeCleanup = null;
}

function renderHome() {
  const { shell, main } = createShell({ title: "Tiny Arcade" });

  const cards = games
    .map(
      (game) => `
        <a class="game-card" href="${game.path}" data-link style="--accent:${game.accent}">
          <span class="game-card__icon" aria-hidden="true">${game.icon}</span>
          <span class="game-card__copy">
            <strong>${game.title}</strong>
            <span>${game.description}</span>
          </span>
        </a>
      `
    )
    .join("");

  main.innerHTML = `
    <section class="home-hero">
      <p class="eyebrow">Tiny browser games</p>
      <h1>Pick a little game. Lose a little afternoon.</h1>
      <p class="home-hero__lede">
        A growing arcade of bright, fast, low-friction web games built for quick breaks.
      </p>
    </section>
    <section class="game-grid" aria-label="Games">
      ${cards}
      <article class="game-card game-card--soon" aria-label="More games coming soon">
        <span class="game-card__icon" aria-hidden="true">＋</span>
        <span class="game-card__copy">
          <strong>Next up</strong>
          <span>Drop another game module into the hub when inspiration hits.</span>
        </span>
      </article>
    </section>
  `;

  return shell;
}

export function navigateTo(path) {
  window.history.pushState({}, "", path);
  renderRoute();
}

export function renderRoute() {
  cleanupCurrentPage();

  const app = document.querySelector("#app");
  const { pathname } = window.location;
  const game = getGameByPath(pathname);

  let page;
  if (pathname === "/") {
    page = renderHome();
  } else if (game) {
    const result = game.render();
    page = result.element;
    activeCleanup = result.cleanup;
  } else {
    page = renderNotFound();
  }

  app.replaceChildren(page);
  window.scrollTo({ top: 0, behavior: "instant" });
}

export function initRouter() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-link]");
    if (!link) return;

    const url = new URL(link.href);
    if (url.origin !== window.location.origin) return;

    event.preventDefault();
    navigateTo(url.pathname);
  });

  window.addEventListener("popstate", renderRoute);
  renderRoute();
}
