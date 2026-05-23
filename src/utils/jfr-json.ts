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

export function getEventValues(ev: unknown): Record<string, unknown> {
  const e = ev as { values?: Record<string, unknown> };
  const v = e?.values;
  return v !== undefined && typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function toNumberLoose(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  if (raw && typeof raw === "object" && raw !== null) {
    const o = raw as { ticks?: unknown; value?: unknown; bits?: unknown };
    const t = o.ticks;
    if (typeof t === "number" && Number.isFinite(t)) return t;
    return toNumberLoose(o.value ?? o.bits);
  }
  return undefined;
}

export function getValuesNumber(values: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const hit = toNumberLoose(values[k]);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

export function parseIsoDurationMs(raw: unknown): number | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  const match = raw.match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (!match) return toNumberLoose(raw);
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  const seconds = match[3] ? Number(match[3]) : 0;
  const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
  return Number.isFinite(totalMs) ? totalMs : undefined;
}

export function getObjectClassName(values: Record<string, unknown>): string | undefined {
  const direct = getMonitorOrPathKey(values, ["objectClass", "class"]);
  if (direct) return direct;
  const object = values.object;
  if (object && typeof object === "object") {
    const typeName = getMonitorOrPathKey(object as Record<string, unknown>, ["type", "typeName", "name"]);
    if (typeName) return typeName;
  }
  return undefined;
}

export function stackSignature(frames: JfrFrame[] | undefined, depth = 8): string {
  if (!frames?.length) return "";
  return frames
    .slice(0, depth)
    .map((f) => getMethodKey(f))
    .filter(Boolean)
    .join(" <- ");
}

export function getMonitorOrPathKey(values: Record<string, unknown>, preferredKeys: string[]): string | undefined {
  for (const k of preferredKeys) {
    const val = values[k];
    if (typeof val === "string" && val.length > 0) return val;
    if (val && typeof val === "object") {
      const nm = val as { type?: unknown; typeName?: unknown; name?: unknown; string?: unknown };
      const tn = nm.typeName ?? nm.type ?? nm.name ?? nm.string;
      if (typeof tn === "string" && tn.length > 0) return tn.replace(/\//g, ".");
    }
  }
  return undefined;
}
