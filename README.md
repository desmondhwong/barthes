# barthes

> hx generated 261101-162259-001 current — Barthes reader and Obsidian publishing development; project barthes, organization authentic, author desmond. First-pass source provenance remains in the manifests linked below.

Barthes is a Next.js/TypeScript hypertext reader: pages and their authored hyperlinks share a continuous reading/graph surface. The desktop Obsidian plugin adds reviewed publication from selected folders to Are.na, with mapped-note synchronization and conflict recovery. This repository is the maintained application and plugin source. The existing Sitemap prototype and its snapshots remain separate, preserved baselines.

Use **Node 22.x** and npm. Install the locked dependencies with `npm ci`. Create `.env.local` from [`.env.example`](.env.example) if it does not exist, then set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the existing development project. `.env.local` is ignored; commit neither credential values nor a service-role key. The application reads public configuration on the server at request time; the production build does not require live Are.na or Supabase access.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. `npm run build` prepares the server application; `npm start` serves that build locally. Server-rendered content and ordinary links work without JavaScript; the spatial graph needs JavaScript. This Next.js application requires a running server and is not a `file://` package.

| Address | Content |
| --- | --- |
| `/` | Redirects to the HLC reader. |
| `/s/hlc` | HLC home page. |
| `/s/hlc/p/<legacy-slug>` | HLC page, such as `foundations--cultural-hologram`. |
| `/s/barthes-test` | First actual block in the public Are.na test channel. |
| `/s/barthes-test/p/<block-id>` | A block in the loaded channel corpus. |
| `/n/<channel-id-or-slug>` | Any publicly readable Are.na channel; successful slug entries redirect to the stable numeric channel ID. |
| `/n/<channel-id>/p/<block-id>` | A block belonging to that loaded public net. |
| `?pages=N` | Explicitly load up to N Are.na result pages, capped at 10. |
| `/barthes/...` and recognized `.html` paths | Legacy HLC aliases on this host. |
| `/api/health` | Read-only runtime database/environment check; returns no keys. |

**Content and ownership.** [`content/hlc`](content/hlc) holds the 34 already-published HLC Markdown adaptations, with their original IDs and 132 directed authored links. [`provenance/content-manifest.json`](provenance/content-manifest.json) records exact import hashes and source mappings. The adapter in [`src/lib/content`](src/lib/content) preserves the original parser's published HTML and maps links to the new routes. Edit this repository's corpus going forward; do not edit a frozen Sitemap snapshot or import underlying private vault notes. Existing filenames identify pages, so renaming them needs an explicit identity/alias migration. The parity tests pin the initial corpus; intentional content changes require a reviewed update to their expected baseline while retaining original provenance.

[`tools/import-hlc.mjs`](tools/import-hlc.mjs) is a create-only migration/reverification tool that expects the sibling `work/sitemap` source. It refuses divergent destination bytes. Normal builds and hosting do not need that sibling directory. [`src/reader/origin-manifest.json`](src/reader/origin-manifest.json) identifies the adapted reader modules.

The Are.na adapter reads the configured public `barthes-test` channel (`5946473`) and public nets through `/n/`. New public channel routes require no database seed. The reader fetches 24 entries initially, then further result pages only when requested, with a maximum of 10 pages / 240 source items and a five-minute content cache. Loaded-page links retain `?pages=N` for refresh/direct navigation. Only authored hyperlinks create graph edges. A block not yet loaded retains its Are.na URL until membership is known; nested channels remain external source links. Markdown HTML is escaped, unsafe URLs are rejected, and unsupported media receives an explicit source link. The HLC corpus is still Markdown-authored; it has not been uploaded to Are.na.

**Reader state.** The reader retains semantic zoom, draggable graph physics, density, branching breadcrumbs, native Back/Forward, index filters, graph arrangements, theme and hidden-interface controls. `G` switches between page and graph; Help lists the other shortcuts. Browser exploration is scoped to the corpus. Export writes version-5 JSON with a corpus identity; HLC can also import supported Sitemap version-3/4 exports. Invalid or mismatched imports preserve existing work. Exports contain exploration, preferences, saved view and breadcrumb path, but not exact node coordinates, intermediate zoom, reading scroll or display filters. A new origin does not inherit browser storage from the old site.

**Database.** [`supabase/README.md`](supabase/README.md) documents the applied development schema and verification. Versioned migrations define `owners`, `sites`, `site_sources`, `pages` and `page_aliases`. Owners are operator-only; client roles may select only explicitly public configuration through grants and row-level security, and cannot write. Document bodies, reader history and Are.na credentials are not stored there. New Are.na blocks route by source ID without runtime database writes. Apply future changes as new operator migrations; do not reapply recorded versions. No application login or administration endpoint is implemented.

**Obsidian publishing.** [`packages/obsidian/README.md`](packages/obsidian/README.md) gives the installation, user flow, recovery rules and current verification limits. The plugin requires desktop Obsidian 1.11.4 or later. Build it with `npm run build:obsidian`; the generated `main.js`, `manifest.json` and `styles.css` are placed in `packages/obsidian/dist`. [`packages/sync`](packages/sync) contains the host-independent synchronization engine, scoped Markdown conversion, Are.na transport and PKCE authorization helpers.

The workflow is **Connect Are.na → choose a folder or explicitly choose the whole vault → choose or create a publicly readable channel → Review → Publish reviewed changes → Open Barthes**. Multiple nets can use separate folders in one vault; overlapping selections are refused. The plugin writes directly to Are.na and uses no MCP runtime. Its public OAuth client ID is a nonsecret application identifier; browser authorization requests `write` scope and keeps the returned token in Obsidian SecretStorage. Sync baselines and conflict copies remain in local plugin data. New notes always require a manual publication review, including when automatic updates are enabled.

Only Markdown text and supported authored links are published. YAML frontmatter stays local. Attachments, embeds, unsupported link forms and links leaving the selected source block publication. Pull applies Are.na changes to existing mapped notes; it does not import newly added remote blocks. Publication creates block identities before writing final linked bodies, so an interrupted first publication can leave temporary “Publication in progress.” blocks. The retained mappings allow a later review to resume without blindly creating duplicates. Are.na exposes no documented conditional-update operation; rereads detect ordinary conflicts, but cannot eliminate a remote edit occurring between the final GET and PUT. The plugin is intended for one publishing device per synced vault, without a distributed lock.

**Verification and delivery.** Run the deterministic content/security/pagination, database-adapter and reader regression tests, then typecheck and build:

```sh
npm test
npm run typecheck
npm run build
npm run build:obsidian
```

Database SQL policy checks and browser acceptance are separate from these local tests; the Supabase guide describes the transaction-rolled-back access test. Verify navigation, graph behavior, import/export, no-JavaScript reading, mobile-sized rendering and `/api/health` against the running artifact. Emulated touch does not establish physical-device acceptance.

The second-slice local checks include 159 automated tests (including 28 sync tests and six plugin controller tests), 26 panel checks, and 11 local reader browser journeys. The user subsequently connected the installed plugin to Are.na, published three notes to a new net, and verified an edited note updating its existing block. The plugin's connected state and saved remote mappings are confirmed. Live pull/conflict round trips and multiple-vault operation remain unverified. Evidence and the earlier blocked authorization attempt are retained in the development record.

The delivery target remains the `feat/first-pass` branch and Vercel **Preview**, with environment and commit checked after deployment. The plugin's default reader origin is the [branch Preview alias](https://barthes-git-feat-first-pass-desmondhwong.vercel.app), which requires Vercel sign-in. That alias can advance with branch deployments and is not evidence that a particular source revision is running. Configure and verify a production reader origin before public plugin distribution. The original `desmond.network/barthes/` site, DNS and `main` remain outside this slice. Private-source publishing, public web account sessions, bulk HLC upload, mobile Obsidian support, new offline-site exports and production cutover remain separate work.
