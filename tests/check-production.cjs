const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const root = path.resolve("docs"),
  visited = new Set();
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
function inspect(file) {
  if (visited.has(file)) return;
  assert.ok(fs.existsSync(file), "Missing production asset: " + file);
  visited.add(file);
  if (!file.endsWith(".js")) return;
  const source = fs.readFileSync(file, "utf8");
  const check = spawnSync(
    process.execPath,
    ["--check", "--input-type=module"],
    { input: source, encoding: "utf8" },
  );
  assert.equal(check.status, 0, file + "\n" + check.stderr);
  for (const match of source.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g))
    inspect(path.resolve(path.dirname(file), match[1].split("?")[0]));
}
for (const match of html.matchAll(/(?:src|href)="\.\/([^"?]+)/g))
  inspect(path.join(root, match[1]));
console.log(
  "Production import/asset graph and syntax verified:",
  visited.size,
  "files",
);
