// hx generated 261101 — deterministic API/pagination, authored-edge and hostile-Markdown tests.
import assert from "node:assert/strict";
import test from "node:test";
import { ARENA_CACHE_SECONDS, ARENA_MAX_PAGES, corpusFromArenaEntries, getArenaCorpus as readArenaCorpus, normalizePageLimit, renderArenaMarkdown, type ArenaEntry } from "../../src/lib/content/arena";

const a: ArenaEntry = {id:52203993, type:"Text", state:"available", visibility:"public", title:null, created_at:"2026-10-31T22:56:08Z", content:{markdown:"Test block A\n\n[Link to B](https://www.are.na/block/52203995)\n\n"}};
const b: ArenaEntry = {id:52203995, type:"Text", state:"available", visibility:"public", title:null, created_at:"2026-10-31T22:56:13Z", content:{markdown:"Test block B"}};
const body = (data: ArenaEntry[], currentPage = 1, totalPages = 1, totalCount = data.length) => ({data, meta:{current_page:currentPage, next_page:currentPage < totalPages ? currentPage + 1 : null, total_pages:totalPages, total_count:totalCount, has_more_pages:currentPage < totalPages}});
const json = (value: unknown) => new Response(JSON.stringify(value), {headers:{"content-type":"application/json"}});
const channel = {id:5946473, type:"Channel", slug:"barthes-test", title:"Barthes test", state:"available", visibility:"closed", owner:{slug:"desmond-wong"}};
// Existing content fixtures share a separately validated public channel response.
const getArenaCorpus: typeof readArenaCorpus = (options = {}) => readArenaCorpus({...options, fetcher:async (url, init) => new URL(url).pathname.endsWith('/contents') ? options.fetcher!(url, init) : json(channel)});

test("real-channel fixture has two actual nodes and exactly one authored edge", () => {
  const corpus = corpusFromArenaEntries([a, b]);
  assert.equal(corpus.homeId, "52203993");
  assert.deepEqual(corpus.pages.map((page) => [page.id, page.links]), [["52203993", ["52203995"]], ["52203995", []]]);
  assert.match(corpus.pages[0].html, /href="\/s\/barthes-test\/p\/52203995" data-page-link=""/);
  assert.equal(corpus.pages[0].publishedDate, "2026-10-31");
});

test("initial load fetches one page, caches public reads for300 seconds and uses stable source ordering", async () => {
  const calls: string[] = [];
  const corpus = await getArenaCorpus({fetcher:async (url, init) => {
    calls.push(url);
    assert.equal(init.next.revalidate, ARENA_CACHE_SECONDS);
    assert.ok(init.signal);
    assert.equal((init.headers as Record<string, string>).Accept, "application/json");
    return json(body([a], 1, 2, 2));
  }});
  assert.equal(calls.length, 1);
  assert.match(calls[0], /page=1&per=24&sort=position_asc$/);
  assert.equal(corpus.status?.kind, "partial");
  assert.equal(corpus.source?.nextPage, 2);
  assert.deepEqual(corpus.pages[0].links, []);
  assert.match(corpus.pages[0].html, /href="https:\/\/www.are.na\/block\/52203995"/);
});

test("explicit incremental load resolves previously unknown membership and retains pages query through direct links", async () => {
  const calls: number[] = [];
  const corpus = await getArenaCorpus({pageLimit:2, channelId:"5946473", fetcher:async (url) => {
    assert.match(url, /\/channels\/5946473\/contents/);
    const page = Number(new URL(url).searchParams.get("page")); calls.push(page);
    return json(body([page === 1 ? a : b], page, 2, 2));
  }});
  assert.deepEqual(calls, [1, 2]);
  assert.equal(corpus.source?.hasMore, false);
  assert.equal(corpus.source?.channelId, "5946473");
  assert.equal(corpus.status?.kind, "ready");
  assert.equal(corpus.pages[1].href, "/s/barthes-test/p/52203995?pages=2");
  assert.match(corpus.pages[0].html, /href="\/s\/barthes-test\/p\/52203995\?pages=2"/);
  assert.deepEqual(corpus.pages[0].links, ["52203995"]);
});

test("API work stops at end-of-corpus and caps requested pagination at10", async () => {
  let requests = 0;
  const early = await getArenaCorpus({pageLimit:10, fetcher:async () => { requests++; return json(body([a, b])); }});
  assert.equal(requests, 1);
  assert.equal(early.source?.pagesLoaded, 1);
  requests = 0;
  const bounded = await getArenaCorpus({pageLimit:999, fetcher:async (url) => {
    requests++; const page = Number(new URL(url).searchParams.get("page"));
    return json(body([{...a, id:1000 + page}], page, 30, 30));
  }});
  assert.equal(requests, ARENA_MAX_PAGES);
  assert.equal(bounded.pages.length, 10);
  assert.equal(bounded.source?.hasMore, true);
  assert.match(bounded.status?.message || "", /at most 10/);
  assert.equal(normalizePageLimit(NaN), 1);
  assert.equal(normalizePageLimit(-30), 1);
});

test("partial API failure retains loaded content and rate-limit retry information", async () => {
  const corpus = await getArenaCorpus({pageLimit:2, fetcher:async (url) => new URL(url).searchParams.get("page") === "1" ? json(body([a], 1, 2, 2)) : new Response("private upstream details", {status:429, headers:{"retry-after":"90"}})});
  assert.equal(corpus.pages.length, 1);
  assert.equal(corpus.status?.kind, "partial");
  assert.equal(corpus.status?.code, "rate-limited");
  assert.equal(corpus.status?.retryAfterSeconds, 90);
  assert.equal(corpus.source?.pagesLoaded, 1);
  assert.equal(corpus.source?.nextPage, 2);
  assert.doesNotMatch(JSON.stringify(corpus), /private upstream details/);
});

test("empty, unavailable, timeout and invalid responses remain explicit without invented nodes", async () => {
  const empty = await getArenaCorpus({fetcher:async () => json(body([]))});
  assert.equal(empty.status?.kind, "empty"); assert.equal(empty.homeId, "");
  const missing = await getArenaCorpus({fetcher:async () => new Response("missing", {status:404})});
  assert.equal(missing.status?.kind, "error"); assert.equal(missing.status?.code, "unavailable"); assert.deepEqual(missing.pages, []);
  const timeout = await getArenaCorpus({fetcher:async () => { throw new DOMException("timed out", "TimeoutError"); }});
  assert.equal(timeout.status?.code, "timeout");
  const invalid = await getArenaCorpus({fetcher:async () => json({data:[a], meta:{...body([a]).meta, next_page:999}})});
  assert.equal(invalid.status?.code, "invalid-response"); assert.deepEqual(invalid.pages, []);
  const notJson = await getArenaCorpus({fetcher:async () => new Response("<html>upstream error</html>")});
  assert.equal(notJson.status?.code, "invalid-response");
});

test("channel config cannot change the host or escape its API path", async () => {
  let requests = 0;
  await assert.rejects(getArenaCorpus({channelId:"../https://example.com", fetcher:async () => { requests++; return json(body([])); }}), /Invalid public/);
  assert.equal(requests, 0);
});

test("raw HTML, unsafe URLs and image embeds cannot execute; code examples create no graph edges", () => {
  const source = [
    '<script>alert(1)</script><iframe src="https://evil.test"></iframe>',
    '[bad](javascript:alert%281%29) [encoded](java&#x73;cript:alert%281%29) [data](data:text/html,hello)',
    '![remote](https://example.com/image.png) ![payload](data:image/svg+xml,evil)',
    '`[not an edge](https://www.are.na/block/52203995)`',
    '```html\n<a href="https://www.are.na/block/52203995">code</a>\n```',
    '[spoof](https://www.are.na.evil.test/block/52203995)',
  ].join("\n\n");
  const rendered = renderArenaMarkdown(source, {id:"52203993", title:"Safe page", href:"/s/barthes-test/p/52203993"}, new Map([["52203993", "/s/barthes-test/p/52203993"], ["52203995", "/s/barthes-test/p/52203995"]]));
  assert.doesNotMatch(rendered.html, /<(?:script|iframe|img)\b/i);
  assert.doesNotMatch(rendered.html, /href="(?:javascript|data):/i);
  assert.match(rendered.html, /&lt;script&gt;/);
  assert.match(rendered.html, /href="https:\/\/example.com\/image.png"/);
  assert.deepEqual(rendered.links, []);
});

test("link tokens retain anchors/query, deduplicate authored edges, and leave unknown pages external", () => {
  const html = "# Title\n\n## Section\n\n## Section\n\n[B](https://are.na/block/52203995#section) [again](/block/52203995) [unknown](https://www.are.na/block/999)";
  const rendered = renderArenaMarkdown(html, {id:"52203993", title:"Title", href:"/s/barthes-test/p/52203993?pages=3"}, new Map([["52203993", "/s/barthes-test/p/52203993?pages=3"], ["52203995", "/s/barthes-test/p/52203995?pages=3"]]));
  assert.match(rendered.html, /href="\/s\/barthes-test\/p\/52203995\?pages=3#section"/);
  assert.match(rendered.html, /id="section-1"/);
  assert.match(rendered.html, /href="https:\/\/www.are.na\/block\/999"/);
  assert.deepEqual(rendered.links, ["52203995"]);
});

test("shared blocks deduplicate, removed/private blocks disappear, and channels stay outside the authored graph", () => {
  const corpus = corpusFromArenaEntries([a, a, b, {...b, id:3, state:"removed"}, {...b, id:4, visibility:"private"}, {id:5, type:"Channel", slug:"collection", user:{slug:"desmond"}, title:"A collection"}, {id:6, type:"Embed", title:'<script>bad</script>', content:{markdown:'<iframe src="https://example.com"></iframe>'}}]);
  assert.deepEqual(corpus.pages.map((page) => page.id), ["52203993", "52203995", "6"]);
  assert.deepEqual(corpus.pages[2].links, []);
  assert.match(corpus.pages[2].html, /Open source on Are.na/);
  assert.doesNotMatch(corpus.pages[2].html, /<(?:script|iframe)\b/);
  assert.deepEqual(corpus.source?.externalItems, [{id:"5", title:"A collection", type:"Channel", url:"https://www.are.na/desmond/collection"}]);
  assert.equal(corpus.source?.unsupportedCount, 2);
});

test("unexpected metadata types and overlong content degrade to a source link safely", () => {
  const malformed = {...a, title:123, created_at:999, content:{markdown:123}} as unknown as ArenaEntry;
  const corpus = corpusFromArenaEntries([malformed, {...b, content:{markdown:"x".repeat(250_001)}}]);
  assert.equal(corpus.pages.length, 2);
  assert.equal(corpus.pages[0].publishedDate, null);
  assert.equal(corpus.source?.unsupportedCount, 2);
  assert.match(corpus.pages[0].html, /Open source on Are.na/);
  assert.deepEqual(corpus.pages[0].links, []);
});
