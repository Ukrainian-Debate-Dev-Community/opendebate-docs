/* webdesign build — renders every targets/<platform>/<version> into one page, dist/index.html.
   Zero runtime deps; run with: bun run build.ts
   Output is self-contained (styles, the cab wordmark font and board.js inlined): one hidden
   board per platform+version, picked client-side by the platform and version switches. */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from "fs";
import { join } from "path";

const ROOT = new URL(".", import.meta.url).pathname;
const TARGETS_DIR = join(ROOT, "targets");
const DIST = join(ROOT, "dist");
const CAB_FONT = join(ROOT, "..", "platform", "apps", "cab", "priv", "static", "fonts", "cedarville-cursive.woff2");

// the role ladder, weakest first: every successor inherits all
// predecessor pages and adds its own (the two APIs sit above admin —
// cab api serves every page verb, engine api is cab's internal store)
const COLUMN_ORDER = [
  "public", "user", "participant", "judge", "member", "branch-head", "board", "content-manager", "owner", "admin", "phoenix-api", "engine-api",
];
const COLUMN_CLASS: Record<string, string> = {
  "engine-api": "c-api", "phoenix-api": "c-api", admin: "c-adm", public: "c-pub",
  user: "c-usr", owner: "c-own", member: "c-mem", participant: "c-par", judge: "c-jud",
  "content-manager": "c-own", "branch-head": "c-jud", board: "c-own",
};
const METHOD_CLASS: Record<string, string> = {
  GET: "get", POST: "post", PUT: "put", PATCH: "patch", DEL: "del", DELETE: "del",
};

/* ---------- types (loose on purpose: specs are trusted, authored HTML) ---------- */
type Seg = { label: string; kind?: "gold" | "quiet" | "plain" };
type Block = {
  type: string; title?: string; lines?: string[]; head?: string[];
  rows?: string[][]; rowClass?: Record<string, string>;
  kind?: string; html?: string; text?: string; items?: string[]; active?: string;
};
type PageSpec = {
  id: string; title?: string; column: string; order?: number; path?: string;
  api?: string[]; bare?: boolean;
  nav?: { items: string[]; context?: string; active?: string; profile?: string };
  chrome?: { crumb: string; segs?: Seg[] };
  blocks?: Block[];
  kind?: "swagger"; intro?: string;
  groups?: { title: string; rows: SwagRow[] }[];
};
type SwagRow = { id: string; method: string; path: string; desc: string; api?: string; apiNone?: boolean; t?: string };
type Columns = Record<string, { title: string; cond: string }>;
type Version = { name: string; columns: Columns; pages: PageSpec[]; lang?: string };
// targets/<platform>/platform.json — all fields optional
type Platform = { id: string; label: string; order: number; lang: string; frameWidth: number; versions: Version[] };

/* ---------- helpers ---------- */
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function stable(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object")
    return "{" + Object.keys(v as object).sort().map((k) => JSON.stringify(k) + ":" + stable((v as any)[k])).join(",") + "}";
  return JSON.stringify(v);
}

// planning-era fields are ignored: drop them before anything reads a spec
// (older specs drew the LIVE tag with the m8b class; it is the live class now)
function dropPlanning(v: any): any {
  if (typeof v === "string") return v.replace(/<span class="m8b">LIVE<\/span>/g, `<span class="live">LIVE</span>`);
  if (Array.isArray(v)) return v.map(dropPlanning);
  if (v && typeof v === "object") {
    const o: any = {};
    for (const k of Object.keys(v)) if (k !== "m8b") o[k] = dropPlanning(v[k]);
    return o;
  }
  return v;
}

/* older specs carry milestone tags in their text (M8b, M9a, launch-timeline L2…).
   The board no longer plans, so the renderer drops them; NEW tags stay as plain tags. */
const MILESTONE = String.raw`(?:launch-timeline )?(?:M\d+[a-z]?|L\d)`;
function scrub(html: string): string {
  return html
    .replace(/<span class="m8b">(NEW|ENGINE-NEW)<\/span>/g, `<span class="w-tag">$1</span>`)
    .replace(new RegExp(String.raw`\s*<span class="m8b">${MILESTONE}(?::? [a-z]+)?</span>`, "g"), "")
    .replace(new RegExp(String.raw`\s*\(${MILESTONE}\)`, "g"), "")
    .replace(new RegExp(String.raw`,\s*${MILESTONE}\)`, "g"), ")")
    .replace(new RegExp(String.raw`\b${MILESTONE}\b:?\s?`, "g"), "");
}

function loadVersion(dir: string, name: string): Version {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  let columns: Columns = {};
  let lang: string | undefined;
  const pages: PageSpec[] = [];
  for (const f of files) {
    const data = dropPlanning(JSON.parse(readFileSync(join(dir, f), "utf8")));
    if (f === "_columns.json") columns = data;
    else if (f === "_version.json") lang = data.lang; // a version may speak another language than its platform
    else if (!f.startsWith("_")) pages.push(data);
  }
  pages.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
  return { name, columns, pages, lang };
}

// versions are v<major> or v<major>.<minor> (v2 = v2.0), sorted numerically
function loadPlatform(id: string): Platform | null {
  const dir = join(TARGETS_DIR, id);
  const vnum = (d: string): [number, number] => {
    const [maj, min] = d.slice(1).split(".");
    return [Number(maj), Number(min ?? 0)];
  };
  const vdirs = readdirSync(dir)
    .filter((d) => /^v\d+(\.\d+)?$/.test(d) && statSync(join(dir, d)).isDirectory())
    .sort((a, b) => vnum(a)[0] - vnum(b)[0] || vnum(a)[1] - vnum(b)[1]);
  if (!vdirs.length) return null;
  const metaPath = join(dir, "platform.json");
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
  return {
    id, label: meta.label ?? id, order: meta.order ?? 99, lang: meta.lang ?? "en",
    frameWidth: meta.frameWidth ?? 720, versions: vdirs.map((d) => loadVersion(join(dir, d), d)),
  };
}

function columnsOf(v: Version): string[] {
  const extra = Object.keys(v.columns).filter((c) => !COLUMN_ORDER.includes(c));
  return [...COLUMN_ORDER, ...extra].filter((c) => v.pages.some((p) => p.column === c));
}

/* ---------- block renderers ---------- */
function cell(raw: string): string {
  const i = raw.indexOf("::");
  if (i > 0) {
    const cls = raw.slice(0, i);
    if (/^[a-z][a-z0-9 -]*$/.test(cls)) return `<td class="${cls}">${raw.slice(i + 2)}</td>`;
  }
  return `<td>${raw}</td>`;
}

function renderTable(b: Block): string {
  let h = `<div class="card"><table class="t">`;
  if (b.head?.length) h += `<thead><tr>${b.head.map((th) => `<th>${th}</th>`).join("")}</tr></thead>`;
  h += `<tbody>`;
  (b.rows ?? []).forEach((row, i) => {
    const cls = b.rowClass?.[String(i)];
    h += `<tr${cls ? ` class="${cls}"` : ""}>${row.map(cell).join("")}</tr>`;
  });
  return h + `</tbody></table></div>`;
}

function renderBlock(b: Block): string {
  switch (b.type) {
    case "section": return `<div class="sec">${b.title ?? ""}</div>`;
    case "card": {
      const [first, ...rest] = b.lines ?? [];
      return `<div class="card"><div class="pad">${first ?? ""}${rest
        .map((l) => (l.startsWith("<p") ? l : `<p>${l}</p>`)).join("")}</div></div>`;
    }
    case "table": return renderTable(b);
    case "banner": return `<div class="bn${b.kind === "gold" ? " gd" : ""}">${b.html ?? ""}</div>`;
    case "note": return `<div class="anno">${b.text ?? ""}</div>`;
    case "raw": return b.html ?? "";
    case "tabs": return ""; // lifted out of the body — rendered by renderPage
    default: throw new Error(`unknown block type: ${b.type}`);
  }
}

function renderTabs(b: Block): string {
  return `<div class="tabs">${(b.items ?? [])
    .map((t) => `<a${t === b.active ? ` class="on"` : ""} href="#">${t}</a>`).join("")}</div>`;
}

function renderPage(p: PageSpec, brand: string): string {
  const api = (p.api ?? []).map((a) => `<span class="eng">${a}</span>`).join("");
  const cap = `<div class="cap">${p.path ?? ""}${api}</div>`;
  let inner: string;
  if (p.bare) {
    inner = (p.blocks ?? []).map(renderBlock).join("\n");
  } else {
    const nav = p.nav
      ? `<nav class="nav"><div class="cp">${brand}</div>` +
        (p.nav.context ? `<div class="sc">${p.nav.context}</div>` : "") +
        // an item starting "# " is a section heading of the sidenav, not a link
        p.nav.items.map((it) => it.startsWith("# ") ? `<div class="sc">${it.slice(2)}</div>`
          : `<a${it === p.nav!.active ? ` class="on"` : ""} href="#">${it}</a>`).join("") +
        `<div class="pf">${p.nav.profile ?? ""}</div></nav>`
      : "";
    const segs = p.chrome?.segs?.length
      ? `<div class="seg">${p.chrome.segs
          .map((s) => `<a class="${s.kind === "gold" ? "go" : s.kind === "quiet" ? "qt" : ""}" href="#">${s.label}</a>`)
          .join("")}</div>`
      : "";
    const chrome = `<div class="chrome"><div class="cr">${p.chrome?.crumb ?? ""}</div>${segs}</div>`;
    const tabs = (p.blocks ?? []).filter((b) => b.type === "tabs").map(renderTabs).join("");
    const body = `<div class="body">\n${(p.blocks ?? []).filter((b) => b.type !== "tabs").map(renderBlock).join("\n")}\n</div>`;
    inner = `<div class="shell">\n${nav}\n<div class="mainc">${chrome}\n${tabs}${body}</div>\n</div>`;
  }
  return `<div class="page" data-id="${escAttr(p.id)}" data-t="${escAttr(p.title ?? p.id)}">${cap}<span class="dot"></span>\n` +
         `<div class="frame">${inner}</div>\n</div>`;
}

function renderSwagger(p: PageSpec): string {
  let h = `<div class="swag" data-spec="${escAttr(p.id)}">`;
  for (const g of p.groups ?? []) {
    h += `\n<div class="grp">${g.title}</div>`;
    for (const r of g.rows) {
      const m = METHOD_CLASS[r.method.toUpperCase()] ?? "get";
      const api = r.api != null ? `<span class="e${r.apiNone ? " none" : ""}">${r.api}</span>` : "";
      h += `\n<div class="row" data-id="${escAttr(r.id)}" data-t="${escAttr(r.t ?? r.id)}">` +
           `<span class="m ${m}">${r.method.toUpperCase()}</span><span class="p">${r.path}</span>` +
           `<span class="d">${r.desc}</span>${api}<span class="dot"></span></div>`;
    }
  }
  return h + `\n</div>`;
}

function renderColumn(name: string, v: Version, pf: Platform): string {
  const meta = v.columns[name] ?? { title: name, cond: "" };
  const pages = v.pages.filter((p) => p.column === name);
  const body = pages.map((p) => (p.kind === "swagger" ? renderSwagger(p) : renderPage(p, pf.id))).join("\n\n");
  const intro = pages.find((p) => p.intro)?.intro;
  return `<div class="col ${COLUMN_CLASS[name] ?? ""}" data-col="${name}" style="flex-basis:${pf.frameWidth}px"><h3>${meta.title}</h3>\n` +
         `<p class="cond">${meta.cond}</p>${intro ? `\n<p class="cond">${intro}</p>` : ""}\n${body}\n</div>`;
}

/* ---------- changelog: deep-compare specs with the previous version of the same platform ---------- */
type Changelog = { added: string[]; changed: string[]; removed: string[]; conds: string[] };

function diffVersions(prev: Version, next: Version): Changelog {
  const pm = new Map(prev.pages.map((p) => [p.id, p]));
  const nm = new Map(next.pages.map((p) => [p.id, p]));
  const added = [...nm.keys()].filter((id) => !pm.has(id)).sort();
  const removed = [...pm.keys()].filter((id) => !nm.has(id)).sort();
  const changed = [...nm.keys()].filter((id) => pm.has(id) && stable(pm.get(id)) !== stable(nm.get(id))).sort();
  const cols = [...new Set([...COLUMN_ORDER, ...Object.keys(prev.columns), ...Object.keys(next.columns)])];
  const conds = cols.filter(
    (c) => (prev.columns[c] || next.columns[c]) && stable(prev.columns[c] ?? null) !== stable(next.columns[c] ?? null),
  );
  return { added, changed, removed, conds };
}

function renderChangelog(v: Version, prev: Version | null): string {
  if (!prev) return `<div class="chlog"><span class="vs">First version</span><span>nothing to compare with yet</span></div>`;
  const d = diffVersions(prev, v);
  const part = (cls: string, label: string, ids: string[]) =>
    ids.length ? `<span><span class="${cls}">${label}</span> ${ids.join(", ")}</span>` : "";
  const bits = [
    part("add", "Added", d.added),
    part("chg", "Changed", d.changed),
    part("rem", "Removed", d.removed),
    part("chg", "Column conditions changed", d.conds),
  ].filter(Boolean);
  return `<div class="chlog"><span class="vs">Compared with ${prev.name}</span>${bits.length ? bits.join("") : "<span>no changes</span>"}</div>`;
}

/* ---------- page assembly ---------- */
function fontFace(): string {
  if (!existsSync(CAB_FONT)) return "";
  const b64 = readFileSync(CAB_FONT).toString("base64");
  return `@font-face { font-family:"Cedarville Cursive"; font-style:normal; font-weight:400; font-display:swap;\n` +
         `  src:url("data:font/woff2;base64,${b64}") format("woff2"); }`;
}

function platformStyle(id: string): string {
  const path = join(ROOT, "shared", "platforms", `${id}.css`);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function buildIndex(platforms: Platform[]): string {
  const css = readFileSync(join(ROOT, "shared", "frame.css"), "utf8");
  const js = readFileSync(join(ROOT, "shared", "board.js"), "utf8");
  const first = platforms[0];
  const latest = first.versions[first.versions.length - 1].name;

  const manifest = platforms.map((pf) => ({ id: pf.id, label: pf.label, versions: pf.versions.map((v) => v.name) }));

  const pfButtons = platforms
    .map((pf) => `<button type="button" role="tab" data-platform="${pf.id}" aria-selected="${pf === first}">${pf.label}</button>`)
    .join("");
  const verOptions = first.versions
    .map((v) => `<option value="${v.name}"${v.name === latest ? " selected" : ""}>${v.name}</option>`)
    .reverse().join("");

  const sections = platforms.flatMap((pf) =>
    pf.versions.map((v, i) => {
      const cols = columnsOf(v);
      const head = `<div class="vhead">\n` +
        `<h1>${pf.label} <span class="vn">${v.name}</span></h1>\n` +
        `<p class="vsub">${cols.length} ${cols.length === 1 ? "column" : "columns"}, ${v.pages.length} ${v.pages.length === 1 ? "spec" : "specs"}, every page as its role sees it</p>\n` +
        renderChangelog(v, i > 0 ? pf.versions[i - 1] : null) + `\n</div>`;
      const board = `<div class="board">\n` +
        cols.map((c) => `<!-- ${pf.id} ${v.name}: ${c} -->\n${scrub(renderColumn(c, v, pf))}`).join("\n\n") +
        `\n</div>`;
      return `<section class="version pf-${pf.id}" data-platform="${pf.id}" data-version="${v.name}" lang="${v.lang ?? pf.lang}" hidden>\n${head}\n${board}\n</section>`;
    }),
  ).join("\n\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design workbench</title>
<style>
${fontFace()}
${css}
${platforms.map((pf) => platformStyle(pf.id)).join("\n")}
</style>
</head>
<body>
<header class="wb">
  <div class="wb-bar">
    <span class="wb-name">Design workbench</span>
    <div class="wb-field"><span class="wb-label">Platform</span>
      <div class="wb-seg" id="platform" role="tablist" aria-label="Platform">${pfButtons}</div></div>
    <label class="wb-field"><span class="wb-label">Version</span>
      <select id="version" aria-label="Version">${verOptions}</select></label>
    <span class="wb-hint">Click a page to leave a note. Captions show the route and, in green, the engine call behind it.</span>
    <button type="button" class="wb-theme" id="theme" data-state="auto" title="Theme: follows the system">Auto</button>
    <button type="button" class="wb-go" id="export">Export notes</button>
  </div>
</header>

<main class="wb-main">
${sections}
</main>

<div id="ov"><div id="modal">
  <h4 id="m-title"></h4><div class="mp" id="m-path"></div>
  <textarea id="m-ta" placeholder="Your prompt for this page"></textarea>
  <div class="hint">Click outside to close; the note is kept and the page gets a gold dot. Export notes saves the notes of the version on screen.</div>
</div></div>

<p class="wb-foot">Generated by webdesign/build.ts from targets/&lt;platform&gt;/&lt;version&gt;/*.json; edit the specs, never this file.</p>

<script>
window.__WD = ${JSON.stringify({ platforms: manifest, initial: { platform: first.id, version: latest } })};
${js}
</script>
</body>
</html>
`;
}

/* ---------- main ---------- */
function main() {
  if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });
  const platforms: Platform[] = [];
  for (const id of readdirSync(TARGETS_DIR).filter((t) => statSync(join(TARGETS_DIR, t)).isDirectory())) {
    const pf = loadPlatform(id);
    if (!pf) { console.log(`- ${id}: no versions, left out`); continue; }
    platforms.push(pf);
  }
  if (!platforms.length) { console.log("nothing to build"); return; }
  platforms.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  // one page now; earlier builds wrote dist/<platform>.html
  for (const f of readdirSync(DIST)) if (f.endsWith(".html") && f !== "index.html") rmSync(join(DIST, f));
  writeFileSync(join(DIST, "index.html"), buildIndex(platforms));
  for (const pf of platforms)
    console.log(`✓ ${pf.label}: ${pf.versions.map((v) => `${v.name} (${v.pages.length})`).join(", ")}`);
  console.log("→ dist/index.html");
}

main();
