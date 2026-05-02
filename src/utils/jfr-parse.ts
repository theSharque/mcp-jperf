import { existsSync } from "node:fs";
import { runJfr } from "./jdk.js";
import { resolveProfilePath } from "./paths.js";
import { formatError } from "./errors.js";
import {
  getEvents,
  getEventType,
  getStackTrace,
  getMethodKey,
  getEventValues,
  getValuesNumber,
  getMonitorOrPathKey,
} from "./jfr-json.js";

export async function loadJfrEventList(
  filepathKey: string,
  eventsCsv: string
): Promise<{ eventsList: unknown[] } | string> {
  const filepath = resolveProfilePath(filepathKey);
  if (!existsSync(filepath)) {
    return formatError(
      `File not found: ${filepath}`,
      "FILE_NOT_FOUND",
      "Create a recording with start_profiling and stop_profiling."
    );
  }
  const output = await runJfr(["print", "--json", "--events", eventsCsv, filepath]);
  try {
    const parsed = JSON.parse(output);
    return { eventsList: getEvents(parsed) };
  } catch {
    return formatError("Failed to parse JFR JSON.", "PARSE_ERROR", "Ensure the .jfr file is valid.");
  }
}

export function emptyHintJfr(tool: string, events: string[]): string {
  return `No ${events.join(", ")} events in this recording for ${tool}. Use start_profiling with a preset or settingsFile (.jfc) that enables those events.`;
}

export function accumulateCumulativeForTypes(eventsList: unknown[], types: Set<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ev of eventsList) {
    const typ = getEventType(ev);
    if (!typ || !types.has(typ)) continue;
    const frames = getStackTrace(ev)?.frames ?? [];
    for (const f of frames) {
      const key = getMethodKey(f);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

export type TopEntry = { key: string; count: number };

export function topNFromMap(counts: Map<string, number>, topN: number): TopEntry[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([key, count]) => ({ key, count }));
}

export function accumulateSocketLikeEvents(eventsList: unknown[]): {
  eventCount: number;
  bytesTotal: number;
  byEndpoint: Map<string, number>;
} {
  let eventCount = 0;
  let bytesTotal = 0;
  const byEndpoint = new Map<string, number>();
  const typs = new Set(["jdk.SocketRead", "jdk.SocketWrite"]);

  for (const ev of eventsList) {
    const typ = getEventType(ev);
    if (!typ || !typs.has(typ)) continue;

    eventCount++;
    const values = getEventValues(ev);
    const bytes =
      getValuesNumber(values, ["bytesRead", "bytesWritten", "byteCount"]) ??
      getValuesNumber(values, ["size"]);
    bytesTotal += bytes ?? 0;

    const host = typeof values.host === "string" ? values.host : undefined;
    const port = typeof values.port === "number" ? values.port : toNumber(values.port as unknown);
    const addr = typeof values.address === "string" ? values.address : undefined;
    const ep =
      host !== undefined || port !== undefined
        ? `${host ?? "?"}:${port ?? "?"}`
        : addr && addr.length > 0
          ? addr
          : "(unknown)";
    byEndpoint.set(ep, (byEndpoint.get(ep) ?? 0) + 1);
  }

  return { eventCount, bytesTotal, byEndpoint };
}

export function accumulateFileIoEvents(eventsList: unknown[]): {
  eventCount: number;
  bytesTotal: number;
  byPath: Map<string, number>;
} {
  let eventCount = 0;
  let bytesTotal = 0;
  const byPath = new Map<string, number>();
  const typs = new Set(["jdk.FileRead", "jdk.FileWrite"]);

  for (const ev of eventsList) {
    const typ = getEventType(ev);
    if (!typ || !typs.has(typ)) continue;

    eventCount++;
    const values = getEventValues(ev);
    const bytes =
      getValuesNumber(values, ["bytesRead", "bytesWritten", "size", "length"]) ??
      getValuesNumber(values, ["byteCount"]);
    bytesTotal += bytes ?? 0;

    const pathKey =
      getMonitorOrPathKey(values, ["path"]) ??
      (typeof values.file === "string" ? values.file : "(unknown)");
    byPath.set(pathKey, (byPath.get(pathKey) ?? 0) + 1);
  }

  return { eventCount, bytesTotal, byPath };
}

function toNumber(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return undefined;
}

export function accumulateBlockedEvents(eventsList: unknown[]): Map<string, number> {
  const byMonitor = new Map<string, number>();

  for (const ev of eventsList) {
    if (getEventType(ev) !== "jdk.JavaMonitorBlocked") continue;

    const values = getEventValues(ev);
    const mk =
      getMonitorOrPathKey(values, ["monitorClass"]) ??
      getMonitorOrPathKey(values, ["class"]) ??
      "unknownMonitor";
    const duration = getValuesNumber(values, ["duration"]);

    const weight =
      typeof duration === "number" && duration > 0 ? duration : 1;
    const prev = byMonitor.get(mk) ?? 0;
    byMonitor.set(mk, prev + weight);
  }

  return byMonitor;
}
