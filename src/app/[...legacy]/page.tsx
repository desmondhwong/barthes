// hx generated — legacy addresses resolve on this host; the original host is untouched.
import { notFound, permanentRedirect } from 'next/navigation';
import { getHlcCorpus } from '@/lib/content';
import { getSiteConfiguration } from '@/lib/database';
import { applyPageMappings, requestQuery, resolveReaderRoute, type ReaderSearchParams } from '@/lib/routing';
export const revalidate = 0;
export default async function Legacy({ params, searchParams }: {
  params: Promise<{ legacy: string[] }>;
  searchParams: Promise<ReaderSearchParams>;
}) {
  const { legacy } = await params;
  const config = await getSiteConfiguration('hlc');
  if (!config) notFound();
  const source = config.sources.find(item => item.kind === 'markdown');
  if (!source) notFound();
  const corpus = applyPageMappings(await getHlcCorpus(), config, source.id);
  const route = resolveReaderRoute(legacy, corpus, config, source.id, requestQuery(await searchParams), { aliasesOnly: true });
  if (route.kind !== 'redirect') notFound();
  // A fragment is never sent to this route; the browser retains it across this redirect.
  permanentRedirect(route.href);
}
