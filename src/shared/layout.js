export function createShell({ title = "Tiny Arcade", showHomeLink = false } = {}) {
  const shell = document.createElement("div");
  shell.className = "site-shell";

  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <a class="brand" href="/" data-link aria-label="Tiny Arcade home">
      <span class="brand-mark" aria-hidden="true">✦</span>
      <span>Tiny Arcade</span>
    </a>
    <nav class="site-nav" aria-label="Primary">
      <span class="session-timer" aria-label="Session time remaining">
        <span>Time</span>
        <strong data-session-timer>30:00</strong>
      </span>
      ${showHomeLink ? '<a href="/" data-link>Back to home</a>' : ""}
    </nav>
  `;

  const main = document.createElement("main");
  main.className = "site-main";
  main.setAttribute("aria-label", title);

  shell.append(header, main);
  return { shell, main };
}

export function renderNotFound() {
  const { shell, main } = createShell({ title: "Page not found", showHomeLink: true });
  main.innerHTML = `
    <section class="empty-state">
      <p class="eyebrow">404</p>
      <h1>That game wandered off.</h1>
      <p>The arcade does not have this page yet.</p>
      <a class="button-link" href="/" data-link>Return home</a>
    </section>
  `;
  return shell;
}
