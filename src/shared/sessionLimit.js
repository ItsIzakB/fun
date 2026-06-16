const SESSION_LIMIT_MS = 30 * 60 * 1000;
const STORAGE_KEY = "tinyArcade.dailyPlayLimit";
const EXPIRED_EVENT = "tiny-arcade-session-expired";

let timerId = null;
let lastTick = Date.now();
let lastTickDay = null;

function now() {
  return Date.now();
}

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readRecord() {
  try {
    const record = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    if (record?.day === todayKey() && Number.isFinite(record.usedMs)) {
      return {
        day: record.day,
        usedMs: clampUsage(record.usedMs)
      };
    }
  } catch {
    // Ignore malformed localStorage and start a fresh daily record.
  }

  return {
    day: todayKey(),
    usedMs: 0
  };
}

function clampUsage(usedMs) {
  return Math.max(0, Math.min(SESSION_LIMIT_MS, usedMs));
}

function writeRecord(record) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      day: record.day,
      usedMs: clampUsage(record.usedMs)
    })
  );
}

function addElapsedTime() {
  const current = now();
  const currentDay = todayKey();
  if (lastTickDay && lastTickDay !== currentDay) {
    lastTick = current;
    lastTickDay = currentDay;
    const record = { day: currentDay, usedMs: 0 };
    writeRecord(record);
    return record;
  }

  const elapsed = Math.max(0, current - lastTick);
  lastTick = current;
  lastTickDay = currentDay;

  const record = readRecord();
  if (record.usedMs >= SESSION_LIMIT_MS) return record;

  record.usedMs = clampUsage(record.usedMs + elapsed);
  writeRecord(record);
  return record;
}

export function getRemainingSessionMs() {
  return Math.max(0, SESSION_LIMIT_MS - readRecord().usedMs);
}

export function isSessionExpired() {
  return getRemainingSessionMs() <= 0;
}

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function updateTimerDisplays() {
  const record = addElapsedTime();
  const remaining = Math.max(0, SESSION_LIMIT_MS - record.usedMs);
  for (const element of document.querySelectorAll("[data-session-timer]")) {
    element.textContent = formatRemaining(remaining);
    element.toggleAttribute("data-low-time", remaining <= 5 * 60 * 1000);
  }
  if (remaining <= 0) {
    window.dispatchEvent(new CustomEvent(EXPIRED_EVENT));
  }
}

export function initSessionLimit(onExpire) {
  lastTick = now();
  lastTickDay = todayKey();
  writeRecord(readRecord());
  updateTimerDisplays();
  if (timerId) window.clearInterval(timerId);
  timerId = window.setInterval(updateTimerDisplays, 1000);
  window.addEventListener(EXPIRED_EVENT, onExpire);
}

export function renderTimeUp() {
  const shell = document.createElement("div");
  shell.className = "site-shell session-expired-shell";
  shell.innerHTML = `
    <main class="site-main" aria-label="Time up">
      <section class="empty-state session-expired">
        <p class="eyebrow">Session complete</p>
        <h1>Time's up for now.</h1>
        <p>
          Thanks for playing. This arcade has a daily limit of about 30 minutes,
          so the games are closed until tomorrow.
        </p>
      </section>
    </main>
  `;
  return shell;
}
