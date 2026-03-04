import { join } from "node:path";

export const RECORDINGS_DIR = join(process.cwd(), "recordings");
export const OLD_PROFILE_PATH = join(RECORDINGS_DIR, "old_profile.jfr");
export const NEW_PROFILE_PATH = join(RECORDINGS_DIR, "new_profile.jfr");

export function resolveProfilePath(filepath: string): string {
  const key = filepath.toLowerCase().replace(/\.jfr$/, "");
  if (key === "new_profile") return NEW_PROFILE_PATH;
  if (key === "old_profile") return OLD_PROFILE_PATH;
  return filepath;
}
