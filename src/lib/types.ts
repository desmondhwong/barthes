// hx generated 261101 — Barthes shared reader contract; approved first pass.
export interface ReaderPage {
  id: string;
  title: string;
  href: string;
  section: string;
  publishedDate: string | null;
  wordCount: number;
  html: string;
  links: string[];
  footer: string;
}

export interface CorpusStatus {
  kind: "ready" | "partial" | "empty" | "error";
  message?: string;
  code?: "unavailable" | "rate-limited" | "timeout" | "invalid-response";
  retryAfterSeconds?: number;
}

export interface Corpus {
  version: 3;
  title: string;
  siteSlug: string;
  homeId: string;
  pages: ReaderPage[];
  status?: CorpusStatus;
  source?: {
    kind: "markdown" | "arena";
    url?: string;
    channelId?: string;
    pagesLoaded?: number;
    requestedPages?: number;
    totalPages?: number;
    totalCount?: number;
    hasMore?: boolean;
    nextPage?: number | null;
    pageLimit?: number;
    cacheSeconds?: number;
    unsupportedCount?: number;
    externalItems?: { id: string; title: string; type: string; url: string }[];
  };
}
