/* webdesign build — renders targets/<target>/<version> page specs into dist/<target>.html.
   Zero runtime deps; run with: bun run build.ts
   Output is self-contained (frame.css + board.js inlined), one hidden board per
   version, toggled client-side by the version <select>. */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join } from "path";

const ROOT = new URL(".", import.meta.url).pathname;
const TARGETS_DIR = join(ROOT, "targets");
const DIST = join(ROOT, "dist");

// the role ladder, weakest first: every successor inherits all
// predecessor pages and adds its own (the two APIs sit above admin —
// cab api serves every page verb, engine api is cab's internal store)
const COLUMN_ORDER = [
  "public", "participant", "judge", "member", "owner", "admin", "phoenix-api", "engine-api",
];
const COLUMN_CLASS: Record<string, string> = {
  "engine-api": "c-api", "phoenix-api": "c-api", admin: "c-adm", public: "c-pub",
  owner: "c-own", member: "c-mem", participant: "c-par", judge: "c-jud",
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
  api?: string[]; m8b?: boolean; bare?: boolean;
  nav?: { items: string[]; context?: string; active?: string; profile?: string };
  chrome?: { crumb: string; segs?: Seg[] };
  blocks?: Block[];
  kind?: "swagger"; intro?: string;
  groups?: { title: string; rows: SwagRow[] }[];
};
type SwagRow = { id: string; method: string; path: string; desc: string; api?: string; apiNone?: boolean; m8b?: boolean; t?: string };
type Columns = Record<string, { title: string; cond: string }>;
type Version = { name: string; columns: Columns; pages: PageSpec[] };

/* ---------- helpers ---------- */
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function stable(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object")
    return "{" + Object.keys(v as object).sort().map((k) => JSON.stringify(k) + ":" + stable((v as any)[k])).join(",") + "}";
  return JSON.stringify(v);
}

function loadVersion(dir: string, name: string): Version {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  let columns: Columns = {};
  const pages: PageSpec[] = [];
  for (const f of files) {
    const data = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (f === "_columns.json") columns = data;
    else if (!f.startsWith("_")) pages.push(data);
  }
  pages.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
  return { name, columns, pages };
}

/* ---------- block renderers (mirror design/pages-board.html markup) ---------- */
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
  if (b.head?.length) h += `<tr>${b.head.map((th) => `<th>${th}</th>`).join("")}</tr>`;
  (b.rows ?? []).forEach((row, i) => {
    const cls = b.rowClass?.[String(i)];
    h += `<tr${cls ? ` class="${cls}"` : ""}>${row.map(cell).join("")}</tr>`;
  });
  return h + `</table></div>`;
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
    case "note": return `<div class="card"><div class="pad mut">${b.text ?? ""}</div></div>`;
    case "raw": return b.html ?? "";
    case "tabs": return ""; // lifted out of the body — rendered by renderPage
    default: throw new Error(`unknown block type: ${b.type}`);
  }
}

function renderTabs(b: Block): string {
  return `<div class="tabs">${(b.items ?? [])
    .map((t) => `<a${t === b.active ? ` class="on"` : ""} href="#">${t}</a>`).join("")}</div>`;
}

function renderPage(p: PageSpec): string {
  const api = (p.api ?? []).map((a) => `<span class="eng">${a}</span>`).join("");
  const cap = `<div class="cap">${p.path ?? ""}${api}</div>`;
  let inner: string;
  if (p.bare) {
    inner = (p.blocks ?? []).map(renderBlock).join("\n");
  } else {
    const nav = p.nav
      ? `<nav class="nav"><div class="cp">cab</div>` +
        (p.nav.context ? `<div class="sc">${p.nav.context}</div>` : "") +
        p.nav.items.map((it) => `<a${it === p.nav!.active ? ` class="on"` : ""} href="#">${it}</a>`).join("") +
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

function renderColumn(name: string, v: Version): string {
  const meta = v.columns[name] ?? { title: name, cond: "" };
  const pages = v.pages.filter((p) => p.column === name);
  const body = pages.map((p) => (p.kind === "swagger" ? renderSwagger(p) : renderPage(p))).join("\n\n");
  const intro = pages.find((p) => p.intro)?.intro;
  return `<div class="col ${COLUMN_CLASS[name] ?? ""}" data-col="${name}"><h3>${meta.title}</h3>\n` +
         `<p class="cond">${meta.cond}</p>${intro ? `\n<p class="cond">${intro}</p>` : ""}\n${body}\n</div>`;
}

/* ---------- changelog: deep-compare specs between consecutive versions ---------- */
type Changelog = { added: string[]; changed: string[]; removed: string[]; conds: string[] };

function diffVersions(prev: Version, next: Version): Changelog {
  const pm = new Map(prev.pages.map((p) => [p.id, p]));
  const nm = new Map(next.pages.map((p) => [p.id, p]));
  const added = [...nm.keys()].filter((id) => !pm.has(id)).sort();
  const removed = [...pm.keys()].filter((id) => !nm.has(id)).sort();
  const changed = [...nm.keys()].filter((id) => pm.has(id) && stable(pm.get(id)) !== stable(nm.get(id))).sort();
  const conds = COLUMN_ORDER.filter(
    (c) => (prev.columns[c] || next.columns[c]) && stable(prev.columns[c] ?? null) !== stable(next.columns[c] ?? null),
  );
  return { added, changed, removed, conds };
}

function renderChangelog(v: Version, prev: Version | null): string {
  if (!prev) return `<div class="chlog"><b>${v.name}</b> — baseline (no previous version).</div>`;
  const d = diffVersions(prev, v);
  const part = (cls: string, label: string, ids: string[]) =>
    ids.length ? `<span class="${cls}">${label}:</span> ${ids.join(", ")}` : "";
  const bits = [
    part("add", `added in ${v.name}`, d.added),
    part("chg", `changed in ${v.name}`, d.changed),
    part("rem", `removed in ${v.name}`, d.removed),
    part("chg", "column conditions changed", d.conds),
  ].filter(Boolean);
  return `<div class="chlog"><b>${v.name}</b> vs ${prev.name} — ${bits.length ? bits.join(" · ") : "no changes"}</div>`;
}

/* ---------- page assembly ---------- */
function buildTarget(target: string, versions: Version[]): string {
  const css = readFileSync(join(ROOT, "shared", "frame.css"), "utf8");
  const js = readFileSync(join(ROOT, "shared", "board.js"), "utf8");
  const latest = versions[versions.length - 1].name;

  const options = versions
    .map((v) => `<option value="${v.name}"${v.name === latest ? " selected" : ""}>${v.name}</option>`)
    .join("");

  const vheads = versions
    .map((v, i) => {
      const cols = COLUMN_ORDER.filter((c) => v.pages.some((p) => p.column === c));
      return `<div class="version" data-version="${v.name}" hidden>\n` +
        `<h1>${target} pages board — ${cols.length} columns, every page as its role sees it</h1>\n` +
        `<p><b>Click any page</b> → prompt modal pops up (type, click outside to close; gold dot = has a note).\n` +
        `   <b>Export notes</b> (bottom right) downloads ${target}-pages-notes-&lt;version&gt;.json — notes are kept per version.\n` +
        `   Caption over each page: phoenix path + <span style="color:var(--ok)">engine command</span>. <span style="color:var(--warn);font-weight:700">M8b</span> = specced, not yet built.</p>\n` +
        renderChangelog(v, i > 0 ? versions[i - 1] : null) + `\n</div>`;
    })
    .join("\n");

  const boards = versions
    .map((v) => {
      const cols = COLUMN_ORDER.filter((c) => v.pages.some((p) => p.column === c));
      return `<div class="board version" data-version="${v.name}" hidden>\n\n` +
        cols.map((c) => `<!-- ============ ${c.toUpperCase()} · ${v.name} ============ -->\n${renderColumn(c, v)}`).join("\n\n") +
        `\n</div>`;
    })
    .join("\n\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${target} pages board</title>
<style>
${css}
</style>
</head>
<body>
<header>
  <div class="verbar">
    <select id="ver">${options}</select>
    <span class="wb">generated by webdesign/build.ts — edit targets/${target}/&lt;version&gt;/*.json, never this file</span>
  </div>
${vheads}
</header>

${boards}

<div id="ov"><div id="modal">
  <h4 id="m-title"></h4><div class="mp" id="m-path"></div>
  <textarea id="m-ta" placeholder="your prompt for this page…"></textarea>
  <div class="hint">click outside to close — the note is kept (gold dot). Export notes → ${target}-pages-notes-&lt;version&gt;.json.</div>
</div></div>
<button id="export">Export notes</button>

<script>
window.__WD = { target: ${JSON.stringify(target)} };
${js}
</script>
</body>
</html>
`;
}

/* ---------- main ---------- */
function main() {
  if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });
  const targets = readdirSync(TARGETS_DIR).filter((t) => statSync(join(TARGETS_DIR, t)).isDirectory());
  let built = 0;
  for (const target of targets) {
    const tdir = join(TARGETS_DIR, target);
    // versions are v<major> or v<major>.<minor> (v2 = v2.0), sorted numerically
    const vnum = (d: string): [number, number] => {
      const [maj, min] = d.slice(1).split(".");
      return [Number(maj), Number(min ?? 0)];
    };
    const vdirs = readdirSync(tdir)
      .filter((d) => /^v\d+(\.\d+)?$/.test(d) && statSync(join(tdir, d)).isDirectory())
      .sort((a, b) => vnum(a)[0] - vnum(b)[0] || vnum(a)[1] - vnum(b)[1]);
    if (!vdirs.length) { console.log(`- ${target}: no versions, skipped`); continue; }
    const versions = vdirs.map((d) => loadVersion(join(tdir, d), d));
    const html = buildTarget(target, versions);
    const out = join(DIST, `${target}.html`);
    writeFileSync(out, html);
    built++;
    console.log(`✓ ${target}: ${versions.map((v) => `${v.name} (${v.pages.length} specs)`).join(", ")} → dist/${target}.html`);
  }
  if (!built) console.log("nothing to build");
}

main();
