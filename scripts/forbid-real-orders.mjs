import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const forbidden = [
  "place_order",
  "modify_order",
  "cancel_order",
  "/order/create",
  "/order/modify",
  "/order/cancel",
  "smart_order",
  "smart-order",
  "smart_orders"
];

const ignoredDirectories = new Set([".git", "node_modules", "dist", ".wrangler", ".vite", "coverage"]);
const ignoredFiles = new Set([
  "scripts/forbid-real-orders.mjs",
  "docs/SECURITY.md",
  "docs/TERMS.md",
  "docs/ARCHITECTURE.md",
  "README.md"
]);

const findings = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const relativePath = relative(root, fullPath).replaceAll("\\", "/");
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (!ignoredDirectories.has(entry)) {
        walk(fullPath);
      }
      continue;
    }

    if (ignoredFiles.has(relativePath)) {
      continue;
    }

    const text = readFileSync(fullPath, "utf8");
    for (const needle of forbidden) {
      if (text.toLowerCase().includes(needle)) {
        findings.push(`${relativePath}: contains forbidden real-order API marker "${needle}"`);
      }
    }
  }
}

walk(root);

if (findings.length > 0) {
  console.error("Real-order API guard failed:");
  console.error(findings.map((finding) => `- ${finding}`).join("\n"));
  process.exit(1);
}

console.log("Real-order API guard passed.");
