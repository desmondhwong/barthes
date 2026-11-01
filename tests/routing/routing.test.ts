import assert from "node:assert/strict";
import test from "node:test";
import type { SiteConfiguration } from "../../src/lib/database.ts";
import type { Corpus, ReaderPage } from "../../src/lib/types.ts";
import {
  applyPageMappings, externalSourceLinks, mergeRouteState, paginationAction,
  requestQuery, requestedPageLimit, resolveReaderRoute,
} from "../../src/lib/routing.ts";

function fixture(kind: "arena" | "markdown" = "arena"): { corpus: Corpus; config: SiteConfiguration } {
  const slug = kind === "arena" ? "barthes-test" : "hlc";
  const ids = kind === "arena" ? ["101", "202"] : ["home", "foundations/topic"];
  const href = (id: string) => id === "home" ? "/s/hlc" : `/s/${slug}/p/${id.replaceAll("/", "--")}${kind === "arena" ? "?pages=2" : ""}`;
  const pages: ReaderPage[] = ids.map(id => ({
    id, title: `Page ${id}`, href: href(id), section: "test", publishedDate: null,
    wordCount: 1, html: "<p>Page</p>", links: [], footer: "",
  }));
  pages[0].links = [ids[1]];
  pages[0].html = `<p><a data-page-link href="${href(ids[1])}#section">Read B</a></p>`;
  pages[0].footer = `<nav><a data-jump="${ids[1]}" href="${href(ids[1])}">Jump</a></nav>`;
  const corpus: Corpus = {
    version: 3, title: "Corpus", siteSlug: slug, homeId: ids[0], pages,
    status: { kind: "ready" }, source: { kind, hasMore: false, pagesLoaded: 2, pageLimit: 10 },
  };
  const config: SiteConfiguration = {
    site: { id: "site-one", slug, title: "Site", description: "", home_page_slug: ids[0] },
    sources: [{ id: "source-one", site_id: "site-one", kind, source_key: "primary", source_ref: "fixture", label: "Fixture" }],
    pages: [{ id: "mapping-b", site_id: "site-one", source_id: "source-one", source_page_id: ids[1], slug: "renamed-page", title: "B" }],
    aliases: [{ site_id: "site-one", page_id: "mapping-b", path: "/old-name.html" }],
  };
  return { corpus, config };
}

test("mapping overrides change page URLs, authored anchors and jump footers together without changing IDs/edges", () => {
  const { corpus, config } = fixture();
  const original = JSON.stringify(corpus);
  const mapped = applyPageMappings(corpus, config, "source-one");
  assert.equal(mapped.pages[1].href, "/s/barthes-test/p/renamed-page?pages=2");
  assert.match(mapped.pages[0].html, /href="\/s\/barthes-test\/p\/renamed-page\?pages=2#section"/);
  assert.match(mapped.pages[0].footer, /href="\/s\/barthes-test\/p\/renamed-page\?pages=2"/);
  assert.equal(mapped.pages[1].id, "202");
  assert.deepEqual(mapped.pages[0].links, ["202"]);
  assert.equal(JSON.stringify(corpus), original);
  assert.deepEqual(resolveReaderRoute(["p", "renamed-page"], mapped, config, "source-one"), { kind: "page", pageId: "202" });
});

test("original source URLs and configured aliases redirect to the mapped route, retaining query and fragment", () => {
  const { corpus, config } = fixture();
  const mapped = applyPageMappings(corpus, config, "source-one");
  assert.deepEqual(resolveReaderRoute(["p", "202"], mapped, config, "source-one", "?pages=3&mode=read#section"), {
    kind: "redirect", href: "/s/barthes-test/p/renamed-page?pages=3&mode=read#section",
  });
  assert.deepEqual(resolveReaderRoute(["old-name.html"], mapped, config, "source-one", "?pages=4"), {
    kind: "redirect", href: "/s/barthes-test/p/renamed-page?pages=4",
  });
  assert.equal(mergeRouteState("/s/hlc/p/new", "/old?tag=a&tag=b#heading"), "/s/hlc/p/new?tag=a&tag=b#heading");
  assert.equal(requestQuery({ pages: "3", tag: ["one", "two"], omitted: undefined }), "?pages=3&tag=one&tag=two");
});

test("mapping scope excludes another source/site even when source page IDs coincide", () => {
  const { corpus, config } = fixture();
  config.sources.push({ ...config.sources[0], id: "source-two", source_key: "other" });
  config.pages = [
    { ...config.pages[0], id: "other-mapping", source_id: "source-two", slug: "wrong-source" },
    { ...config.pages[0], site_id: "site-two", slug: "wrong-site" },
  ];
  config.aliases = [{ site_id: "site-one", page_id: "other-mapping", path: "/other.html" }];
  const mapped = applyPageMappings(corpus, config, "source-one");
  assert.equal(mapped.pages[1].href, corpus.pages[1].href);
  assert.deepEqual(resolveReaderRoute(["other.html"], mapped, config, "source-one"), { kind: "not-found" });
  assert.throws(() => applyPageMappings(corpus, config, "unknown-source"), /does not belong/);
});

test("root alias mode uses configured aliases and redirects directly to the overridden canonical URL", () => {
  const { corpus, config } = fixture("markdown");
  config.aliases.push({ site_id: "site-one", page_id: "mapping-b", path: "/barthes/custom-name.html" });
  const mapped = applyPageMappings(corpus, config, "source-one");
  assert.deepEqual(resolveReaderRoute(["barthes", "custom-name.html"], mapped, config, "source-one", "?view=read#heading", { aliasesOnly: true }), {
    kind: "redirect", href: "/s/hlc/p/renamed-page?view=read#heading",
  });
  assert.deepEqual(resolveReaderRoute(["p", "renamed-page"], mapped, config, "source-one", "", { aliasesOnly: true }), { kind: "not-found" });
});

test("mapping rewrite leaves external links and escaped code unchanged and preserves HTML-safe query attributes", () => {
  const { corpus, config } = fixture();
  corpus.pages[0].html += '<a href="https://example.test/s/barthes-test/p/202">External</a><code>&lt;a data-page-link href="/s/barthes-test/p/202"&gt;</code>';
  corpus.pages[0].footer = '<a data-page-link="" href="/s/barthes-test/p/202?pages=2&amp;mode=read#section">B</a>';
  const mapped = applyPageMappings(corpus, config, "source-one");
  assert.match(mapped.pages[0].html, /href="https:\/\/example.test\/s\/barthes-test\/p\/202"/);
  assert.match(mapped.pages[0].html, /&lt;a data-page-link href="\/s\/barthes-test\/p\/202"&gt;/);
  assert.match(mapped.pages[0].footer, /renamed-page\?pages=2&amp;mode=read#section/);
});

test("HLC home keeps its entry route and content IDs survive a slug override", () => {
  const { corpus, config } = fixture("markdown");
  config.pages.push({ ...config.pages[0], id: "mapping-home", source_page_id: "home", slug: "home" });
  const mapped = applyPageMappings(corpus, config, "source-one");
  assert.equal(mapped.pages[0].href, "/s/hlc");
  assert.equal(mapped.pages[1].id, "foundations/topic");
  assert.deepEqual(resolveReaderRoute([], mapped, config, "source-one"), { kind: "page", pageId: "home" });
  assert.deepEqual(resolveReaderRoute(["p", "home"], mapped, config, "source-one"), { kind: "redirect", href: "/s/hlc" });
  assert.deepEqual(resolveReaderRoute(["p", "foundations--topic"], mapped, config, "source-one"), { kind: "redirect", href: "/s/hlc/p/renamed-page" });
});

test("partial Are.na membership only applies to valid IDs or known mappings, never malformed routes", () => {
  const { corpus, config } = fixture();
  corpus.source!.hasMore = true;
  corpus.pages.pop();
  const mapped = applyPageMappings(corpus, config, "source-one");
  assert.deepEqual(resolveReaderRoute(["p", "303"], mapped, config, "source-one"), { kind: "unloaded", sourcePageId: "303" });
  assert.deepEqual(resolveReaderRoute(["p", "renamed-page"], mapped, config, "source-one"), { kind: "unloaded", sourcePageId: "202" });
  for (const path of [["p", "nonsense"], ["foo", "303"], ["p", "303", "extra"], ["p", "0"], ["p", "-3"]]) {
    assert.deepEqual(resolveReaderRoute(path, mapped, config, "source-one"), { kind: "not-found" });
  }
  mapped.source!.hasMore = false;
  assert.deepEqual(resolveReaderRoute(["p", "303"], mapped, config, "source-one"), { kind: "not-found" });
});

test("pagination reaches its bound without a same-page Load more loop and failures have an explicit retry", () => {
  const { corpus } = fixture();
  corpus.source!.hasMore = true;
  assert.deepEqual(paginationAction(corpus, 2), { kind: "load-more", pages: 3 });
  assert.deepEqual(paginationAction(corpus, 10), { kind: "limit" });
  corpus.status = { kind: "partial", code: "rate-limited", message: "Wait" };
  assert.deepEqual(paginationAction(corpus, 10), { kind: "retry", pages: 10 });
  corpus.source!.hasMore = false;
  assert.deepEqual(paginationAction(corpus, 10), { kind: "none" });
  assert.equal(requestedPageLimit("999"), 10);
  assert.equal(requestedPageLimit("0"), 1);
  assert.equal(requestedPageLimit("2.5"), 1);
  assert.equal(requestedPageLimit(["2", "3"]), 1);
});

test("empty nested-channel corpus retains safe source links and rejects executable URLs", () => {
  const { corpus, config } = fixture();
  corpus.pages = [];
  corpus.source!.url = "https://www.are.na/desmond-wong/barthes-test";
  corpus.source!.externalItems = [
    { id: "3", title: "Nested channel", type: "Channel", url: "https://www.are.na/desmond/collection" },
    { id: "4", title: "Unsafe", type: "Channel", url: "javascript:alert(1)" },
  ];
  assert.deepEqual(resolveReaderRoute([], corpus, config, "source-one"), { kind: "empty" });
  assert.deepEqual(externalSourceLinks(corpus).map(link => link.label), ["Open source on Are.na", "Nested channel"]);
});

test("invalid or colliding configured slugs fail before generating unsafe or ambiguous URLs", () => {
  const { corpus, config } = fixture();
  config.pages[0].slug = "..";
  assert.throws(() => applyPageMappings(corpus, config, "source-one"), /Invalid configured/);
  config.pages[0].slug = "101";
  assert.throws(() => applyPageMappings(corpus, config, "source-one"), /routes conflict/);
  config.pages.push({ ...config.pages[0], id: "mapping-a", source_page_id: "101", slug: "a-renamed" });
  assert.throws(() => applyPageMappings(corpus, config, "source-one"), /stable source URL/);
});
