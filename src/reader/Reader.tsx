"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Corpus } from "../lib/types";
import { paginationAction } from "../lib/routing";
import { mountReader } from "./runtime.mjs";

const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);
const sourceURL = (value?: string) => {
  try { const url = new URL(value ?? ""); return ["https:", "http:"].includes(url.protocol) ? url.href : null; }
  catch { return null; }
};

/** Server-rendered reading remains available if JavaScript or enhancement fails. */
export default function Reader({ corpus, initialPageId }: { corpus: Corpus; initialPageId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const html = useMemo(() => {
    const page = corpus.pages.find((candidate) => candidate.id === initialPageId);
    const home = corpus.pages.find((candidate) => candidate.id === corpus.homeId);
    if (!page || !home) return "<main><p>This page is unavailable.</p></main>";
    const source = corpus.source;
    const pagination = paginationAction(corpus, source?.requestedPages ?? source?.pagesLoaded ?? 1);
    const continuation = new URL(page.href, "https://barthes.invalid");
    if (pagination.kind === "load-more" || pagination.kind === "retry") continuation.searchParams.set("pages", String(pagination.pages));
    const more = pagination.kind === "load-more" || pagination.kind === "retry"
      ? ` <a data-reader-reload href="${escape(continuation.pathname + continuation.search)}">${pagination.kind === "retry" ? "Retry load" : "Load more"}</a>` : "";
    const fullSource = sourceURL(source?.url);
    const capped = source?.hasMore && !more;
    const action = more || (capped && fullSource ? ` <a href="${escape(fullSource)}">Open the full channel on Are.na</a>` : "");
    const message = corpus.status?.kind !== "ready" && corpus.status?.message
      ? escape(corpus.status.message)
      : source?.hasMore ? `Showing ${corpus.pages.length} loaded pages; more items are available in the source.` : "";
    const external = (source?.externalItems ?? []).flatMap(item => {
      const href = sourceURL(item.url);
      return href ? [`<li><a href="${escape(href)}">${escape(item.title)}</a> (${escape(item.type)})</li>`] : [];
    });
    const otherItems = external.length ? `<details><summary>Other channel items (${external.length})</summary><ul>${external.join("")}</ul></details>` : "";
    const notice = message || action || otherItems
      ? `<div class="reader-source-status">${message || action ? `<p role="status">${message}${action}</p>` : ""}${otherItems}</div>` : "";
    return `<a class="skip-link" href="#main">Skip to reading</a>
      <header class="site-header">
        <div class="path-row"><a href="${escape(home.href)}" class="site-name" id="home-link">${escape(corpus.title)}</a><nav id="path-viewport" tabindex="0" aria-label="Reading path. Scroll or drag horizontally."><div id="path-chain"></div></nav><button type="button" id="clear-path">Clear path</button></div>
        <nav id="toolbar" aria-label="View controls"></nav>${notice}
      </header>
      <main id="main" tabindex="-1" class="fallback">${page.html}${page.footer}
        <nav aria-label="Sites"><a href="/s/hlc">HLC field notes</a> · <a href="/s/barthes-test">Barthes test</a></nav>
        <noscript><p>These pages work without JavaScript. Enable it to explore the spatial graph.</p></noscript>
      </main>
      <div id="stage" hidden tabindex="-1" role="region" aria-label="Spatial pages. G switches between reading and graph. Drag empty space to pan; pinch or use plus and minus to zoom."><canvas id="connections" aria-hidden="true"></canvas><div id="nodes"></div></div>
      <div id="ui-root"></div><p id="live-status" class="sr-only" role="status" aria-live="polite"></p>`;
  }, [corpus, initialPageId]);

  useEffect(() => {
    if (!host.current || !corpus.pages.some((page) => page.id === initialPageId)) return;
    try {
      return mountReader(host.current, corpus, initialPageId);
    } catch (cause) {
      console.error("Reader enhancement failed", cause);
      setError("The interactive view could not start. You can still read the page and follow its links.");
    }
  }, [corpus, initialPageId]);

  return <>
    {error && <p role="alert">{error}</p>}
    <div ref={host} className="barthes-reader" dangerouslySetInnerHTML={{ __html: html }} />
  </>;
}
