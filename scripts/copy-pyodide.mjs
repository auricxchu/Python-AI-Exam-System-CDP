import { cp, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const repoRoot = process.cwd();
const sourceDir = path.join(repoRoot, "node_modules", "pyodide");
const targetDir = path.join(repoRoot, "public", "pyodide");

if (!existsSync(sourceDir)) {
  console.warn("[copy-pyodide] pyodide not found, skip copying assets.");
  process.exit(0);
}

await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });
console.log("[copy-pyodide] Pyodide assets copied to public/pyodide");
