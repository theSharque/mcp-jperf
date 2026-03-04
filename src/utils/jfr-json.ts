export interface JfrFrame {
  method?: {
    type?: string | { name?: string };
    name?: string;
  };
}

export function getEvents(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  const rec = (parsed as { recording?: { events?: unknown[] } })?.recording;
  if (rec?.events) return rec.events;
  const ev = (parsed as { events?: unknown[] })?.events;
  return ev ?? [];
}

export function getEventType(ev: unknown): string | undefined {
  const e = ev as { type?: string };
  return e?.type;
}

export function getStackTrace(ev: unknown): { frames?: JfrFrame[] } | undefined {
  const e = ev as { stackTrace?: { frames?: JfrFrame[] }; values?: { stackTrace?: { frames?: JfrFrame[] } } };
  return e?.values?.stackTrace ?? e?.stackTrace;
}

export function getMethodClassName(frame: JfrFrame): string {
  const m = frame?.method;
  if (!m) return "";
  const t = m.type;
  if (typeof t === "string") return t;
  return (t as { name?: string })?.name ?? "";
}

export function getMethodName(frame: JfrFrame): string {
  return frame?.method?.name ?? "";
}

export function getMethodKey(frame: JfrFrame): string {
  const cls = getMethodClassName(frame).replace(/\//g, ".");
  const name = getMethodName(frame);
  return cls ? `${cls}.${name}` : name;
}
