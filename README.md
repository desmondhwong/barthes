# barthes

> hx generated 261101-135501-001 current — approved Barthes first-pass implementation; project barthes, organization authentic, author desmond.

Barthes is a Next.js/TypeScript hypertext reader: pages and their authored hyperlinks share a continuous reading/graph surface. This repository is the new maintained application source. The existing Sitemap prototype and its snapshots remain separate, preserved baselines.

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
| `?pages=N` | Explicitly load up to N Are.na result pages, capped at 10. |
| `/barthes/...` and recognized `.html` paths | Legacy HLC aliases on this host. |
| `/api/health` | Read-only runtime database/environment check; returns no keys. |

**Content and ownership.** [`content/hlc`](content/hlc) holds the 34 already-published HLC Markdown adaptations, with their original IDs and 132 directed authored links. [`provenance/content-manifest.json`](provenance/content-manifest.json) records exact import hashes and source mappings. The adapter in [`src/lib/content`](src/lib/content) preserves the original parser's published HTML and maps links to the new routes. Edit this repository's corpus going forward; do not edit a frozen Sitemap snapshot or import underlying private vault notes. Existing filenames identify pages, so renaming them needs an explicit identity/alias migration. The parity tests pin the initial corpus; intentional content changes require a reviewed update to their expected baseline while retaining original provenance.

[`tools/import-hlc.mjs`](tools/import-hlc.mjs) is a create-only migration/reverification tool that expects the sibling `work/sitemap` source. It refuses divergent destination bytes. Normal builds and hosting do not need that sibling directory. [`src/reader/origin-manifest.json`](src/reader/origin-manifest.json) identifies the adapted reader modules.

The Are.na adapter reads the configured public `barthes-test` channel (`5946473`). It fetches 24 entries initially, then further result pages only when requested, with a maximum of 10 pages and a five-minute server cache. Loaded-page links retain `?pages=N` for refresh/direct navigation. Only authored hyperlinks create graph edges. A block not yet loaded retains its Are.na URL until membership is known; nested channels remain external source links. Markdown HTML is escaped, unsafe URLs are rejected, and unsupported media receives an explicit source link. The HLC corpus is still Markdown-authored; it has not been uploaded to Are.na.

**Reader state.** The reader retains semantic zoom, draggable graph physics, density, branching breadcrumbs, native Back/Forward, index filters, graph arrangements, theme and hidden-interface controls. `G` switches between page and graph; Help lists the other shortcuts. Browser exploration is scoped to the corpus. Export writes version-5 JSON with a corpus identity; HLC can also import supported Sitemap version-3/4 exports. Invalid or mismatched imports preserve existing work. Exports contain exploration, preferences, saved view and breadcrumb path, but not exact node coordinates, intermediate zoom, reading scroll or display filters. A new origin does not inherit browser storage from the old site.

**Database.** [`supabase/README.md`](supabase/README.md) documents the applied development schema and verification. Versioned migrations define `owners`, `sites`, `site_sources`, `pages` and `page_aliases`. Owners are operator-only; client roles may select only explicitly public configuration through grants and row-level security, and cannot write. Document bodies, reader history and Are.na credentials are not stored there. New Are.na blocks route by source ID without runtime database writes. Apply future changes as new operator migrations; do not reapply recorded versions. No application login or administration endpoint is implemented.

**Verification and delivery.** Run the deterministic content/security/pagination, database-adapter and reader regression tests, then typecheck and build:

```sh
npm test
npm run typecheck
npm run build
```

Database SQL policy checks and browser acceptance are separate from these local tests; the Supabase guide describes the transaction-rolled-back access test. Verify navigation, graph behavior, import/export, no-JavaScript reading, mobile-sized rendering and `/api/health` against the running artifact. Emulated touch does not establish physical-device acceptance.

The approved delivery target is the `feat/first-pass` branch and a Vercel **Preview**, with the deployment environment and commit verified after deployment. This document does not assert that deployment has completed. Keep `main`, the existing `desmond.network/barthes/` site and DNS unchanged. Production promotion, OAuth, private publishing, Obsidian sync, bulk HLC upload and new offline-site exports are outside this first pass.
