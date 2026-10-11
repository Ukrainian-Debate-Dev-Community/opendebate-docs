/* assert script: verifies dist/index.html against the specs. Run after build:
   bun run build.ts && bun run check.ts */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const ROOT = new URL(".", import.meta.url).pathname;
const html = readFileSync(join(ROOT, "dist", "index.html"), "utf8");
// what people read: the page without its inlined styles, font and script
const visible = html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script>[\s\S]*?<\/script>/g, "");

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ok: ${msg}`);
  else { failures++; console.error(`FAIL: ${msg}`); }
}

function specFiles(platform: string, version: string): { file: string; spec: any }[] {
  const dir = join(ROOT, "targets", platform, version);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => ({ file: f, spec: JSON.parse(readFileSync(join(dir, f), "utf8")) }));
}
function specIds(platform: string, version: string): string[] {
  return specFiles(platform, version).flatMap(({ spec }) =>
    spec.kind === "swagger" ? spec.groups.flatMap((g: any) => g.rows.map((r: any) => r.id)) : [spec.id]);
}
function versionsOf(platform: string): string[] {
  const dir = join(ROOT, "targets", platform);
  return readdirSync(dir).filter((d) => /^v\d+(\.\d+)?$/.test(d));
}

/* one platform+version: its <section> */
function chunk(platform: string, version: string): string {
  const marker = `data-platform="${platform}" data-version="${version}"`;
  const start = html.indexOf(marker);
  if (start < 0) return "";
  return html.slice(start, html.indexOf("</section>", start));
}
const chlogOf = (c: string) => c.match(/<div class="chlog">[\s\S]*?<\/div>/)?.[0] ?? "";
const listed = (log: string, label: string) =>
  log.match(new RegExp(`>${label}</span>([^<]*)`))?.[1] ?? "";
const pagesOf = (c: string) => c.split('data-col="phoenix-api"')[0];
const pageChunk = (pages: string, id: string) => pages.split(`data-id="${id}"`)[1]?.split('<div class="page"')[0] ?? "";
const goldOffenders = (pages: string) =>
  pages.split('<div class="page"').slice(1).filter((pg) => (pg.match(/class="go"/g) ?? []).length > 1).length;

/* ---------- the workbench: one page, two switches ---------- */
assert(!existsSync(join(ROOT, "dist", "cab.html")), "one page: dist/cab.html is no longer written");
const pfSwitch = visible.match(/<div class="wb-seg" id="platform"[\s\S]*?<\/div>/)?.[0] ?? "";
assert(pfSwitch.includes('data-platform="cab"') && pfSwitch.includes('data-platform="uadebate"'), "platform switch offers cab and uadebate");
assert(pfSwitch.includes(">main (uadebate.com)</button>"), "the uadebate platform is labelled main (uadebate.com)");
assert(/<select id="version"[^>]*>[\s\S]*?<option value="v3.8"[^>]*selected/.test(visible), "version switch present, cab v3.8 selected by default");
assert(!/data-platform="dfu"/.test(html), "dfu has no versions and is left out");
for (const [pf, v] of [["cab", "v3.8"], ["uadebate", "v1"]]) {
  assert(chunk(pf, v).length > 0, `${pf} ${v} board present`);
}
const versionsInPage = [...html.matchAll(/<section class="version[^"]*" data-platform="([^"]+)" data-version="([^"]+)"/g)].map((m) => `${m[1]}/${m[2]}`);
const versionsOnDisk = ["cab", "uadebate"].flatMap((pf) => versionsOf(pf).map((v) => `${pf}/${v}`));
assert(versionsOnDisk.every((v) => versionsInPage.includes(v)) && versionsInPage.length === versionsOnDisk.length,
  `every platform+version on disk has exactly one board (${versionsInPage.length})`);

/* no planning-era markers anywhere people read */
const milestones = [...visible.matchAll(/\b(?:M\d+[a-z]?|L\d)\b|launch-timeline|specced|not yet built|class="m8b"/g)].map((m) => m[0]);
assert(milestones.length === 0, `no milestone or M8b markers in the page${milestones.length ? " — found: " + [...new Set(milestones)].join(", ") : ""}`);
const chromeText = visible.replace(/<section[\s\S]*?<\/section>/g, "");
assert(!chromeText.includes("·"), "the workbench chrome carries no middle dots");

/* every spec id is rendered, and ids are unique within a platform+version */
for (const pf of ["cab", "uadebate"]) {
  for (const ver of versionsOf(pf)) {
    const c = chunk(pf, ver);
    const missing = specIds(pf, ver).filter((id) => !c.includes(`data-id="${id}"`));
    assert(missing.length === 0, `${pf} ${ver}: every spec id rendered${missing.length ? " — missing: " + missing.join(", ") : ""}`);
    const ids = [...c.matchAll(/ data-id="([^"]+)"/g)].map((m) => m[1]);
    const dups = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    assert(dups.length === 0, `${pf} ${ver}: page ids unique${dups.length ? " — repeated: " + dups.join(", ") : ""}`);
  }
}

/* ---------- cab history ---------- */
const v = (ver: string) => chunk("cab", ver);
const [v1, v2, v21, v22, v23, v3, v31, v32, v33, v34, v35, v36, v37, v38] =
  ["v1", "v2", "v2.1", "v2.2", "v2.3", "v3", "v3.1", "v3.2", "v3.3", "v3.4", "v3.5", "v3.6", "v3.7", "v3.8"].map(v);

/* column count is computed and printed: 8 up to v3, 9 from v3.1 (the user column) */
const counts = ["v1", "v2", "v2.1", "v2.2", "v2.3", "v3", "v3.1", "v3.2", "v3.3", "v3.4", "v3.5", "v3.6", "v3.7", "v3.8"]
  .map((ver) => v(ver).match(/<p class="vsub">(\d+) columns?/)?.[1]);
assert(counts.join(",") === "8,8,8,8,8,8,9,9,9,9,9,9,9,9", `computed column counts per version (got: ${counts.join(", ")})`);

/* v1-only pages exist in v1 and not in v2; the v2 changelog compares with v1 */
for (const id of ["own-compose", "own-sessions"]) {
  assert(v1.includes(`data-id="${id}"`), `v1 contains ${id}`);
  assert(!v2.includes(`data-id="${id}"`), `v2 does not contain ${id}`);
}
const chlog2 = chlogOf(v2);
assert(chlog2.includes("Compared with v1"), "v2 changelog compares with v1");
for (const id of ["own-compose", "own-sessions", "mem-lists", "par-guest", "par-results", "jud-guest", "jud-reopen"]) {
  assert(listed(chlog2, "Removed").includes(id), `v2 changelog lists ${id} as removed`);
}
assert(listed(chlog2, "Added").includes("mem-members"), "v2 changelog lists mem-members as added");

/* v2.1: ballot correction = unlock + resubmit, reopen gone everywhere */
for (const id of ["own-sess-run", "jud-ballot", "engine-api", "phoenix-api"]) {
  assert(listed(chlogOf(v21), "Changed").includes(id), `v2.1 changelog lists ${id} as changed`);
}
assert(v21.includes("/rooms/:id/unlock"), "v2.1 documents the unlock route");
const scrubbed = v21
  .replace(/api-reopen-reg/g, "")
  .replace(/reopen-registration/g, "")
  .replace(/Reopen registration/g, "")
  .replace(/reopens public registration/g, "")
  .replace(/no reopen:/g, "");
assert(!/reopen/i.test(scrubbed), "v2.1 has no ballot reopen left");

/* v2.2: edit ballot is the only user-facing verb */
for (const id of ["own-sess-run", "jud-ballot", "phoenix-api"]) {
  assert(listed(chlogOf(v22), "Changed").includes(id), `v2.2 changelog lists ${id} as changed`);
}
assert(chlogOf(v22).includes("Column conditions changed"), "v2.2 changelog flags the ladder column conditions");
assert(v22.includes("edit ballot"), "v2.2 shows the edit ballot verb");
assert(!/unlock/i.test(v22), "v2.2 never says unlock");
const v22cab = v22.split('data-col="engine-api"')[0];
assert(!/unconfirm/i.test(v22cab.replace(/cab unconfirms as head first \(internal, never a page verb\)/g, "")),
  "v2.2 keeps unconfirm out of the page columns (internal note aside)");
const colOrder = [...v22.matchAll(/data-col="([a-z-]+)"/g)].map((m) => m[1]);
assert(colOrder.join(",") === "public,participant,judge,member,owner,admin,phoenix-api,engine-api",
  `v2.2 columns follow the ladder (got: ${colOrder.join(",")})`);

/* v2.3: the notes round */
for (const id of ["pub-join", "mem-my-page", "mem-account"]) {
  assert(v23.includes(`data-id="${id}"`), `v2.3 contains ${id}`);
  assert(listed(chlogOf(v23), "Added").includes(id), `v2.3 changelog adds ${id}`);
}
for (const id of ["mem-join", "adm-account"]) {
  assert(!v23.includes(`data-id="${id}"`), `v2.3 no longer contains ${id}`);
  assert(listed(chlogOf(v23), "Removed").includes(id), `v2.3 changelog removes ${id}`);
}
assert(v23.includes("Register") && v23.includes("My page"), "v2.3 navs carry Register and My page");
assert(v23.includes("GDPR concerns → support@uadebate.com"), "v2.3 front page renders the footer example");

/* v3: two trees */
const v3pages = pagesOf(v3);
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

/* v3.1: the user step */
const colOrder31 = [...v31.matchAll(/data-col="([a-z-]+)"/g)].map((m) => m[1]);
assert(colOrder31.join(",") === "public,user,participant,judge,member,owner,admin,phoenix-api,engine-api",
  `v3.1 columns follow the 9-step ladder (got: ${colOrder31.join(",")})`);
for (const id of ["pub-club-standings", "user-join", "user-cabinet", "user-my-page", "user-account", "user-session"]) {
  assert(v31.includes(`data-id="${id}"`), `v3.1 contains ${id}`);
}
for (const id of ["pub-join", "mem-cabinet", "mem-my-page", "mem-account", "mem-session"]) {
  assert(!v31.includes(`data-id="${id}"`), `v3.1 no longer contains ${id}`);
}

/* v3.2: rebuilt from the code */
const v32pages = pagesOf(v32);
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
assert(/<span class="live">LIVE<\/span>/.test(v32), "v3.2 marks the LiveView pages");
assert(v32.includes("Privacy&amp;Policy") && v32.includes("ВМГО «Федерація Дебатів України»"), "v3.2 footer labels as built");
assert(!/unlock/i.test(v32pages), "v3.2 page columns never say unlock");
assert(goldOffenders(v32pages) === 0, `v3.2 pages carry at most one gold action (offenders: ${goldOffenders(v32pages)})`);

/* v3.3: role-less registration, one remove verb, public rosters */
const v33pages = pagesOf(v33);
assert(!v33.replace(/<!--[\s\S]*?-->/g, "").includes("·"), "v3.3 carries no middle dots");
assert(v33.includes('data-id="pub-members"') && !v33.includes('data-id="mem-members"'), "v3.3 moves the roster to the public column");
assert(v33.includes("ceil(people ÷ 9)"), "v3.3 states the seat-based room count");
assert(!/I am tonight|Signed up as|Signs up to/.test(v33pages), "v3.3 pages ask no role at registration");
assert(v33pages.includes("Add a person") && v33pages.includes("People (14 people)"), "v3.3 owner page has one add form and one people table");
assert(!/revoke/i.test(v33pages), "v3.3 pages never say revoke");
assert(/SPK/.test(v33pages) && /ADJ/.test(v33pages), "v3.3 allocator tags placed chips SPK and ADJ");
assert(!v33.includes('data-id="api-link-del"'), "v3.3 drops the link delete endpoint");
assert(goldOffenders(v33pages) === 0, `v3.3 pages carry at most one gold action (offenders: ${goldOffenders(v33pages)})`);

/* v3.4: the launch-prep round */
const v34pages = pagesOf(v34);
assert(!v34.replace(/<!--[\s\S]*?-->/g, "").includes("·"), "v3.4 carries no middle dots");
for (const id of ["user-home", "user-merge", "user-claim", "pub-policy", "pub-terms", "pub-signin-existing", "own-add-person", "pub-standings-adjudicators"]) {
  assert(v34.includes(`data-id="${id}"`), `v3.4 contains ${id}`);
}
for (const id of ["user-cabinet", "pub-privacy"]) {
  assert(!v34.includes(`data-id="${id}"`), `v3.4 no longer contains ${id}`);
}
assert(!/my cab/i.test(v34pages), "v3.4 has no separate signed-in cabinet");
assert(v34pages.includes("Prep ends at") && v34pages.includes("Motions"), "v3.4 shows the motion form's prep end and the Motions table");
assert(v34pages.includes("will accept on My page") && v34pages.includes("Add as a guest"), "v3.4 shows the add field's outcomes");
assert(v34.includes("is_iron") && v34.includes("stats/adjudicators"), "v3.4 records iron speeches and adjudicator stats");
assert(!/stats\/judges/.test(v34), "v3.4 no longer calls stats/judges");

/* v3.5: club-night feedback */
for (const id of ["par-feedback-form", "par-feedback-sent", "jud-feedback", "api-feedback-post", "api-feedback-get"]) {
  assert(v35.includes(`data-id="${id}"`), `v3.5 contains ${id}`);
}

/* the house rules every version from v3.4 keeps */
function houseRules(ver: string, c: string) {
  const pages = pagesOf(c);
  assert(!c.replace(/<!--[\s\S]*?-->/g, "").includes("·"), `${ver} carries no middle dots`);
  assert(!/\bJudge\b/.test(pages), `${ver} pages say Adjudicator, never Judge`);
  assert(goldOffenders(pages) === 0, `${ver} pages carry at most one gold action (offenders: ${goldOffenders(pages)})`);
}
for (const [ver, c] of [["v3.4", v34], ["v3.5", v35], ["v3.6", v36], ["v3.7", v37], ["v3.8", v38]] as const) houseRules(ver, c);

/* feedback, as built from v3.5 on */
function feedbackPages(ver: string, c: string) {
  const pages = pagesOf(c);
  const form = pageChunk(pages, "par-feedback-form");
  assert(form.includes("How accurate was the adjudicator's call?") && form.includes("How was the adjudicator's reasoning?") && form.includes("Discussion"),
    `${ver} feedback form asks accuracy, reasoning and discussion`);
  const jud = pageChunk(pages, "jud-feedback");
  assert(jud.includes("Feedback on your adjudication") && !/Anna &amp; Bohdan<\/td>|Daryna &amp; Olesia<\/td>/.test(jud.split("Feedback on your adjudication")[1] ?? ""),
    `${ver} adjudicator feedback names no team`);
  assert(pages.includes("Your team already sent feedback.") && pages.includes("Give feedback"), `${ver} shows giving and already-sent feedback`);
}
for (const [ver, c] of [["v3.5", v35], ["v3.6", v36], ["v3.7", v37], ["v3.8", v38]] as const) feedbackPages(ver, c);

/* one command, one place (from v3.6): a page whose top bar carries commands draws no in-page button repeating one */
function noDoubleActions(ver: string, c: string) {
  const doubled: string[] = [];
  for (const { spec } of specFiles("cab", ver)) {
    if (spec.kind === "swagger") continue;
    // notes describe the page; only drawn blocks can hold a button
    const body = JSON.stringify((spec.blocks ?? []).filter((b: { type: string }) => b.type !== "note"));
    const segs: string[] = (spec.chrome?.segs ?? []).map((s: { label: string }) => s.label.replace(/<[^>]+>/g, ""));
    if (/\((plain )?button\)/.test(body) || segs.some((label) => body.includes(`<b>${label}</b> (`))) doubled.push(spec.id);
  }
  assert(doubled.length === 0, `${ver} forms leave their command to the top bar${doubled.length ? " — doubled: " + doubled.join(", ") : ""}`);
  const members = pageChunk(pagesOf(c), "own-members");
  assert(members.length > 0 && !members.includes("signed-in user"), `${ver} join requests and members carry no account kind`);
}
for (const [ver, c] of [["v3.6", v36], ["v3.7", v37], ["v3.8", v38]] as const) noDoubleActions(ver, c);

/* feedback lives in the engine (from v3.7) */
for (const [ver, c] of [["v3.7", v37], ["v3.8", v38]] as const) {
  assert(!/kept by cab|engine is not involved|Avg feedback is cab's own/i.test(c), `${ver} never says feedback is kept by cab`);
  assert(c.includes("/api/events/:eventId/feedback-questions"), `${ver} engine column lists the feedback questions`);
  assert(c.includes("stats/adjudicators?base=5"), `${ver} reads the adjudicator average with the base vote from the engine`);
}

/* v3.8: the engine keeps room prep; a club rename reaches the engine */
const raw38 = specFiles("cab", "v3.8").map(({ spec }) => JSON.stringify(spec)).join("\n") +
  readFileSync(join(ROOT, "targets", "cab", "v3.8", "_columns.json"), "utf8");
assert(!/"m8b"|class=\\"m8b\\"/.test(raw38), "v3.8 specs carry no m8b fields or markers");
assert(chlogOf(v38).includes("Compared with v3.7"), "v3.8 changelog compares with v3.7");
const prepRow = v38.split('data-id="eng-prep"')[1]?.split('<div class="row"')[0] ?? "";
assert(prepRow.includes("/api/rooms/:id/prep") && prepRow.includes("PATCH"), "v3.8 engine column lists PATCH /api/rooms/:id/prep");
assert(v38.includes("POST /api/rooms/:id/motion (prep_ends_at)"), "v3.8 sets prep_ends_at on the motion call");
assert(!v38.includes("room_preps") && pageChunk(pagesOf(v38), "jud-room").includes("The engine keeps one prep end time per room"),
  "v3.8 room prep is the engine's, cab keeps no prep table");
assert(pageChunk(pagesOf(v38), "own-club").includes("Renaming the club renames its engine organisation too"),
  "v3.8 own club page says a rename renames the engine organisation");
assert(v38.includes("PUT</span> /:id") && v38.includes("a new name renames the engine organisation first"),
  "v3.8 API columns carry the organisation rename");

/* ---------- main (uadebate.com) v1: the legacy front page, ported as is ---------- */
const u1 = chunk("uadebate", "v1");
const legacy = (() => {
  const p = join(ROOT, "..", "legacy", "design", "uadebate.html");
  return existsSync(p) ? readFileSync(p, "utf8") : "";
})();
assert(/lang="uk"/.test(u1.slice(0, 200)), "uadebate v1 board is marked Ukrainian");
assert(u1.includes('data-id="main-front"') && u1.includes("GET /"), "uadebate v1 renders the front page");
for (const text of ["Дебатна спільнота України — <em>турніри, рейтинги, розвиток</em>", "Реєстрація на Чемпіонат України з дебатів відкрита до 1 жовтня",
                    "Федерації дебатів України 10 років!", "Чумачов Андрій", "Кубок Фенікса", "Атестованих суддів", "Кабінет ФДУ (dfu)"]) {
  assert(u1.includes(text), `uadebate v1 keeps «${text.replace(/<[^>]+>/g, "")}»`);
}
if (legacy) {
  const spec = JSON.parse(readFileSync(join(ROOT, "targets", "uadebate", "v1", "main-front.json"), "utf8"));
  const body = legacy.slice(legacy.indexOf("<body>") + 6, legacy.indexOf("</body>")).replace(/\s+/g, " ").trim();
  const ported = spec.blocks.map((b: { html: string }) => b.html).join(" ").replace(/\s+/g, " ").trim();
  assert(ported === body, "uadebate v1 front page is the legacy markup, unchanged");
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
