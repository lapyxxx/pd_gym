import fs from "node:fs";
import path from "node:path";
import { collectLocalCodexThreads } from "./lib/local-codex-export-core.mjs";

const codexHome = process.argv[2];
const outputFile = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(process.cwd(), "local-codex-export.json");

const payload = collectLocalCodexThreads(codexHome);
fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));
console.log(`Exported ${payload.threads.length} local Codex threads to ${outputFile}`);
