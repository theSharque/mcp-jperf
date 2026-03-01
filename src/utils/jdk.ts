import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface JavaProcess {
  pid: number;
  mainClass: string;
  args: string;
}

let _jdkBin: string | null = null;

/** Resolve path to JDK bin (jps, jcmd, jfr). Uses JAVA_HOME or derives from java. */
function getJdkBin(): string {
  if (_jdkBin) return _jdkBin;

  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    const bin = join(javaHome, "bin");
    if (existsSync(join(bin, "jps"))) {
      _jdkBin = bin;
      return bin;
    }
  }

  try {
    const javaPath = execSync("which java 2>/dev/null || command -v java", {
      encoding: "utf-8",
    }).trim();
    if (javaPath) {
      const bin = join(javaPath, "..");
      if (existsSync(join(bin, "jps"))) {
        _jdkBin = bin;
        return bin;
      }
    }
  } catch {
    // ignore
  }

  _jdkBin = "";
  return "";
}

function jdkCmd(name: string): string {
  const bin = getJdkBin();
  return bin ? join(bin, name) : name;
}

/**
 * Run jps -l -m and parse output into structured process list.
 */
export function runJps(): JavaProcess[] {
  try {
    const jpsPath = jdkCmd("jps");
    const output = execSync(`"${jpsPath}" -l -m`, { encoding: "utf-8" });
    return parseJpsOutput(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = process.env.JAVA_HOME
      ? "Check that JAVA_HOME points to a valid JDK (not JRE) with bin/jps."
      : "Set JAVA_HOME to JDK root, or add JDK bin to PATH.";
    throw new Error(`jps failed: ${message}. ${hint}`, { cause: err });
  }
}

function parseJpsOutput(output: string): JavaProcess[] {
  const lines = output.trim().split("\n").filter(Boolean);
  const result: JavaProcess[] = [];

  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;

    const pid = parseInt(match[1], 10);
    const rest = match[2].trim();
    if (rest === "Jps") continue;

    const spaceIdx = rest.indexOf(" ");
    let mainClass: string;
    let args: string;
    if (spaceIdx >= 0) {
      mainClass = rest.slice(0, spaceIdx);
      args = rest.slice(spaceIdx + 1);
    } else {
      mainClass = rest;
      args = "";
    }

    result.push({ pid, mainClass, args });
  }

  return result;
}

/**
 * Run jcmd with given pid and command.
 */
export function runJcmd(pid: number, command: string, options?: string[]): string {
  try {
    const jcmdPath = jdkCmd("jcmd");
    const args = [String(pid), command, ...(options ?? [])];
    const output = execSync(`"${jcmdPath}" ${args.join(" ")}`, { encoding: "utf-8" });
    return output;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Process") && message.includes("not found")) {
      throw new Error(`Process ${pid} not found. Use list_java_processes to get valid PIDs.`, {
        cause: err,
      });
    }
    if (message.includes("Permission denied")) {
      throw new Error(`Permission denied accessing process ${pid}. Run with same user as target JVM.`, {
        cause: err,
      });
    }
    throw new Error(`jcmd failed: ${message}`, { cause: err });
  }
}

/**
 * Run jfr command (print, summary, etc.) and return stdout.
 */
export function runJfr(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const jfrPath = jdkCmd("jfr");
    const child = spawn(jfrPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
    child.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`jfr exited ${code}: ${stderr || stdout}`));
      } else {
        resolve(stdout);
      }
    });

    child.on("error", (err) => {
      const hint = process.env.JAVA_HOME
        ? "Check that JAVA_HOME points to JDK (jfr is in JDK 9+)."
        : "Set JAVA_HOME or add JDK bin to PATH.";
      reject(new Error(`jfr not found: ${err.message}. ${hint}`, { cause: err }));
    });
  });
}
