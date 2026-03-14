import { cp, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const repoRoot = process.cwd();
const sourceDir = path.join(repoRoot, "node_modules", "monaco-editor", "min", "vs");
const targetDir = path.join(repoRoot, "public", "monaco", "vs");

if (!existsSync(sourceDir)) {
  console.warn("[copy-monaco] monaco-editor not found, skip copying assets.");
  process.exit(0);
}

await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });
console.log("[copy-monaco] Monaco assets copied to public/monaco/vs");
