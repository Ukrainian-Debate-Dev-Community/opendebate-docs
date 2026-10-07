/* assert script: verifies dist/cab.html against the specs. Run after build:
   bun run build.ts && bun run check.ts */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = new URL(".", import.meta.url).pathname;
const html = readFileSync(join(ROOT, "dist", "cab.html"), "utf8");

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ok: ${msg}`);
  else { failures++; console.error(`FAIL: ${msg}`); }
}

function specIds(version: string): string[] {
  const dir = join(ROOT, "targets", "cab", version);
  const ids: string[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const spec = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (spec.kind === "swagger") for (const g of spec.groups) for (const r of g.rows) ids.push(r.id);
    else ids.push(spec.id);
  }
  return ids;
}

/* split the output into per-version board chunks */
function boardChunk(version: string): string {
  const marker = `<div class="board version" data-version="${version}"`;
  const start = html.indexOf(marker);
  if (start < 0) return "";
  const next = html.indexOf(`<div class="board version"`, start + marker.length);
  return next < 0 ? html.slice(start) : html.slice(start, next);
}

const v1 = boardChunk("v1");
const v2 = boardChunk("v2");
assert(v1.length > 0, "v1 board present");
assert(v2.length > 0, "v2 board present");

/* every spec id of each version appears in that version's board */
for (const [ver, chunk] of [["v1", v1], ["v2", v2]] as const) {
  const missing = specIds(ver).filter((id) => !chunk.includes(`data-id="${id}"`));
  assert(missing.length === 0, `${ver}: every spec id rendered${missing.length ? " — missing: " + missing.join(", ") : ""}`);
}

/* column count is computed and printed = 8 for both versions */
const counts = [...html.matchAll(/cab pages board — (\d+) columns/g)].map((m) => m[1]);
assert(counts.length === 2 && counts.every((c) => c === "8"), `header prints computed column count 8 for both versions (got: ${counts.join(", ")})`);

/* v1-only pages exist in v1 and not in v2 */
for (const id of ["own-compose", "own-sessions"]) {
  assert(v1.includes(`data-id="${id}"`), `v1 contains ${id}`);
  assert(!v2.includes(`data-id="${id}"`), `v2 does not contain ${id}`);
}

/* changelog lists them as removed in v2 */
const chlog = html.match(/<div class="chlog"><b>v2<\/b>[\s\S]*?<\/div>/)?.[0] ?? "";
const removed = chlog.match(/removed in v2:<\/span>([^·<]*)/)?.[1] ?? "";
for (const id of ["own-compose", "own-sessions", "mem-lists", "par-guest", "par-results", "jud-guest", "jud-reopen"]) {
  assert(removed.includes(id), `v2 changelog lists ${id} as removed`);
}
assert(/added in v2:<\/span>[^·<]*mem-members/.test(chlog), "v2 changelog lists mem-members as added");

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
