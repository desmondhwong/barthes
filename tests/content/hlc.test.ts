// hx generated 261101 — original published corpus/body/topology regression checks.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { before } from "node:test";
import { getHlcCorpus } from "../../src/lib/content/hlc";
import { hlcHref } from "../../src/lib/content/shared";
import type { Corpus, ReaderPage } from "../../src/lib/types";

const root = process.cwd();
let baseline: {pages:ReaderPage[]}, corpus: Corpus;
const routes = new Map<string, string>();
before(async () => {
  baseline = JSON.parse(await readFile(path.join(root, "tests/content/fixtures/hlc-baseline.json"), "utf8"));
  corpus = await getHlcCorpus();
  for (const page of baseline.pages) routes.set(page.href, hlcHref(page.id));
});
function rewritten(html: string): string {
  return html.replace(/(<a\b[^>]*\bhref=")([^"]+)(")/g, (all, start, href, end) => {
    const [route, ...fragment] = href.split("#");
    return routes.has(route) ? start + routes.get(route) + (fragment.length ? "#" + fragment.join("#") : "") + end : all;
  });
}

test("all 34 HLC pages preserve IDs, ordering, dates, exact prose/HTML and 132 authored edges", () => {
  assert.equal(corpus.homeId, "home");
  assert.equal(corpus.siteSlug, "hlc");
  assert.equal(corpus.pages.length, 34);
  assert.equal(corpus.pages.reduce((sum, page) => sum + page.links.length, 0), 132);
  assert.deepEqual(corpus.pages.map((page) => page.id), baseline.pages.map((page) => page.id));
  for (const [index, page] of corpus.pages.entries()) {
    const prior = baseline.pages[index];
    assert.deepEqual(page, {...prior, href:hlcHref(prior.id), html:rewritten(prior.html), footer:rewritten(prior.footer)}, page.id);
  }
});

test("imported public Markdown and compiler provenance match retained source hashes", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "provenance/content-manifest.json"), "utf8"));
  assert.equal(manifest.files.length, 34);
  for (const item of manifest.files) {
    assert.match(item.source, /^work\/sitemap\/hlc-1\/.+\.md$/);
    assert.match(item.destination, /^content\/hlc\/.+\.md$/);
    const bytes = await readFile(path.join(root, item.destination));
    assert.equal(bytes.length, item.bytes, item.destination);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), item.sha256, item.destination);
  }
});

test("rendered links, graph destinations and heading fragments resolve in the migrated corpus", () => {
  const byHref = new Map(corpus.pages.map((page) => [page.href, page]));
  for (const page of corpus.pages) {
    const actual = new Set<string>();
    for (const match of page.html.matchAll(/<a data-page-link href="([^"]+)"/g)) {
      const [href, fragment] = match[1].split("#"), target = byHref.get(href);
      assert.ok(target, `${page.id}: missing ${href}`);
      actual.add(target.id);
      if (fragment) assert.ok(target.html.includes(`id="${fragment}"`), `${page.id}: missing anchor ${fragment}`);
    }
    assert.deepEqual([...actual], page.links);
  }
});
