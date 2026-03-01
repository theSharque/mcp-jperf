/**
 * JFR JSON parsing utilities.
 * jfr print --json output format varies by JDK version:
 * - Newer format: recording.events[].values for event data; method.type is object with .name
 * - Legacy format: events[] at root; method.type as string
 */

export interface JfrFrame {
  method?: {
    type?: string | { name?: string };
    name?: string;
  };
}

/** Extract events from jfr print --json output. Supports recording.events and root events[]. */
export function getEvents(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  const rec = (parsed as { recording?: { events?: unknown[] } })?.recording;
  if (rec?.events) return rec.events;
  const ev = (parsed as { events?: unknown[] })?.events;
  return ev ?? [];
}

/** Get event type. */
export function getEventType(ev: unknown): string | undefined {
  const e = ev as { type?: string };
  return e?.type;
}

/** Get stackTrace from event. Handles ev.values.stackTrace (newer) and ev.stackTrace (legacy). */
export function getStackTrace(ev: unknown): { frames?: JfrFrame[] } | undefined {
  const e = ev as { stackTrace?: { frames?: JfrFrame[] }; values?: { stackTrace?: { frames?: JfrFrame[] } } };
  return e?.values?.stackTrace ?? e?.stackTrace;
}

/** Get class name from frame.method. Handles method.type as object (.name) or string. */
export function getMethodClassName(frame: JfrFrame): string {
  const m = frame?.method;
  if (!m) return "";
  const t = m.type;
  if (typeof t === "string") return t;
  return (t as { name?: string })?.name ?? "";
}

/** Get method name from frame.method */
export function getMethodName(frame: JfrFrame): string {
  return frame?.method?.name ?? "";
}

/** Full method key: className.methodName (class name normalized: / -> .) */
export function getMethodKey(frame: JfrFrame): string {
  const cls = getMethodClassName(frame).replace(/\//g, ".");
  const name = getMethodName(frame);
  return cls ? `${cls}.${name}` : name;
}
