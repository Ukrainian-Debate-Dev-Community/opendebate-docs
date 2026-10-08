# webdesign

Declarative, versioned design workbench. Page boards (the mini-frame grids from
`design/pages-board.html`) are described as JSON specs per target and version;
the build renders a single self-contained HTML board per target with a version
switcher, a computed changelog strip and the usual comment modal + note export.

`design/` stays the read-only reference; this directory is the tracked,
reproducible source of truth for page setups.

## Layout

```
webdesign/
  build.ts            spec reader + renderer → dist/<target>.html
  check.ts            assertions over the built board (run after build)
  shared/frame.css    page-window chrome, ported verbatim from design/pages-board.html
  shared/board.js     comment modal, per-version localStorage notes, export, version switch
  targets/
    cab/v1/*.json     one spec per page (plus _columns.json) — version 1
    cab/v2/*.json     version 2 (current pages-board state + coverage fixes)
    cab/v2.1/*.json   version 2.1 (ballot correction: unlock + resubmit, no reopen)
    cab/v3.1/*.json   version 3.1 (ladder gains the User step — anonymous split from
                      signed-in; cabinet/my page/account/join/session re-homed there;
                      club standings get their own page, three tabs, latest finished
                      session default)
    cab/v3/*.json     version 3 (two trees only: one URL per view, identity gates
                      actions; one room URL, one registration URL /r/:sess with QR;
                      prefilled ballot edit; one gold action per page; cache rule —
                      finished sessions cached hard, live page no-store)
    cab/v2.3/*.json   version 2.3 (the v2.2 notes round: honest full navs, my page
                      split from the cabinet, join/account re-homed, rooms = draw,
                      footer demo on the front page)
    cab/v2.2/*.json   version 2.2 (edit ballot only — lock is internal; role ladder
                      public → participant/judge → member → owner → admin → cab api
                      → engine api, every step inherits the pages below it)
    dfu/              empty scaffold, ready for specs
    uadebate/         empty scaffold, ready for specs
  dist/               build output (gitignored)
```

## Run

```sh
bun run build    # renders dist/<target>.html for every target with versions
bun run check    # asserts the built cab board (ids, column count, changelog)
bun run test     # build + check
```

Open `dist/cab.html`; the select (top-left) switches versions. Click any page
for the note modal; Export notes downloads `cab-pages-notes-<version>.json`.
Notes are stored per target+version+page in localStorage, so switching
versions never mixes them.

## Spec schema

One JSON per page:

```json
{ "id": "pub-club", "title": "Club welcome", "column": "public", "order": 20,
  "path": "GET /c/:club", "api": ["GET organisations/:id events + rooms"],
  "m8b": false,
  "nav": {"items": ["Club","Rooms"], "context": "Kyiv DC", "active": "Club", "profile": "sign in"},
  "chrome": {"crumb": "club", "segs": [{"label": "Send request", "kind": "gold"}]},
  "blocks": [
    {"type": "section", "title": "Club Sessions"},
    {"type": "card", "lines": ["<b>first line</b>", "muted follow-up"]},
    {"type": "table", "head": ["#","Name"], "rows": [["rk::39","…"]], "rowClass": {"0": "me"}},
    {"type": "banner", "kind": "info|gold", "html": "…"},
    {"type": "tabs", "items": ["Teams","Speakers"], "active": "Speakers"},
    {"type": "note", "text": "muted explainer"},
    {"type": "raw", "html": "escape hatch — used only by the bare /signin split page"}
  ] }
```

Notes on the schema:

- Content strings are raw HTML (specs are trusted, authored by hand).
- Table cells may carry a class prefix: `"rk::39"` → `<td class="rk">39</td>`,
  `"sd og::Taras &amp; Yuri"` → `<td class="sd og">…</td>`.
- `"bare": true` drops the nav/chrome shell; blocks render straight into the frame.
- Seg kinds: `gold` (primary), `quiet` (muted), omitted = plain.
- API-reference columns use the swagger kind:

```json
{ "id": "phoenix-api", "column": "phoenix-api", "kind": "swagger",
  "groups": [{"title": "clubs", "rows": [
    {"id": "api-club-get", "method": "GET", "path": "/clubs/:uuid",
     "desc": "…", "api": "GET organisations/:id …", "m8b": false}]}] }
```

- `_columns.json` holds each column's header title and `.cond` paragraph for
  that version (conditions are versioned content too).
- Columns render in fixed order: engine-api, phoenix-api, admin, public,
  owner, member, participant, judge. The header's column count is computed
  from the columns actually present — never hardcoded.

## Add a version

1. Copy the latest version dir: `cp -r targets/cab/v2 targets/cab/v3`.
2. Edit the specs (and `_columns.json`) — only what actually changed.
3. `bun run test`. The changelog strip (added / changed / removed page ids and
   changed column conditions) is deep-computed from the specs; pages removed in
   the new version stay visible under the old one.

## Add a target

Drop `targets/<name>/v1/` with `_columns.json` + page specs; the build picks it
up automatically and emits `dist/<name>.html`.

## Rules

- Do not alter design content when porting — extraction must be faithful.
- `design/` is read-only reference; never edit it from here.
- `dist/` is generated; never hand-edit, never commit.
