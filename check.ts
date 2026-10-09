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
const v31 = boardChunk("v3.1");
const v32 = boardChunk("v3.2");
const v33 = boardChunk("v3.3");
assert(v1.length > 0, "v1 board present");
assert(v2.length > 0, "v2 board present");
assert(v21.length > 0, "v2.1 board present");
assert(v22.length > 0, "v2.2 board present");
assert(v23.length > 0, "v2.3 board present");
assert(v3.length > 0, "v3 board present");
assert(v31.length > 0, "v3.1 board present");
assert(v32.length > 0, "v3.2 board present");
assert(v33.length > 0, "v3.3 board present");

/* every spec id of each version appears in that version's board */
for (const [ver, chunk] of [["v1", v1], ["v2", v2], ["v2.1", v21], ["v2.2", v22], ["v2.3", v23], ["v3", v3], ["v3.1", v31], ["v3.2", v32], ["v3.3", v33]] as const) {
  const missing = specIds(ver).filter((id) => !chunk.includes(`data-id="${id}"`));
  assert(missing.length === 0, `${ver}: every spec id rendered${missing.length ? " — missing: " + missing.join(", ") : ""}`);
}

/* column count is computed and printed: 8 up to v3, 9 from v3.1 (the user column) */
const counts = [...html.matchAll(/cab pages board — (\d+) columns/g)].map((m) => m[1]);
assert(counts.join(",") === "8,8,8,8,8,8,9,9,9", `computed column counts per version (got: ${counts.join(", ")})`);

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

/* v3.1: the user step separates anonymous from signed-in; club standings get a page */
const colOrder31 = [...v31.matchAll(/data-col="([a-z-]+)"/g)].map((m) => m[1]);
assert(colOrder31.join(",") === "public,user,participant,judge,member,owner,admin,phoenix-api,engine-api",
  `v3.1 columns follow the 9-step ladder (got: ${colOrder31.join(",")})`);
for (const id of ["pub-club-standings", "user-join", "user-cabinet", "user-my-page", "user-account", "user-session"]) {
  assert(v31.includes(`data-id="${id}"`), `v3.1 contains ${id}`);
}
for (const id of ["pub-join", "mem-cabinet", "mem-my-page", "mem-account", "mem-session"]) {
  assert(!v31.includes(`data-id="${id}"`), `v3.1 no longer contains ${id}`);
}

/* v3.2: the board is rebuilt from the code — real routes, live pages, records-backed lists */
const v32pages = v32.split('data-col="phoenix-api"')[0];
for (const id of ["pub-privacy", "pub-error", "pub-session-signup", "pub-session-done", "pub-room", "pub-reg-done",
                  "user-reg", "par-session-signup", "jud-session", "own-sess-closed", "own-sess-done"]) {
  assert(v32.includes(`data-id="${id}"`), `v3.2 contains ${id}`);
}
for (const id of ["user-session", "par-room", "pub-standings-speakers", "pub-standings-judges"]) {
  assert(!v32.includes(`data-id="${id}"`), `v3.2 no longer contains ${id}`);
}
assert(!v32.includes("ENGINE-NEW"), "v3.2 carries no ENGINE-NEW placeholders");
assert(!/no-store|cached hard/.test(v32), "v3.2 makes no cache claims");
assert(v32.includes("ceil(speakers ÷ 8)") && v32.includes("Nobody is placed automatically"),
  "v3.2 states the automatic room count and manual placement");
assert(v32.includes("draft_allocation"), "v3.2 names the server-held allocator draft");
assert(/LIVE<\/span>/.test(v32), "v3.2 marks the LiveView pages");
assert(v32.includes("Privacy&amp;Policy") && v32.includes("ВМГО «Федерація Дебатів України»"), "v3.2 footer labels as built");
assert(!/unlock/i.test(v32pages), "v3.2 page columns never say unlock");
const golds32 = [...v32pages.matchAll(/<div class="page"[\s\S]*?(?=<div class="page"|<\/div>\n<div class="col|$)/g)]
  .filter((m) => (m[0].match(/class="go"/g) ?? []).length > 1).length;
assert(golds32 === 0, `v3.2 pages carry at most one gold action (offenders: ${golds32})`);

/* v3.3: role-less registration, one remove verb, public rosters, no middle dots */
const v33pages = v33.split('data-col="phoenix-api"')[0];
assert(!v33.replace(/<div class="chlog">[\s\S]*?<\/div>/g, "").replace(/<!--[\s\S]*?-->/g, "").includes("·"), "v3.3 carries no middle dots");
assert(v33.includes('data-id="pub-members"') && !v33.includes('data-id="mem-members"'), "v3.3 moves the roster to the public column");
assert(v33.includes("ceil(people ÷ 9)"), "v3.3 states the seat-based room count");
assert(!/I am tonight|Signed up as|Signs up to/.test(v33pages), "v3.3 pages ask no role at registration");
assert(v33pages.includes("Add a person") && v33pages.includes("People (14 people)"), "v3.3 owner page has one add form and one people table");
assert(!/revoke/i.test(v33pages), "v3.3 pages never say revoke");
assert(/SPK/.test(v33pages) && /ADJ/.test(v33pages), "v3.3 allocator tags placed chips SPK and ADJ");
assert(!v33.includes('data-id="api-link-del"'), "v3.3 drops the link delete endpoint");
const golds33 = v33pages.split('<div class="page"').slice(1).filter((pg) => (pg.match(/class="go"/g) ?? []).length > 1).length;
assert(golds33 === 0, `v3.3 pages carry at most one gold action (offenders: ${golds33})`);

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
