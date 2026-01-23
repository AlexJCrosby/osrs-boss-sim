// ===== Tick controller (supports slow-mo) =====
export function createTicker({ baseTickMs = 600, onTick }) {
  let tickMs = baseTickMs;
  let timerId = null;
  let running = false;

  function start() {
    if (running) return;
    running = true;
    timerId = setInterval(() => onTick(), tickMs);
  }

  function stop() {
    running = false;
    if (timerId !== null) clearInterval(timerId);
    timerId = null;
  }

  function setSpeedPercent(pct) {
    // pct: 25..100 (or wider if you want)
    const p = Math.max(5, Math.min(400, Number(pct) || 100));
    // 50% => tick is slower => tickMs doubles
    tickMs = baseTickMs / (p / 100);

    // If running, restart interval so it applies immediately
    if (running) {
      stop();
      start();
    }

    return { speedPercent: p, tickMs };
  }

  function getTickMs() {
    return tickMs;
  }

  return { start, stop, setSpeedPercent, getTickMs };
}
