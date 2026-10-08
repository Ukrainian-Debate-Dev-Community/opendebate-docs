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
const v21 = boardChunk("v2.1");
const v22 = boardChunk("v2.2");
const v23 = boardChunk("v2.3");
const v3 = boardChunk("v3");
assert(v1.length > 0, "v1 board present");
assert(v2.length > 0, "v2 board present");
assert(v21.length > 0, "v2.1 board present");
assert(v22.length > 0, "v2.2 board present");
assert(v23.length > 0, "v2.3 board present");
assert(v3.length > 0, "v3 board present");

/* every spec id of each version appears in that version's board */
for (const [ver, chunk] of [["v1", v1], ["v2", v2], ["v2.1", v21], ["v2.2", v22], ["v2.3", v23], ["v3", v3]] as const) {
  const missing = specIds(ver).filter((id) => !chunk.includes(`data-id="${id}"`));
  assert(missing.length === 0, `${ver}: every spec id rendered${missing.length ? " — missing: " + missing.join(", ") : ""}`);
}

/* column count is computed and printed = 8 for every version */
const counts = [...html.matchAll(/cab pages board — (\d+) columns/g)].map((m) => m[1]);
assert(counts.length === 6 && counts.every((c) => c === "8"), `header prints computed column count 8 for all six versions (got: ${counts.join(", ")})`);

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

/* v2.1: ballot correction = unlock + resubmit, reopen gone everywhere */
const chlog21 = html.match(/<div class="chlog"><b>v2.1<\/b>[\s\S]*?<\/div>/)?.[0] ?? "";
const changed21 = chlog21.match(/changed in v2.1:<\/span>([^·<]*)/)?.[1] ?? "";
for (const id of ["own-sess-run", "jud-ballot", "engine-api", "phoenix-api"]) {
  assert(changed21.includes(id), `v2.1 changelog lists ${id} as changed`);
}
assert(v21.includes("/rooms/:id/unlock"), "v2.1 documents the unlock route");
/* the only reopen left is sign-up registration and the "no reopen" explainer */
const scrubbed = v21
  .replace(/api-reopen-reg/g, "")
  .replace(/reopen-registration/g, "")
  .replace(/Reopen registration/g, "")
  .replace(/reopens public registration/g, "")
  .replace(/no reopen:/g, "");
assert(!/reopen/i.test(scrubbed), "v2.1 has no ballot reopen left");

/* v2.2: edit ballot is the only user-facing verb — lock/unlock never
   appears outside the engine-api column (internal) */
const chlog22 = html.match(/<div class="chlog"><b>v2.2<\/b>[\s\S]*?<\/div>/)?.[0] ?? "";
const changed22 = chlog22.match(/changed in v2.2:<\/span>([^·<]*)/)?.[1] ?? "";
for (const id of ["own-sess-run", "jud-ballot", "phoenix-api"]) {
  assert(changed22.includes(id), `v2.2 changelog lists ${id} as changed`);
}
assert(/column conditions changed/.test(chlog22), "v2.2 changelog flags the ladder column conditions");
assert(v22.includes("edit ballot"), "v2.2 shows the edit ballot verb");
assert(!/unlock/i.test(v22), "v2.2 never says unlock");
const v22cab = v22.split('data-col="engine-api"')[0];
assert(!/unconfirm/i.test(v22cab.replace(/cab unconfirms as head first \(internal, never a page verb\)/g, "")),
  "v2.2 keeps unconfirm out of the page columns (internal note aside)");

/* the columns render in ladder order, weakest first */
const colOrder = [...v22.matchAll(/data-col="([a-z-]+)"/g)].map((m) => m[1]);
assert(colOrder.join(",") === "public,participant,judge,member,owner,admin,phoenix-api,engine-api",
  `v2.2 columns follow the ladder (got: ${colOrder.join(",")})`);

/* v2.3: the notes round — pages re-homed, my page split out, honest navs */
for (const id of ["pub-join", "mem-my-page", "mem-account"]) {
  assert(v23.includes(`data-id="${id}"`), `v2.3 contains ${id}`);
}
for (const id of ["mem-join", "adm-account"]) {
  assert(!v23.includes(`data-id="${id}"`), `v2.3 no longer contains ${id}`);
}
const chlog23 = html.match(/<div class="chlog"><b>v2.3<\/b>[\s\S]*?<\/div>/)?.[0] ?? "";
for (const id of ["pub-join", "mem-my-page", "mem-account"]) {
  assert(new RegExp(`added in v2.3:</span>[^·<]*${id}`).test(chlog23), `v2.3 changelog adds ${id}`);
}
for (const id of ["mem-join", "adm-account"]) {
  assert(new RegExp(`removed in v2.3:</span>[^·<]*${id}`).test(chlog23), `v2.3 changelog removes ${id}`);
}
assert(v23.includes("Register") && v23.includes("My page"), "v2.3 navs carry Register and My page");
assert(v23.includes("GDPR concerns → support@uadebate.com"), "v2.3 front page renders the footer example");

/* v3: two trees — no per-role route spellings anywhere in the page columns */
const v3pages = v3.split('data-col="phoenix-api"')[0];
for (const bad of ["/member/", "/participant/", "/judge/r", "/owner/rooms/"]) {
  assert(!v3pages.includes(bad), `v3 pages carry no ${bad} route`);
}
assert(v3.includes("/c/:club/s/:sess/rooms/:id"), "v3 has the one room URL");
assert(v3.includes("PREFILLED"), "v3 states the prefilled ballot edit");
assert(v3.includes("QR of /r/:sess"), "v3 puts the registration QR on the session page");
const v3navItems = [...v3pages.matchAll(/<nav class="nav">[\s\S]*?<\/nav>/g)].join("");
assert(!/href="#">Sessions</.test(v3navItems), "v3 navs dropped the Sessions item (club page is the archive)");
assert(v3.includes("no-store") && v3.includes("cached hard"), "v3 states the cache rule");
assert(v3.includes("engine_round_id"), "v3 notes the stored round id + concurrent reads");

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
