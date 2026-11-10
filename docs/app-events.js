// Explicit application lifecycle. Only state events are replayed to late subscribers.
const listeners = new Map(),
  latest = new Map();
const stateEvents = new Set(["session", "reports-loaded", "users-loaded"]);
export function emit(type, detail) {
  if (type === "session") {
    latest.delete("reports-loaded");
    latest.delete("users-loaded");
  }
  if (stateEvents.has(type)) latest.set(type, detail);
  for (const handler of [...(listeners.get(type) || [])])
    deliver(handler, detail);
}
function deliver(handler, detail) {
  try {
    Promise.resolve(handler(detail)).catch((error) =>
      console.error("SLG event handler failed", error),
    );
  } catch (error) {
    console.error("SLG event handler failed", error);
  }
}
export function on(type, handler) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  const handlers = listeners.get(type);
  handlers.add(handler);
  if (latest.has(type)) {
    const snapshot = latest.get(type);
    queueMicrotask(() => {
      if (handlers.has(handler) && latest.get(type) === snapshot)
        deliver(handler, snapshot);
    });
  }
  return () => handlers.delete(handler);
}
