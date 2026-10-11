# webdesign

Declarative, versioned design workbench. Every page of every platform is a JSON
spec under `targets/<platform>/<version>/`; the build renders them all into one
self-contained page, `dist/index.html`, with a platform switch, a version switch,
a changelog strip, and the note modal with Export notes.

`legacy/design/` stays the read-only reference; this directory is the tracked,
reproducible source of truth for page setups.

## The workbench

- **Platform switch** (top bar): one button per platform that has at least one
  version. Today: `cab`, `main (uadebate.com)` and `dfu (dfu.uadebate.com)`.
- **Version switch**: the versions of the chosen platform, newest first. The
  choice is kept in the URL hash (`index.html#cab/v3.8`, `#uadebate/v1`), so a
  link opens the same board.
- **Changelog strip**: under the title, the pages added, changed and removed, and
  the column conditions changed, compared with the previous version of the same
  platform. It is computed from the specs, never written by hand.
- **Notes**: click any page (or API row) for the note modal; a gold dot marks a
  page with a note. Notes are kept in localStorage per platform+version+page, so
  switching never mixes them. **Export notes** downloads
  `<platform>-pages-notes-<version>.json` for the board on screen.
- **Theme**: Auto follows the system; Light and Dark pin it, as in cab.
- **Frames look like the product**: cab frames use cab's own tokens and component
  rules (`platform/apps/cab/assets/css/app.css`) and its Cedarville Cursive
  wordmark, light and dark; uadebate frames use the legacy uadebate design system
  (`legacy/design/spec.css`), which has no dark theme, in v1; from v2 they take
  cab's tokens and wordmark, light and dark.

## Layout

```
webdesign/
  build.ts                  spec reader + renderer → dist/index.html
  check.ts                  assertions over the built page (run after build)
  shared/frame.css          the workbench: tokens (cab's), header, switches, columns, captions, modal
  shared/board.js           switches, note modal, per-version localStorage notes, export, theme
  shared/platforms/cab.css  cab pages inside their frames, after app.css
  shared/platforms/uadebate.css  uadebate.com pages inside their frames, after legacy spec.css
  shared/platforms/dfu.css  dfu pages: cab.css under .pf-dfu plus journal numbers, chips, votes, forms
  targets/
    cab/platform.json       label and order in the platform switch
    cab/v*/                 cab versions (below)
    uadebate/platform.json  label "main (uadebate.com)", Ukrainian, 1120px frames
    uadebate/v1/            the uadebate.com front page, legacy look
    uadebate/v2/            the whole site in cab's look: public and content manager
    uadebate/v3/            the site in English, one column per scope as in cab (_version.json sets lang en)
    uadebate/v4/            v3 with no sign-in on the site; editors arrive by a given link to /manage
    uadebate/v5/            v4 where public pages look the same to everyone; signed-in state only in the /manage ribbon
    uadebate/v6/            v5 where clubs are cab's: the directory reads cab, no club editor under /manage
    dfu/platform.json       label "dfu (dfu.uadebate.com)", English
    dfu/v1/                 the NGO cabinet, one column per scope as in cab
  dist/                     build output (gitignored)
```

The build also inlines `platform/apps/cab/priv/static/fonts/cedarville-cursive.woff2`
(read only); without it the wordmark falls back to a cursive system face.

## Versions

### cab

| Version | What changed |
|---|---|
| v1 | first board, ported from legacy/design/pages-board.html |
| v2 | pages-board state + coverage fixes |
| v2.1 | ballot correction: unlock + resubmit, no reopen |
| v2.2 | edit ballot only, lock is internal; the role ladder, every step inherits the pages below it |
| v2.3 | honest full navs, my page split from the cabinet, join and account re-homed, rooms = draw, footer on the front page |
| v3 | two trees only: one URL per view, identity gates actions; one room URL, one registration URL with QR; prefilled ballot edit; one gold action per page |
| v3.1 | the User step: anonymous split from signed-in; club standings get their own page |
| v3.2 | rebuilt from the code: real routes and templates, LiveView pages marked, records-backed lists, live allocator with a server draft |
| v3.3 | role-less registration with a seat-based room count, SPK/ADJ seat tags, one remove verb, one people table + add form, public rosters, no middle dots |
| v3.4 | the launch-prep round: directory for everyone, My page, Google sign-in with link and merge, guests claimed by the engine's token, Policy and Terms, the add field's outcomes, a Motions table, Prep ends at, iron speeches |
| v3.5 | club-night feedback: one per team after the ballot, accuracy + reasoning and a discussion, public average with a base vote of 5 |
| v3.6 | one command, one place: a form whose command sits in the top bar has no button of its own |
| v3.7 | feedback lives in the engine: questions, answers and the score there, the adjudicator average from stats/adjudicators?base=5 |
| v3.8 | the engine keeps each room's prep end (PATCH /api/rooms/:id/prep, prep_ends_at on the motion call), shown as built; a club rename renames its engine organisation first; no planning markers |
| v3.9 | the club profile gains format, language and audience, kept by the club head; GET /clubs lists every club's public profile for other services |

### main (uadebate.com)

| Version | What changed |
|---|---|
| v1 | the front page from legacy/design/uadebate.html, markup and Ukrainian text as is |
| v2 | the whole site in cab's look and rules: one header (UAdebates wordmark in Cedarville Cursive, seven-item nav, Кабінет) and one footer on every page; home, news, article, tournaments (under construction), calendar, clubs with filters and a map, club, ratings, about, sign-in; a content-manager column with news, event and club editors and a calendar with private events; cab's tokens light and dark, at most one gold action, no middle dots, no arrows |
| v3 | in English (Ukrainian later), one column per scope as in cab: public, user, content manager, admin, Phoenix API; pages cut to Home, News, Calendar (mostly tournaments, private events for content managers only), Clubs and About, which carries the history ported from the Wix About page (Mission, Goal, Means, the 2011 to 2015 year line, the 16 branches); Sign in hands off to cab; the footer shows only the real addresses ngo.dfu@ and support@uadebate.com and Telegram; admins grant the content-manager role |
| v4 | v3 with no sign-in on uadebate.com: no Sign in item or page and no user column, since a signed-in person without a role sees the public site; editors get the link uadebate.com/manage from the admin and sign in on cab; every /manage address is 404 without the role; the admin is a cab admin (cab's is_admin read downward) on /manage/people; columns Public, Content manager, Admin, Phoenix API; the content-manager ribbon stays |
| v5 | public pages look the same to everyone, content managers and admins included: they never read the session, so no name, avatar, Edit link, ribbon or private event shows outside /manage; the site header is the same under /manage, and the ribbon there is the one place with the role, the person, View site and Sign out; the content manager's calendar moves to /manage/calendar |
| v6 | clubs are cab's: the directory and club page read cab's public club API (format, language, audience kept by the club head in cab) and cache it; map points come from a fixed city table; no club editor or club writes under /manage, the ribbon is Overview, News, Calendar |

### dfu (dfu.uadebate.com)

| Version | What changed |
|---|---|
| v1 | the NGO cabinet in cab's look (sidenav with the dfu wordmark, the bar with one gold action), in English: the Danish model of legacy/design/dfu.html and the legacy spec (journal numbers IN/OUT, cases Open/Waiting/Closed, votes signed to count with quorum shown, announcements, documents Internal/Public), and the org structure from the Wix site (leadership, supervisory board, 16 branch heads, the AKS register); columns member, branch head, board, secretariat (admin), Phoenix API; 404 for anyone without a dfu role; roles keyed by the cab account id, cab never links to dfu |

## Run

```sh
bun run build    # renders dist/index.html from every platform with versions
bun run check    # asserts the built page against the specs
bun run test     # build + check
```

## Spec schema

One JSON per page:

```json
{ "id": "pub-club", "title": "Club welcome", "column": "public", "order": 20,
  "path": "GET /c/:club", "api": ["GET organisations/:id events + rooms"],
  "nav": {"items": ["Club","Rooms"], "context": "Kyiv DC", "active": "Club", "profile": "Sign in"},
  "chrome": {"crumb": "Club", "segs": [{"label": "Send request", "kind": "gold"}]},
  "blocks": [
    {"type": "section", "title": "Club sessions"},
    {"type": "card", "lines": ["<b>first line</b>", "muted follow-up"]},
    {"type": "table", "head": ["#","Name"], "rows": [["rk::39","…"]], "rowClass": {"0": "me"}},
    {"type": "banner", "kind": "info|gold", "html": "…"},
    {"type": "tabs", "items": ["Teams","Speakers"], "active": "Speakers"},
    {"type": "note", "text": "what the frame cannot show"},
    {"type": "raw", "html": "escape hatch: bare pages and whole ported pages"}
  ] }
```

- Content strings are raw HTML (specs are trusted, authored by hand).
- Table cells may carry a class prefix: `"rk::39"` → `<td class="rk">39</td>`,
  `"sd og::Taras &amp; Yuri"` → `<td class="sd og">…</td>`. cab cell classes:
  `rk`, `num`, `code`, `st`, `mut`, `sd` + `og|oo|cg|co`.
- `"bare": true` drops the nav and chrome shell; blocks render straight into the frame.
- Seg kinds: `gold` (the page's one action), `quiet` (muted), omitted = plain.
- A LiveView page marks its path with `<span class="live">LIVE</span>`.
- `note` blocks render as a dashed design note, apart from the page itself.
- API-reference columns use the swagger kind:

```json
{ "id": "phoenix-api", "column": "phoenix-api", "kind": "swagger",
  "groups": [{"title": "clubs", "rows": [
    {"id": "api-club-get", "method": "GET", "path": "/clubs/:uuid",
     "desc": "…", "api": "GET organisations/:id …"}]}] }
```

- `_columns.json` holds each column's title and condition paragraph for that
  version (conditions are versioned content too).
- Columns render in ladder order: public, user, participant, judge, member,
  owner, admin, phoenix-api, engine-api; a platform's own column names follow, in
  `_columns.json` order. The column count is computed, never hardcoded.
- Page ids are unique within a platform+version.
- Older versions carry an `m8b` field and milestone tags (M8b, M9a…) from the
  planning days. The build ignores the field and strips the tags; new versions
  carry neither.

`targets/<platform>/platform.json` (all optional): `label` (the switch text,
default the directory name), `order` (switch position), `lang` (the board's
`lang`, default `en`), `frameWidth` (column width in px, default 720).

## Add a version

1. Copy the latest version of the platform: `cp -r targets/cab/v3.8 targets/cab/v3.9`.
2. Edit the specs (and `_columns.json`): only what actually changed.
3. `bun run test`, and add the version's own checks to `check.ts`.

Never edit an existing version's specs: a version is a record. Pages removed in
a new version stay visible under the old one.

## Add a platform

1. `targets/<name>/v1/` with `_columns.json` and page specs.
2. `targets/<name>/platform.json` for its label, language and frame width.
3. `shared/platforms/<name>.css` for what its pages look like, scoped to
   `.pf-<name> .frame`.

The build picks it up and adds it to the platform switch.

## Rules

- Do not alter design content when porting: extraction must be faithful.
- `legacy/design/` is read-only reference; never edit it from here.
- `dist/` is generated; never hand-edit, never commit.
