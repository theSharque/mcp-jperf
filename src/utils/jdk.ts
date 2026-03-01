import { execSync, spawn } from "node:child_process";

export interface JavaProcess {
  pid: number;
  mainClass: string;
  args: string;
}

/**
 * Run jps -l -m and parse output into structured process list.
 */
export function runJps(): JavaProcess[] {
  try {
    const output = execSync("jps -l -m", { encoding: "utf-8" });
    return parseJpsOutput(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`jps failed: ${message}. Ensure JDK is installed and in PATH.`, {
      cause: err,
    });
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
    const args = [String(pid), command, ...(options ?? [])];
    const output = execSync(`jcmd ${args.join(" ")}`, { encoding: "utf-8" });
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
    const child = spawn("jfr", args, { stdio: ["ignore", "pipe", "pipe"] });
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
      reject(new Error(`jfr not found: ${err.message}. Ensure JDK with JFR is in PATH.`, {
        cause: err,
      }));
    });
  });
}
