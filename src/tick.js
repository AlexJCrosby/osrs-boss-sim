export function startTicker({ tickMs, onTick }) {
  const id = setInterval(onTick, tickMs);
  return { stop: () => clearInterval(id) };
}
