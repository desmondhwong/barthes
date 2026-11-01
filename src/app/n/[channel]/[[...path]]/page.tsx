// hx generated 261101 — public Are.na nets, independent of configured-site seeds.
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getArenaCorpus, validArenaChannel } from '@/lib/content/arena';
import {
  externalSourceLinks, paginationAction, requestedPageLimit, requestQuery,
  resolvePublicNetRoute, type ReaderSearchParams,
} from '@/lib/routing';
import Reader from '@/reader/Reader';

export const revalidate = 0;
type Props = {
  params: Promise<{channel: string; path?: string[]}>;
  searchParams: Promise<ReaderSearchParams>;
};
// Share the same visibility check and content result within a server render.
const load = cache((channel: string, pageLimit: number) => getArenaCorpus({channelId:channel, pageLimit, publicNet:true}));

export async function generateMetadata({params, searchParams}: Props): Promise<Metadata> {
  const {channel} = await params;
  if (!validArenaChannel(channel)) return {title:'Barthes'};
  const corpus = await load(channel, requestedPageLimit((await searchParams).pages));
  return {title:corpus.title, robots:corpus.status?.kind === 'error' ? {index:false} : undefined};
}

export default async function PublicNetPage({params, searchParams}: Props) {
  const {channel, path = []} = await params;
  if (!validArenaChannel(channel)) notFound();
  if (path.length && (path.length !== 2 || path[0] !== 'p' || !/^[1-9]\d{0,18}$/.test(path[1]))) notFound();
  const query = await searchParams, pageLimit = requestedPageLimit(query.pages);
  const corpus = await load(channel, pageLimit);
  // Numeric routes retain identity when a channel's slug or title changes.
  if (corpus.status?.kind !== 'error' && corpus.source?.channelId !== channel) {
    redirect(`${corpus.basePath}${path.length ? `/p/${path[1]}` : ''}${requestQuery(query)}`);
  }
  const route = resolvePublicNetRoute(path, corpus);
  if (route.kind === 'not-found') notFound();
  if (route.kind === 'page') return <Reader corpus={corpus} initialPageId={route.pageId} />;
  const links = externalSourceLinks(corpus);
  const action = paginationAction(corpus, pageLimit);
  return <main className="fallback">
    <h1>{route.kind === 'unloaded' ? 'Page not loaded yet' : corpus.title}</h1>
    <p role="status">{corpus.status?.message || (route.kind === 'unloaded'
      ? 'This channel has more content. Load the next batch to resolve this page’s membership.'
      : 'This channel has no readable pages yet.')}</p>
    {(action.kind === 'load-more' || action.kind === 'retry') && <p><a href={requestQuery({...query, pages:String(action.pages)})}>{action.kind === 'retry' ? 'Retry load' : 'Load more'}</a></p>}
    {action.kind === 'limit' && <p>This reader loads at most 10 source pages. Open Are.na to continue.</p>}
    {links.length > 0 && <ul>{links.map(link => <li key={link.href}><a href={link.href} rel="noopener noreferrer">{link.label}</a></li>)}</ul>}
    <p>{corpus.status?.kind === 'error' && <><a href={requestQuery(query) || `/n/${channel}${path.length ? `/p/${path[1]}` : ''}`}>Try again</a> · </>}<a href={corpus.basePath}>Channel index</a> · <a href="/s/hlc">HLC field notes</a></p>
  </main>;
}
