import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const serverPath = join(root, "server.json");
const server = JSON.parse(readFileSync(serverPath, "utf8"));

server.version = pkg.version;
if (Array.isArray(server.packages) && server.packages[0]) {
  server.packages[0].version = pkg.version;
}

writeFileSync(serverPath, `${JSON.stringify(server, null, 2)}\n`, "utf8");
