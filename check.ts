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
assert(pfSwitch.includes('data-platform="dfu"') && pfSwitch.includes(">dfu (dfu.uadebate.com)</button>"), "platform switch offers dfu, labelled dfu (dfu.uadebate.com)");
for (const [pf, v] of [["cab", "v3.8"], ["uadebate", "v1"], ["uadebate", "v2"], ["uadebate", "v3"]]) {
  assert(chunk(pf, v).length > 0, `${pf} ${v} board present`);
}
const versionsInPage = [...html.matchAll(/<section class="version[^"]*" data-platform="([^"]+)" data-version="([^"]+)"/g)].map((m) => `${m[1]}/${m[2]}`);
const versionsOnDisk = ["cab", "uadebate", "dfu"].flatMap((pf) => versionsOf(pf).map((v) => `${pf}/${v}`));
assert(versionsOnDisk.every((v) => versionsInPage.includes(v)) && versionsInPage.length === versionsOnDisk.length,
  `every platform+version on disk has exactly one board (${versionsInPage.length})`);

/* no planning-era markers anywhere people read */
const milestones = [...visible.matchAll(/\b(?:M\d+[a-z]?|L\d)\b|launch-timeline|specced|not yet built|class="m8b"/g)].map((m) => m[0]);
assert(milestones.length === 0, `no milestone or M8b markers in the page${milestones.length ? " — found: " + [...new Set(milestones)].join(", ") : ""}`);
const chromeText = visible.replace(/<section[\s\S]*?<\/section>/g, "");
assert(!chromeText.includes("·"), "the workbench chrome carries no middle dots");

/* every spec id is rendered, and ids are unique within a platform+version */
for (const pf of ["cab", "uadebate", "dfu"]) {
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

/* ---------- main (uadebate.com) v2: the whole site in cab's look, public and content manager ---------- */
const u2 = chunk("uadebate", "v2");
const u2col = (name: string) => u2.split(`data-col="${name}"`)[1]?.split('<div class="col ')[0] ?? "";
const u2pages = u2.split('<div class="page"').slice(1);
const u2text = u2.replace(/<!--[\s\S]*?-->/g, "");
assert(chlogOf(u2).includes("Compared with v1") && listed(chlogOf(u2), "Changed").includes("main-front"),
  "uadebate v2 changelog compares with v1 and lists main-front as changed");
const sitePages = ["main-front", "main-news", "main-news-article", "main-tournaments", "main-calendar", "main-clubs",
  "main-club", "main-ratings", "main-about", "main-signin"];
const cmPages = ["cm-dash", "cm-news-edit", "cm-calendar", "cm-event-edit", "cm-clubs", "cm-club-edit"];
const missing2 = [...sitePages, ...cmPages].filter((id) => !u2.includes(`data-id="${id}"`));
assert(missing2.length === 0, `uadebate v2 has every site page${missing2.length ? " — missing: " + missing2.join(", ") : ""}`);
assert(cmPages.every((id) => u2col("content-manager").includes(`data-id="${id}"`)) &&
  sitePages.every((id) => u2col("public").includes(`data-id="${id}"`)), "uadebate v2: public and content-manager columns hold their pages");
const navItems = ["Головна", "Новини", "Турніри", "Календар", "Клуби", "Рейтинги", "Про ФДУ"];
const noNav = u2pages.filter((pg) => {
  const bar = pg.match(/<header class="ua-top">[\s\S]*?<\/header>/)?.[0] ?? "";
  return !/class="ua-brand wordmark"[^>]*>UAdebates</.test(bar) || !navItems.every((t) => bar.includes(`>${t}</a>`));
}).length;
assert(noNav === 0, `uadebate v2: every page carries the header with the wordmark and the seven-item nav (${noNav} without)`);
assert(u2pages.every((pg) => pg.includes('<footer class="ua-foot">')), "uadebate v2: every page carries the footer");
const goldy = u2pages.filter((pg) => (pg.match(/ua-btn--gold|class="go"/g) ?? []).length > 1).length;
assert(goldy === 0, `uadebate v2: at most one gold action per page (${goldy} pages with more)`);
assert(!/btn--cta|tag--gold|class="blob/.test(u2), "uadebate v2 uses no legacy gold marks and no hero blobs");
assert(!u2text.includes("·"), "uadebate v2 carries no middle dots");
const arrows = [...new Set(u2text.match(/[\u2190-\u21FF\u2B00-\u2BFF\u203A\u276F]/g) ?? [])];
assert(arrows.length === 0, `uadebate v2 carries no arrows${arrows.length ? " — found: " + arrows.join(" ") : ""}`);
const wordmarkCss = /\.ua \.wordmark \{ font-family:"Cedarville Cursive"/.test(html) && html.includes('font-family:"Cedarville Cursive"; font-style:normal');
assert(wordmarkCss, "uadebate v2 wordmark is set in the embedded Cedarville Cursive");
const privateEvents = ["Збори правління ФДУ", "Закритий відбір суддів Чемпіонату України"];
assert(privateEvents.every((t) => !u2col("public").includes(t)) && !u2col("public").includes("ua-ev--priv") && !u2col("public").includes("ua-chip--priv"),
  "uadebate v2: private events never reach the public column");
assert(privateEvents.every((t) => pageChunk(u2, "cm-calendar").includes(t)), "uadebate v2: the content manager's calendar shows the private events");
const cmCal = pageChunk(u2, "cm-calendar");
assert((cmCal.match(/class="ua-vis"/g) ?? []).length === (cmCal.match(/class="ua-ev[ "]/g) ?? []).length && cmCal.includes("ua-vis"),
  "uadebate v2: every event in the content manager's list carries the public/private switch");
assert(pageChunk(u2, "cm-event-edit").includes("Приватна: бачать лише контент-менеджери"), "uadebate v2: the event form offers private visibility");
assert(/class="ua-map"[\s\S]*?class="ua-city/.test(pageChunk(u2, "main-clubs")) && pageChunk(u2, "main-clubs").includes("Формат"),
  "uadebate v2: the clubs page has the map with city dots and the filters");
assert(pageChunk(u2, "main-tournaments").includes("У розробці") && pageChunk(u2, "main-tournaments").includes("Відкрити календар"),
  "uadebate v2: Турніри is under construction and leads to the calendar");
assert(pageChunk(u2, "main-club").includes("Відкрити в кабінеті"), "uadebate v2: the club page opens the club in cab");
assert(/Політика конфіденційності[\s\S]*Умови користування/.test(pageChunk(u2, "main-about")), "uadebate v2: Про ФДУ links the Policy and the Terms");
assert(u2.includes("2. Content manager") && u2col("content-manager").includes("not a cab admin"), "uadebate v2: the content-manager column says it is not a cab admin");
for (const text of ["Дебатна спільнота України — <em>турніри, рейтинги, розвиток</em>", "Федерації дебатів України 10 років!", "Кубок Фенікса", "Онлайн, БПФ"]) {
  assert(u2text.includes(text), `uadebate v2 keeps «${text.replace(/<[^>]+>/g, "")}»`);
}

/* ---------- main (uadebate.com) v3: English, one column per scope as in cab ---------- */
const u3 = chunk("uadebate", "v3");
const u3col = (name: string) => u3.split(`data-col="${name}"`)[1]?.split('<div class="col ')[0] ?? "";
const u3pages = u3.split('<div class="page"').slice(1);
const u3text = u3.replace(/<!--[\s\S]*?-->/g, "");
assert(/lang="en"/.test(u3.slice(0, 300)), "uadebate v3 board is marked English");
assert(chlogOf(u3).includes("Compared with v2"), "uadebate v3 changelog compares with v2");
const v3cols = [...u3.matchAll(/data-col="([a-z-]+)"/g)].map((m) => m[1]);
assert(v3cols.join(",") === "public,user,content-manager,admin,phoenix-api",
  `uadebate v3 columns follow the scope ladder (got: ${v3cols.join(",")})`);
const v3conds = ["1. Public (anonymous)", "2. User (signed in)", "3. Content manager", "4. Admin", "5. Phoenix API"];
assert(v3conds.every((t) => u3.includes(`<h3>${t}`)), "uadebate v3 columns are numbered as in cab");
for (const [col, prev] of [["user", "public"], ["content-manager", "user"], ["admin", "content-manager"]]) {
  assert(u3col(col).includes(`<b>All ${prev} pages +</b>`), `uadebate v3: ${col} inherits all ${prev} pages`);
}
const v3scope: Record<string, string[]> = {
  public: ["main-front", "main-news", "main-news-article", "main-calendar", "main-clubs", "main-club", "main-about", "main-signin"],
  user: ["user-front"],
  "content-manager": ["cm-dash", "cm-news-edit", "cm-calendar", "cm-event-edit", "cm-clubs", "cm-club-edit"],
  admin: ["adm-roles"],
};
const misplaced3 = Object.entries(v3scope).flatMap(([col, ids]) => ids.filter((id) => !u3col(col).includes(`data-id="${id}"`)));
assert(misplaced3.length === 0, `uadebate v3: every page sits in its scope${misplaced3.length ? " (missing: " + misplaced3.join(", ") + ")" : ""}`);
assert(u3pages.length === Object.values(v3scope).flat().length, `uadebate v3 has exactly the scoped pages (${u3pages.length})`);
for (const id of ["main-tournaments", "main-ratings", "main-history"]) {
  assert(!u3.includes(`data-id="${id}"`), `uadebate v3 has no ${id} page`);
}
assert(u3col("phoenix-api").includes('class="swag"') && ["/news", "/events", "/calendar.ics", "/clubs", "/roles/content-managers"]
  .every((p) => u3col("phoenix-api").includes(`<span class="p">${p}</span>`)), "uadebate v3: the Phoenix API column lists the site's endpoints");
const nav3 = ["Home", "News", "Calendar", "Clubs", "About"];
const badNav3 = u3pages.filter((pg) => {
  const bar = pg.match(/<header class="ua-top">[\s\S]*?<\/header>/)?.[0] ?? "";
  const items = [...(bar.match(/<nav class="ua-nav">([\s\S]*?)<\/nav>/)?.[1] ?? "").matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1]);
  return !/class="ua-brand wordmark"[^>]*>UAdebates</.test(bar) || items.join(",") !== nav3.join(",") || !bar.includes(">Cabinet</a>");
}).length;
assert(badNav3 === 0, `uadebate v3: every header has the wordmark, exactly Home, News, Calendar, Clubs, About, and Cabinet (${badNav3} off)`);
assert(u3col("public").split('<div class="page"').slice(1).every((pg) => pg.includes(">Sign in</a>")) &&
  !/>Sign in<\/a>/.test(u3col("user") + u3col("content-manager") + u3col("admin")), "uadebate v3: Sign in shows only to anonymous visitors");
assert(!/>(Tournaments|Ratings|History)<\/a>/.test(u3text.replace(/<a class="on" href="#">All<\/a><a href="#">Tournaments<\/a>/g, "")),
  "uadebate v3 links to no dropped page (Tournaments, Ratings, History)");
const foot3 = u3pages.map((pg) => pg.match(/<footer class="ua-foot">[\s\S]*?<\/footer>/)?.[0] ?? "");
const mails3 = [...new Set(foot3.flatMap((f) => f.match(/[\w.+-]+@[\w.-]+/g) ?? []))].sort();
assert(foot3.every((f) => f.length > 0) && mails3.join(",") === "ngo.dfu@uadebate.com,support@uadebate.com",
  `uadebate v3: every footer carries exactly ngo.dfu@ and support@ (got: ${mails3.join(", ")})`);
assert(!/info@|dfu\.ngo@|noreply@|admin@uadebate/.test(u3text), "uadebate v3 shows no invented or internal address");
assert(foot3.every((f) => f.includes("t.me/fdu_ua")), "uadebate v3: every footer links Telegram");
const about3 = pageChunk(u3, "main-about");
for (const t of ["07/05/2011", "06/2012", "09-11/05/2013", "03/2015", "12/2015", "Mission", "Goal", "Means", "Federation Cup in Vinnytsia"]) {
  assert(about3.includes(t), `uadebate v3 About carries the Wix history: ${t}`);
}
assert(["2011", "2012", "2013", "2015"].every((y) => about3.includes(`<div class="ua-tl-year"><span>${y}</span>`)), "uadebate v3 About has the four year markers");
assert((about3.match(/class="ua-branch"/g) ?? []).length === 16, "uadebate v3 About maps the sixteen branches");
const cyr3 = u3text.replace(/<[^>]+>/g, " ").match(/[Ѐ-ӿ]+/g) ?? [];
assert(cyr3.length === 0, `uadebate v3 is English only${cyr3.length ? " (found: " + cyr3.slice(0, 5).join(" ") + ")" : ""}`);
const goldy3 = u3pages.filter((pg) => (pg.match(/ua-btn--gold|class="go"/g) ?? []).length > 1).length;
assert(goldy3 === 0, `uadebate v3: at most one gold action per page (${goldy3} pages with more)`);
assert(!u3text.includes("·"), "uadebate v3 carries no middle dots");
const arrows3 = [...new Set(u3text.match(/[←-⇿⬀-⯿›❯]/g) ?? [])];
assert(arrows3.length === 0, `uadebate v3 carries no arrows${arrows3.length ? " (found: " + arrows3.join(" ") + ")" : ""}`);
assert(!/[“”]/.test(u3text), "uadebate v3 English text uses plain quotes");
const private3 = ["DFU board meeting", "Closed adjudicator selection for the Championship"];
const outsideCm3 = u3col("public") + u3col("user");
assert(private3.every((t) => !outsideCm3.includes(t)) && !/ua-ev--priv|ua-chip--priv|class="ua-vis"/.test(outsideCm3),
  "uadebate v3: private events and the visibility switch stay out of the public and user columns");
const cmCal3 = pageChunk(u3, "cm-calendar");
assert(private3.every((t) => cmCal3.includes(t)) &&
  (cmCal3.match(/class="ua-vis"/g) ?? []).length === (cmCal3.match(/class="ua-ev[ "]/g) ?? []).length,
  "uadebate v3: the content manager's calendar shows the private events, each with the Public / Private switch");
assert(pageChunk(u3, "cm-event-edit").includes("Private: only content managers see it"), "uadebate v3: the event form offers private visibility");
assert(pageChunk(u3, "main-club").includes("Open in cab"), "uadebate v3: the club page opens the club in cab");
assert(u3col("content-manager").includes("not a cab admin") && pageChunk(u3, "adm-roles").includes("Grant the role"),
  "uadebate v3: content managers are not cab admins, and admins grant the role");

/* ---------- dfu v1: the NGO cabinet, one column per scope like cab ---------- */
const d1 = chunk("dfu", "v1");
const d1col = (col: string) => d1.split(`data-col="${col}"`)[1]?.split('<div class="col ')[0] ?? "";
const d1pages = pagesOf(d1).split('<div class="page"').slice(1);
const d1text = d1.replace(/<[^>]+>/g, " ");
const d1cols = [...d1.matchAll(/data-col="([a-z-]+)"[^>]*><h3>([^<]+)<\/h3>/g)].map((m) => `${m[1]}=${m[2]}`);
assert(d1cols.join("|") === "member=1. Member|branch-head=2. Branch head|board=3. Board|admin=4. Secretariat (admin)|phoenix-api=5. Phoenix API, /api/v1 (dfu)",
  `dfu v1 columns: member, branch head, board, secretariat, Phoenix API (got: ${d1cols.join(", ")})`);
const d1conds = [...d1.matchAll(/<p class="cond">([\s\S]*?)<\/p>/g)].map((m) => m[1]);
assert(["All member pages +", "All branch-head pages +", "All board pages +"].every((t, i) => d1conds[i + 1]?.startsWith(`<b>${t}`)),
  "dfu v1: each scope caption starts with All <previous> pages +");
assert(d1conds[0]?.includes("gets 404 on every dfu page") && d1col("phoenix-api").includes("every call is 404"),
  "dfu v1 states the 404 for anyone without a dfu role, pages and API");
const d1scope: Record<string, string[]> = {
  member: ["m-inbox", "m-doc", "m-cases", "m-case", "m-votes", "m-vote", "m-ann", "m-documents", "m-members", "m-branches", "m-leadership", "m-adjudicators"],
  "branch-head": ["bh-branch", "bh-submit"],
  board: ["b-cases", "b-case", "b-vote-new", "b-vote", "b-ann-new"],
  admin: ["s-journal", "s-register", "s-doc", "s-roles"],
};
const misplacedD1 = Object.entries(d1scope).flatMap(([col, ids]) => ids.filter((id) => !d1col(col).includes(`data-id="${id}"`)));
assert(misplacedD1.length === 0, `dfu v1: every page sits in its scope${misplacedD1.length ? " (missing: " + misplacedD1.join(", ") + ")" : ""}`);
assert(d1pages.length === Object.values(d1scope).flat().length, `dfu v1 has exactly the scoped pages (${d1pages.length})`);
assert(d1pages.every((pg) => /<nav class="nav"><div class="cp">dfu<\/div>/.test(pg) && pg.includes('<div class="sc">Records</div>') &&
  pg.includes('<div class="sc">Organisation</div>')), "dfu v1: every page has the sidenav with the dfu wordmark, Records and Organisation");
assert(!/<div class="sc">Secretariat<\/div>/.test(d1col("member") + d1col("branch-head") + d1col("board")) &&
  d1col("admin").includes('<div class="sc">Secretariat</div>'), "dfu v1: the Secretariat section shows only to the secretariat");
const goldyD1 = d1pages.filter((pg) => (pg.match(/class="go"/g) ?? []).length > 1).length;
assert(goldyD1 === 0, `dfu v1: at most one gold action per page (${goldyD1} pages with more)`);
assert(!d1.includes("·"), "dfu v1 carries no middle dots");
const arrowsD1 = [...new Set(d1.match(/[←-⇿⬀-⯿›❯◐]/g) ?? [])];
assert(arrowsD1.length === 0, `dfu v1 carries no arrows or symbols${arrowsD1.length ? " (found: " + arrowsD1.join(" ") + ")" : ""}`);
assert(!/[“”«»]/.test(d1text), "dfu v1 English text uses plain quotes");
const cyrD1 = d1text.match(/[Ѐ-ӿ]+/g) ?? [];
assert(cyrD1.length === 0, `dfu v1 is English only${cyrD1.length ? " (found: " + cyrD1.slice(0, 5).join(" ") + ")" : ""}`);
const cabLinks = d1pages.flatMap((pg) => [...pg.matchAll(/>([^<]*)<\/a>/g)].map((m) => m[1]))
  .filter((t) => /\bcab\b|\/c\/|Club|Standings|Rooms/.test(t));
assert(cabLinks.length === 0 && d1pages.every((pg) => pg.includes('<a href="#">Cabinet</a>')),
  `dfu v1 links to cab only through the Cabinet link${cabLinks.length ? " (found: " + cabLinks.join(", ") + ")" : ""}`);
assert(/\/c\/|owner/.test(pagesOf(d1)) === false, "dfu v1 carries no cab routes");
for (const t of ["IN-2026-041", "C-2026-07", "D-2026-12", "V-2026-14"]) assert(d1.includes(t), `dfu v1 uses journal numbers: ${t}`);
assert(pageChunk(d1, "m-vote").includes('<a class="go" href="#">Sign vote</a>') && pageChunk(d1, "m-vote").includes("41 of 96"),
  "dfu v1: a vote counts once signed, quorum shown");
for (const [id, names] of [["m-leadership", ["Karyna Kuznietsova", "Polina Sorokolit", "Ihor Bobryshev", "Kyrylo Kozhemiakin"]],
  ["m-branches", ["Kateryna Omelian", "Dmytro Sefer", "Yuliia Serhiienko"]], ["m-adjudicators", ["53 certified", "Kyrylo Kozhemiakin"]]] as const) {
  assert(names.every((n) => pageChunk(d1, id).includes(n)), `dfu v1 ${id} carries the Wix data (${names.join(", ")})`);
}
assert((pageChunk(d1, "m-branches").match(/<tr>/g) ?? []).length === 17, "dfu v1 lists the sixteen branches");
assert(pageChunk(d1, "s-doc").includes("Public") && d1col("phoenix-api").includes("/api/documents?public=1"),
  "dfu v1: the secretariat publishes documents, uadebate.com reads the public ones");
assert(d1col("phoenix-api").includes('class="swag"') && ["/inbox", "/cases", "/votes/:no/signatures", "/journal", "/people"]
  .every((p) => d1col("phoenix-api").includes(`<span class="p">${p}</span>`)), "dfu v1: the Phoenix API column lists dfu's endpoints");

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
