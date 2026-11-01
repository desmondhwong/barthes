// hx generated — route/server boundary for the approved Barthes first pass.
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getHlcCorpus, getArenaCorpus } from '@/lib/content';
import { getSiteConfiguration } from '@/lib/database';
import {
  applyPageMappings, externalSourceLinks, paginationAction, requestedPageLimit,
  requestQuery, resolveReaderRoute, type ReaderSearchParams,
} from '@/lib/routing';
import Reader from '@/reader/Reader';

// Render per request while preserving the Are.na fetch's explicit 300-second cache.
export const revalidate = 0;
type Props = {
  params: Promise<{ site: string; path?: string[] }>;
  searchParams: Promise<ReaderSearchParams>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { site } = await params;
  const config = await getSiteConfiguration(site);
  return { title: config?.site.title ?? 'Barthes' };
}
export default async function SitePage({ params, searchParams }: Props) {
  const { site, path = [] } = await params;
  const config = await getSiteConfiguration(site);
  if (!config) notFound();
  const query = await searchParams;
  const pageLimit = requestedPageLimit(query.pages);
  const source = config.sources.find(item => item.kind === 'arena' || (site === 'hlc' && item.kind === 'markdown'));
  if (!source) {
    return <main className="fallback"><h1>{config.site.title}</h1><p>This site has no public source configured.</p><a href="/s/hlc">HLC field notes</a></main>;
  }
  const loaded = source.kind === 'markdown' ? await getHlcCorpus() : await getArenaCorpus({
    pageLimit, channelId: source.source_ref, siteSlug:site, title:config.site.title, basePath:`/s/${site}`,
  });
  const corpus = applyPageMappings(loaded, config, source.id);
  const route = resolveReaderRoute(path, corpus, config, source.id, requestQuery(query));
  if (route.kind === 'not-found') notFound();
  // HTTP redirects omit fragments; browsers retain the original fragment themselves.
  if (route.kind === 'redirect') redirect(route.href);
  const sourceLinks = externalSourceLinks(corpus);
  const links = sourceLinks.length ? <ul>{sourceLinks.map(link => <li key={link.href}><a href={link.href} rel="noopener noreferrer">{link.label}</a></li>)}</ul> : null;
  if (route.kind === 'empty') {
    return <main className="fallback"><h1>{config.site.title}</h1><p role="status">{corpus.status?.message || 'This source has no readable pages yet.'}</p>{links}<p><a href={requestQuery(query) || `/s/${site}`}>Try again</a> · <a href="/s/hlc">HLC field notes</a></p></main>;
  }
  if (route.kind === 'unloaded') {
    const action = paginationAction(corpus, pageLimit);
    return <main className="fallback"><h1>Page not loaded yet</h1>
      <p role="status">{corpus.status?.code ? corpus.status.message : action.kind === 'limit'
        ? 'This preview has reached its limit of 10 source pages. Open Are.na to continue.'
        : "This channel has more content. Load the next batch to resolve this page's membership."}</p>
      {(action.kind === 'load-more' || action.kind === 'retry') && <a href={requestQuery({ ...query, pages: String(action.pages) })}>{action.kind === 'retry' ? 'Retry load' : 'Load more'}</a>}
      {links}<p><a href={`/s/${site}`}>Channel index</a></p>
    </main>;
  }
  return <Reader corpus={corpus} initialPageId={route.pageId} />;
}
