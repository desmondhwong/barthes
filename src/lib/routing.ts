// hx generated — source-scoped URL mapping and bounded reader route resolution.
import type { PageRecord, SiteConfiguration } from "./database";
import type { Corpus } from "./types";
import { escapeHTML } from "./content/shared";

const INTERNAL_ORIGIN = "https://barthes.invalid";
export const MAX_READER_SOURCE_PAGES = 10;

export type ReaderSearchParams = Record<string, string | string[] | undefined>;

export function requestedPageLimit(value: string | string[] | undefined): number {
  const parsed = typeof value === "string" ? Number(value) : 1;
  return Number.isInteger(parsed) ? Math.max(1, Math.min(MAX_READER_SOURCE_PAGES, parsed)) : 1;
}

export function requestQuery(parameters: ReaderSearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

/** Preserve the link's query/fragment while changing only its internal destination. */
export function mergeRouteState(destination: string, original: string): string {
  const target = new URL(destination, INTERNAL_ORIGIN), source = new URL(original, INTERNAL_ORIGIN);
  if (target.origin !== INTERNAL_ORIGIN) throw new Error("Reader mappings must use internal destinations.");
  for (const key of new Set(source.searchParams.keys())) {
    target.searchParams.delete(key);
    for (const value of source.searchParams.getAll(key)) target.searchParams.append(key, value);
  }
  if (source.hash) target.hash = source.hash;
  return target.pathname + target.search + target.hash;
}

function scopedMappings(config: SiteConfiguration, sourceId: string): PageRecord[] {
  if (!config.sources.some(source => source.id === sourceId && source.site_id === config.site.id)) {
    throw new Error("The reader source does not belong to this site.");
  }
  return config.pages.filter(page => page.site_id === config.site.id && page.source_id === sourceId);
}

function validMappingSlug(slug: string): boolean {
  return Boolean(slug) && slug !== "." && slug !== ".." && !/[/\\?#\u0000-\u0020\u007f]/.test(slug);
}

function decodeAttribute(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos|#39);/g, entity => ({
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'",
  })[entity]!);
}

/** Adapters emit escaped HTML and double-quoted href attributes. Only their
 * explicitly internal anchors are rewritten; code examples and external links stay intact. */
function rewriteInternalAnchors(html: string, destinations: ReadonlyMap<string, string>): string {
  return html.replace(/<a\b[^>]*>/g, tag => {
    if (!/\sdata-(?:page-link|jump)(?:\s|=|>)/.test(tag)) return tag;
    return tag.replace(/\bhref="([^"]*)"/, (attribute, encoded: string) => {
      const href = decodeAttribute(encoded), url = new URL(href, INTERNAL_ORIGIN);
      const mapped = url.origin === INTERNAL_ORIGIN ? destinations.get(url.pathname) : undefined;
      return mapped ? `href="${escapeHTML(mergeRouteState(mapped, href))}"` : attribute;
    });
  });
}

export function applyPageMappings(corpus: Corpus, config: SiteConfiguration, sourceId: string): Corpus {
  if (corpus.siteSlug !== config.site.slug) throw new Error("The corpus does not belong to this site.");
  const mappings = new Map(scopedMappings(config, sourceId).map(page => [page.source_page_id, page]));
  const destinations = new Map<string, string>(), occupied = new Set<string>();
  const sourcePaths = new Map(corpus.pages.map(page => [new URL(page.href, INTERNAL_ORIGIN).pathname, page.id]));
  const siteHome = `/s/${encodeURIComponent(config.site.slug)}`;
  const hrefs = corpus.pages.map(page => {
    const original = new URL(page.href, INTERNAL_ORIGIN), mapping = mappings.get(page.id);
    if (mapping && !validMappingSlug(mapping.slug)) throw new Error("Invalid configured reader page slug.");
    // HLC's home remains the site entry point. Its mapped /p/slug can redirect there.
    const pathname = mapping && original.pathname !== siteHome
      ? `${siteHome}/p/${encodeURIComponent(mapping.slug)}` : original.pathname;
    if (occupied.has(pathname)) throw new Error("Configured reader page routes conflict.");
    if (sourcePaths.has(pathname) && sourcePaths.get(pathname) !== page.id) {
      throw new Error("Configured reader page routes conflict with a stable source URL.");
    }
    occupied.add(pathname);
    const href = pathname + original.search + original.hash;
    destinations.set(original.pathname, href);
    return href;
  });
  return {
    ...corpus,
    pages: corpus.pages.map((page, index) => ({
      ...page,
      href: hrefs[index],
      html: rewriteInternalAnchors(page.html, destinations),
      footer: rewriteInternalAnchors(page.footer, destinations),
    })),
  };
}

export type ReaderRoute =
  | { kind: "page"; pageId: string }
  | { kind: "redirect"; href: string }
  | { kind: "unloaded"; sourcePageId: string }
  | { kind: "empty" }
  | { kind: "not-found" };

/** Public nets need no database seed. A valid unloaded block keeps its membership
 * unresolved until pagination completes; arbitrary paths never become pages. */
export function resolvePublicNetRoute(path: readonly string[], corpus: Corpus): ReaderRoute {
  if (!path.length) return corpus.pages.length ? {kind:"page", pageId:corpus.homeId} : {kind:"empty"};
  if (path.length !== 2 || path[0] !== "p" || !/^[1-9]\d{0,18}$/.test(path[1])) return {kind:"not-found"};
  if (corpus.pages.some(page => page.id === path[1])) return {kind:"page", pageId:path[1]};
  if (corpus.status?.kind === "error") return {kind:"empty"};
  return corpus.source?.hasMore ? {kind:"unloaded", sourcePageId:path[1]} : {kind:"not-found"};
}

export function resolveReaderRoute(
  path: readonly string[], corpus: Corpus, config: SiteConfiguration, sourceId: string,
  query = "",
  options: { aliasesOnly?: boolean } = {},
): ReaderRoute {
  const mappings = scopedMappings(config, sourceId);
  const toPage = (id: string, redirect = false): ReaderRoute => {
    const page = corpus.pages.find(item => item.id === id);
    if (page) return redirect
      ? { kind: "redirect", href: mergeRouteState(page.href, query || "/") }
      : { kind: "page", pageId: page.id };
    if (corpus.source?.kind === "arena" && corpus.source.hasMore) return { kind: "unloaded", sourcePageId: id };
    return { kind: "not-found" };
  };
  const resolveAlias = (): ReaderRoute => {
    const alias = config.aliases.find(item => item.site_id === config.site.id && item.path === `/${path.join("/")}`);
    const mapped = alias && mappings.find(page => page.id === alias.page_id);
    return mapped ? toPage(mapped.source_page_id, true) : { kind: "not-found" };
  };
  if (options.aliasesOnly) return resolveAlias();
  if (!path.length) return corpus.pages.length ? toPage(corpus.homeId) : { kind: "empty" };

  if (path.length === 2 && path[0] === "p") {
    const slug = path[1];
    const mapping = mappings.find(page => page.slug === slug);
    if (mapping) {
      const page = corpus.pages.find(item => item.id === mapping.source_page_id);
      const canonicalPath = page && new URL(page.href, INTERNAL_ORIGIN).pathname;
      const requestedPath = `/s/${encodeURIComponent(config.site.slug)}/p/${encodeURIComponent(slug)}`;
      return toPage(mapping.source_page_id, Boolean(canonicalPath && canonicalPath !== requestedPath));
    }
    const canonical = corpus.pages.find(page => {
      const pathname = new URL(page.href, INTERNAL_ORIGIN).pathname;
      return pathname === `/s/${encodeURIComponent(config.site.slug)}/p/${encodeURIComponent(slug)}`;
    });
    if (canonical) return toPage(canonical.id);
    // Preserve original source-derived links when a mapping changes the canonical slug.
    const original = corpus.pages.find(page => (corpus.source?.kind === "arena" ? page.id : page.id.replaceAll("/", "--")) === slug);
    if (original) return toPage(original.id, true);
    if (corpus.source?.kind === "arena" && /^[1-9]\d{0,18}$/.test(slug) && corpus.source.hasMore) {
      return { kind: "unloaded", sourcePageId: slug };
    }
  }

  return resolveAlias();
}

export function paginationAction(corpus: Corpus, requestedPages: number):
  { kind: "none" | "limit" } | { kind: "load-more" | "retry"; pages: number } {
  if (!corpus.source?.hasMore) return { kind: "none" };
  const maximum = Math.min(MAX_READER_SOURCE_PAGES, corpus.source.pageLimit ?? MAX_READER_SOURCE_PAGES);
  if (corpus.status?.code) return { kind: "retry", pages: Math.min(maximum, requestedPages) };
  if (requestedPages >= maximum || (corpus.source.pagesLoaded ?? 0) >= maximum) return { kind: "limit" };
  return { kind: "load-more", pages: requestedPages + 1 };
}

export function externalSourceLinks(corpus: Corpus): { href: string; label: string }[] {
  const candidates = [
    ...(corpus.source?.url ? [{ href: corpus.source.url, label: "Open source on Are.na" }] : []),
    ...(corpus.source?.externalItems ?? []).map(item => ({ href: item.url, label: item.title })),
  ];
  const seen = new Set<string>();
  return candidates.filter(item => {
    try {
      const url = new URL(item.href);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || seen.has(url.href)) return false;
      seen.add(url.href);
      return true;
    } catch { return false; }
  });
}
