// hx generated 261101 — public Are.na content with source-scoped routes and identities.
// Graph edges come from parsed links, never channel membership. Public visibility
// is checked before cached contents are read. Credentials/source HTML are not used.
import MarkdownIt from "markdown-it";
import type { Corpus, CorpusStatus, ReaderPage } from "../types";
import { arenaHref, escapeHTML, headingId, normalizeDate, visibleWordCount } from "./shared";

export const ARENA_CHANNEL = "barthes-test";
export const ARENA_CHANNEL_URL = "https://www.are.na/desmond-wong/barthes-test";
export const ARENA_PAGE_SIZE = 24;
export const ARENA_MAX_PAGES = 10;
export const ARENA_CACHE_SECONDS = 300;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_MARKDOWN_LENGTH = 250_000;

export interface ArenaEntry {
  id: number | string;
  type: string;
  base_type?: string;
  title?: string | null;
  slug?: string;
  state?: string;
  visibility?: string;
  created_at?: string;
  user?: { slug?: string };
  content?: { markdown?: string | null };
}

interface ArenaMeta {
  current_page: number;
  next_page: number | null;
  total_pages: number;
  total_count: number;
  has_more_pages: boolean;
}

type ArenaFetch = (url: string, init: RequestInit & { next: { revalidate: number; tags: string[] } }) => Promise<Response>;
export interface ArenaOptions {
  pageLimit?: number;
  channelId?: string;
  siteSlug?: string;
  title?: string;
  basePath?: string;
  sourceUrl?: string;
  /** Public nets use the resolved numeric channel ID for routes and persistence. */
  publicNet?: boolean;
  /** Injectable only for deterministic adapter tests; routes use the default. */
  fetcher?: ArenaFetch;
  timeoutMs?: number;
}

class ArenaReadError extends Error {
  constructor(public readonly code: NonNullable<CorpusStatus["code"]>, message: string, public readonly retryAfterSeconds?: number) { super(message); }
}

function stableId(value: unknown): string | null {
  const id = String(value ?? "");
  return /^[1-9]\d{0,18}$/.test(id) ? id : null;
}

export function validArenaChannel(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,99}$/.test(value);
}

type ArenaPresentation = Pick<ArenaOptions, "siteSlug" | "title" | "basePath" | "sourceUrl" | "channelId">;

function presentation(options: ArenaPresentation = {}) {
  const siteSlug = options.siteSlug ?? "barthes-test";
  const basePath = options.basePath ?? `/s/${siteSlug}`;
  if (!(validArenaChannel(siteSlug) || /^arena:[a-z0-9-]{1,100}$/.test(siteSlug)) || !/^\/(?:s|n)\/[a-z0-9][a-z0-9-]{0,99}$/.test(basePath)) throw new Error("Invalid Are.na reader route.");
  const source = options.sourceUrl ?? ARENA_CHANNEL_URL;
  const url = new URL(source);
  if (url.protocol !== "https:" || !["are.na", "www.are.na"].includes(url.hostname) || url.username || url.password || url.port) throw new Error("Invalid Are.na source URL.");
  const title = (options.title ?? "Barthes test").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 300) || "Are.na channel";
  return {siteSlug, basePath, title, sourceUrl:url.href, channelId:options.channelId ?? ARENA_CHANNEL};
}

export function normalizePageLimit(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(ARENA_MAX_PAGES, Math.floor(value))) : 1;
}

function pageHref(id: string, requestedPages: number, basePath: string): string {
  return arenaHref(id, basePath) + (requestedPages > 1 ? `?pages=${requestedPages}` : "");
}

function sourceUrl(entry: ArenaEntry): string {
  if (entry.type === "Channel" || entry.base_type === "Channel") {
    if (entry.slug && entry.user?.slug) return `https://www.are.na/${encodeURIComponent(entry.user.slug)}/${encodeURIComponent(entry.slug)}`;
    return `https://www.are.na/channel/${stableId(entry.id)}`;
  }
  return `https://www.are.na/block/${stableId(entry.id)}`;
}

function safeHref(raw: string, source: string): string | null {
  if (!raw || /[\u0000-\u0020\u007f]/.test(raw) || raw.startsWith("//")) return null;
  if (raw.startsWith("#")) return raw;
  try {
    const url = new URL(raw, source);
    if (!["https:", "http:", "mailto:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

function arenaTarget(href: string): { id: string; fragment: string } | null {
  try {
    const url = new URL(href);
    if (!["https:", "http:"].includes(url.protocol) || !["www.are.na", "are.na"].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/block\/([1-9]\d*)\/?$/);
    return match ? { id: match[1], fragment: url.hash } : null;
  } catch { return null; }
}

function titleFor(entry: ArenaEntry): string {
  const explicit = typeof entry.title === "string" ? entry.title.trim() : "";
  if (explicit) return explicit.slice(0, 300);
  const line = typeof entry.content?.markdown === "string" ? entry.content.markdown.split(/\r?\n/).find((value) => value.trim()) : undefined;
  return line?.replace(/^#{1,6}\s+/, "").replace(/[*_`]/g, "").trim().slice(0, 160) || `${entry.type} ${entry.id}`;
}

/** Parse once, rewrite link tokens and derive graph edges from those same tokens. */
export function renderArenaMarkdown(markdown: string, page: { id: string; title: string; href: string }, included: ReadonlyMap<string, string>): { html: string; links: string[] } {
  const source = `https://www.are.na/block/${page.id}`;
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });
  md.validateLink = (href) => safeHref(href, source) !== null;
  // Markdown images remain explicit links; arbitrary media never executes or
  // fetches automatically in the reader, including data-URL images.
  md.renderer.rules.image = (tokens, index) => {
    const token = tokens[index], href = safeHref(String(token.attrGet("src") || ""), source);
    const label = token.content || "Image";
    return href && /^https?:\/\//.test(href) ? `<a href="${escapeHTML(href)}" rel="noopener noreferrer">${escapeHTML(label)} (image)</a>` : escapeHTML(label);
  };
  const tokens = md.parse(markdown, {}), links = new Set<string>(), slugs = new Map<string, number>();
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === "heading_open") {
      const slug = headingId(tokens[index + 1]?.content || "section") || "section";
      const count = slugs.get(slug) || 0;
      slugs.set(slug, count + 1);
      token.attrSet("id", slug + (count ? `-${count}` : ""));
    }
    for (const child of token.children || []) {
      if (child.type !== "link_open") continue;
      const raw = String(child.attrGet("href") || ""), href = safeHref(raw, source);
      if (!href) { child.attrSet("href", "#"); continue; }
      const target = href.startsWith("#") ? {id: page.id, fragment: href} : arenaTarget(href);
      const destination = target && included.get(target.id);
      if (target && destination) {
        links.add(target.id);
        child.attrSet("href", destination + target.fragment);
        child.attrSet("data-page-link", "");
      } else {
        // Missing from a partial load means unresolved membership, not absence.
        child.attrSet("href", href);
        child.attrSet("rel", "noopener noreferrer");
      }
    }
  }
  let html = md.renderer.render(tokens, md.options, {});
  if (!(tokens[0]?.type === "heading_open" && tokens[0].tag === "h1")) html = `<h1 id="${escapeHTML(headingId(page.title) || "page")}">${escapeHTML(page.title)}</h1>\n${html}`;
  return {html, links:[...links]};
}

export function corpusFromArenaEntries(entries: ArenaEntry[], requestedPages = 1, options: ArenaPresentation = {}): Corpus {
  const display = presentation(options);
  const limit = normalizePageLimit(requestedPages), unique = new Map<string, ArenaEntry>();
  const externalItems: NonNullable<NonNullable<Corpus["source"]>["externalItems"]> = [];
  for (const entry of entries) {
    const id = stableId(entry.id);
    if (!id || typeof entry.type !== "string" || (entry.state && entry.state !== "available") || entry.visibility === "private") continue;
    if (entry.type === "Channel" || entry.base_type === "Channel") {
      if (!externalItems.some((item) => item.id === id)) externalItems.push({id, title:titleFor(entry), type:"Channel", url:sourceUrl(entry)});
    } else if (!unique.has(id)) unique.set(id, entry);
  }
  const included = new Map([...unique.keys()].map((id) => [id, pageHref(id, limit, display.basePath)]));
  const pages: ReaderPage[] = [];
  let unsupportedCount = externalItems.length;
  for (const [id, entry] of unique) {
    const title = titleFor(entry), href = included.get(id)!;
    const availableMarkdown = entry.type === "Text" && typeof entry.content?.markdown === "string" && entry.content.markdown.length <= MAX_MARKDOWN_LENGTH;
    let html: string, links: string[];
    if (availableMarkdown) ({html, links} = renderArenaMarkdown(entry.content!.markdown!, {id, title, href}, included));
    else {
      unsupportedCount++;
      html = `<h1 id="${escapeHTML(headingId(title) || "page")}">${escapeHTML(title)}</h1>\n<p>This ${escapeHTML(entry.type.toLowerCase())} block is available on Are.na.</p>\n<p><a href="${escapeHTML(sourceUrl(entry))}" rel="noopener noreferrer">Open source on Are.na</a></p>`;
      links = [];
    }
    pages.push({id, title, href, section:"Are.na", publishedDate:normalizeDate(typeof entry.created_at === "string" ? entry.created_at.slice(0, 10) : null), wordCount:visibleWordCount(html), html, links, footer:""});
  }
  const homeId = pages[0]?.id || "";
  const byId = new Map(pages.map((page) => [page.id, page]));
  for (const page of pages) {
    const anchors = [`<a ${page.links.includes(homeId) ? "data-page-link" : `data-jump="${homeId}"`} href="${escapeHTML(included.get(homeId)!)}">Home</a>`];
    for (const id of page.links) {
      if (id !== homeId) anchors.push(`<a data-page-link href="${escapeHTML(byId.get(id)!.href)}">${escapeHTML(byId.get(id)!.title)}</a>`);
    }
    anchors.push(`<a href="https://www.are.na/block/${page.id}" rel="noopener noreferrer">Source on Are.na</a>`);
    page.footer = `<nav class="page-end" aria-label="Page links">${anchors.join(" ")}</nav>`;
  }
  return {version:3, title:display.title, siteSlug:display.siteSlug, basePath:display.basePath, homeId, pages, status:{kind:pages.length ? "ready" : "empty"}, source:{kind:"arena", url:display.sourceUrl, channelId:display.channelId, unsupportedCount, externalItems, cacheSeconds:ARENA_CACHE_SECONDS}};
}

function readMeta(value: unknown, expectedPage: number): ArenaMeta {
  if (!value || typeof value !== "object") throw new ArenaReadError("invalid-response", "Are.na returned an unreadable pagination response.");
  const meta = value as Partial<ArenaMeta>;
  if (meta.current_page !== expectedPage || !Number.isSafeInteger(meta.total_pages) || (meta.total_pages ?? -1) < 0 || !Number.isSafeInteger(meta.total_count) || (meta.total_count ?? -1) < 0 || typeof meta.has_more_pages !== "boolean" || (meta.next_page !== null && meta.next_page !== expectedPage + 1) || meta.has_more_pages !== (meta.next_page !== null)) throw new ArenaReadError("invalid-response", "Are.na returned inconsistent pagination metadata.");
  return meta as ArenaMeta;
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isFinite(seconds) ? Math.min(3600, Math.max(1, seconds)) : undefined;
}

function readFailure(error: unknown): ArenaReadError {
  if (error instanceof ArenaReadError) return error;
  const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
  return new ArenaReadError(timeout ? "timeout" : "unavailable", timeout ? "Are.na took too long to respond. Try again later." : "Are.na could not be reached. Try again later.");
}

async function readPublicJSON(url: string, channelId: string, fetcher: ArenaFetch, timeoutMs: number, metadata = false): Promise<unknown> {
  const response = await fetcher(url, {
    headers:{Accept:"application/json"}, credentials:"omit", redirect:"error",
    signal:AbortSignal.timeout(timeoutMs), ...(metadata ? {cache:"no-store" as const} : {}),
    next:{revalidate:metadata ? 0 : ARENA_CACHE_SECONDS, tags:[`arena:${channelId}`]},
  });
  if (response.status === 429) throw new ArenaReadError("rate-limited", "Are.na is rate limiting this channel. Try again after the wait shown.", retryAfter(response));
  if (!response.ok) throw new ArenaReadError("unavailable", [401,403,404].includes(response.status) ? "This Are.na channel is unavailable or is no longer public." : "Are.na could not load this channel. Try again later.");
  if (Number(response.headers.get("content-length") || 0) > MAX_RESPONSE_BYTES) throw new ArenaReadError("invalid-response", "The Are.na response exceeds the reader's size limit.");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new ArenaReadError("invalid-response", "The Are.na response exceeds the reader's size limit.");
  try { return JSON.parse(text); } catch { throw new ArenaReadError("invalid-response", "Are.na returned an unreadable response."); }
}

function publicChannel(value: unknown): {id: string; title: string; url: string} {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ArenaReadError("invalid-response", "Are.na returned invalid channel metadata.");
  const channel = value as Record<string, unknown>, id = stableId(channel.id);
  // Closed channels are publicly readable; only their contributions are restricted.
  if (channel.visibility === "private" || channel.state === "deleted") throw new ArenaReadError("unavailable", "This Are.na channel is unavailable or is no longer public.");
  if (!id || channel.type !== "Channel" || channel.state !== "available" || !["public", "closed"].includes(String(channel.visibility)) || typeof channel.title !== "string") throw new ArenaReadError("invalid-response", "Are.na returned invalid channel metadata.");
  const owner = channel.owner as {slug?: unknown} | undefined;
  const ownerSlug = typeof owner?.slug === "string" ? owner.slug : null;
  const url = typeof channel.slug === "string" && ownerSlug && validArenaChannel(channel.slug) && validArenaChannel(ownerSlug)
    ? `https://www.are.na/${ownerSlug}/${channel.slug}` : `https://www.are.na/channel/${id}`;
  return {id, title:channel.title, url};
}

export async function getArenaCorpus(options: ArenaOptions = {}): Promise<Corpus> {
  const {pageLimit, channelId = ARENA_CHANNEL, fetcher = fetch, timeoutMs = 10_000} = options;
  if (!validArenaChannel(channelId)) throw new Error("Invalid public Are.na channel identifier.");
  // Validate configured presentation before initiating any remote request.
  presentation(options);
  const requestedPages = normalizePageLimit(pageLimit), entries: ArenaEntry[] = [];
  let channel: ReturnType<typeof publicChannel>;
  try {
    channel = publicChannel(await readPublicJSON(`https://api.are.na/v3/channels/${encodeURIComponent(channelId)}`, channelId, fetcher, timeoutMs, true));
    if (stableId(channelId) && channel.id !== channelId) throw new ArenaReadError("invalid-response", "Are.na returned a different channel than requested.");
  } catch (error) {
    const failure = readFailure(error);
    const corpus = corpusFromArenaEntries([], requestedPages, {
      ...options, title:options.title ?? "Are.na channel", sourceUrl:options.sourceUrl ?? `https://www.are.na/channel/${channelId}`,
      ...(options.publicNet ? {siteSlug:`arena:${channelId}`, basePath:`/n/${channelId}`} : {}),
    });
    corpus.status = {kind:"error", code:failure.code, message:failure.message, ...(failure.retryAfterSeconds ? {retryAfterSeconds:failure.retryAfterSeconds} : {})};
    corpus.source = {...corpus.source!, pagesLoaded:0, requestedPages, hasMore:false, pageLimit:ARENA_MAX_PAGES};
    return corpus;
  }
  const display: ArenaPresentation = {
    ...options, channelId:channel.id, title:options.title ?? channel.title, sourceUrl:options.sourceUrl ?? channel.url,
    ...(options.publicNet ? {siteSlug:`arena:${channel.id}`, basePath:`/n/${channel.id}`} : {}),
  };
  const apiRoot = `https://api.are.na/v3/channels/${channel.id}/contents`;
  let pagesLoaded = 0, meta: ArenaMeta | undefined, failure: ArenaReadError | undefined;
  for (let page = 1; page <= requestedPages; page++) {
    try {
      const payload = await readPublicJSON(`${apiRoot}?page=${page}&per=${ARENA_PAGE_SIZE}&sort=position_asc`, channel.id, fetcher, timeoutMs) as {data?: unknown; meta?: unknown};
      if (!payload || !Array.isArray(payload.data) || payload.data.length > ARENA_PAGE_SIZE || payload.data.some((entry) => !entry || typeof entry !== "object" || !stableId(entry.id) || typeof entry.type !== "string")) throw new ArenaReadError("invalid-response", "Are.na returned invalid channel content.");
      meta = readMeta(payload.meta, page);
      entries.push(...payload.data as ArenaEntry[]);
      pagesLoaded = page;
      if (!meta.has_more_pages) break;
    } catch (error) {
      failure = readFailure(error);
      break;
    }
  }
  const corpus = corpusFromArenaEntries(entries, requestedPages, display);
  const hasMore = failure ? true : meta?.has_more_pages || false;
  corpus.source = {...corpus.source!, pagesLoaded, requestedPages, totalPages:meta?.total_pages, totalCount:meta?.total_count, hasMore, nextPage:hasMore ? pagesLoaded + 1 : null, pageLimit:ARENA_MAX_PAGES};
  if (failure) corpus.status = {kind:pagesLoaded ? "partial" : "error", code:failure.code, message:failure.message, ...(failure.retryAfterSeconds ? {retryAfterSeconds:failure.retryAfterSeconds} : {})};
  else if (hasMore) corpus.status = {kind:"partial", message:`Showing ${pagesLoaded} of ${meta!.total_pages} source pages. Load more to discover additional pages and links.${pagesLoaded === ARENA_MAX_PAGES ? " This preview loads at most 10 source pages." : ""}`};
  else if (!corpus.pages.length) corpus.status = {kind:"empty", message:"This channel has no readable blocks. Nested channels remain external source links."};
  return corpus;
}
