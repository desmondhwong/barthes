// hx generated 261101 — dynamic channel identities, public boundaries and route safety.
import assert from 'node:assert/strict';
import test from 'node:test';
import { getArenaCorpus, corpusFromArenaEntries, type ArenaOptions } from '../../src/lib/content/arena';
import { applyPageMappings, paginationAction, resolvePublicNetRoute } from '../../src/lib/routing';

const channel = {id:4242, type:'Channel', slug:'a-net', title:'A net', state:'available', visibility:'closed', owner:{slug:'desmond-wong'}};
const entries = [
  {id:101, type:'Text', title:'A', content:{markdown:'[B](https://www.are.na/block/202#detail)'}},
  {id:202, type:'Text', title:'B', content:{markdown:'# B\n\n## Detail\n\nAn authored page.'}},
];
const json = (value: unknown) => new Response(JSON.stringify(value), {headers:{'content-type':'application/json'}});
const content = (data = entries, page = 1, total = 1) => ({data, meta:{current_page:page, next_page:page < total ? page + 1 : null, total_pages:total, total_count:2, has_more_pages:page < total}});
const fixture: NonNullable<ArenaOptions['fetcher']> = async url => json(new URL(url).pathname.endsWith('/contents') ? content() : channel);

test('public slug and numeric routes share immutable identity, actual title and canonical links', async () => {
  const bySlug = await getArenaCorpus({channelId:'a-net', publicNet:true, fetcher:fixture});
  const byId = await getArenaCorpus({channelId:'4242', publicNet:true, fetcher:fixture});
  assert.deepEqual(bySlug, byId);
  assert.equal(bySlug.siteSlug, 'arena:4242');
  assert.equal(bySlug.basePath, '/n/4242');
  assert.equal(bySlug.title, 'A net');
  assert.equal(bySlug.source?.url, 'https://www.are.na/desmond-wong/a-net');
  assert.deepEqual(bySlug.pages.map(page => [page.id, page.links]), [['101',['202']],['202',[]]]);
  assert.match(bySlug.pages[0].html, /href="\/n\/4242\/p\/202#detail"/);
  assert.match(bySlug.pages[1].footer, /href="\/n\/4242\/p\/101"/);
});

test('public visibility is checked without a cache before reading cached contents, with no credentials', async () => {
  const paths: string[] = [];
  await getArenaCorpus({channelId:'a-net', publicNet:true, fetcher:async (url, init) => {
    const contents = new URL(url).pathname.endsWith('/contents');
    paths.push(new URL(url).pathname);
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    assert.deepEqual(init.headers, {Accept:'application/json'});
    assert.equal(init.next.revalidate, contents ? 300 : 0);
    if (!contents) assert.equal(init.cache, 'no-store');
    return json(contents ? content() : channel);
  }});
  assert.deepEqual(paths, ['/v3/channels/a-net','/v3/channels/4242/contents']);
});

test('private, deleted, absent and unknown visibility never fetch or expose content or private metadata', async () => {
  for (const metadata of [
    {...channel, visibility:'private'}, {...channel, state:'deleted'},
    {...channel, visibility:undefined}, {...channel, visibility:'future-value'},
  ]) {
    let calls = 0;
    const corpus = await getArenaCorpus({channelId:'a-net', publicNet:true, fetcher:async () => {
      calls++; return json({...metadata, title:'SECRET TITLE', description:{markdown:'SECRET BODY'}});
    }});
    assert.equal(calls, 1);
    assert.equal(corpus.status?.kind, 'error');
    assert.deepEqual(corpus.pages, []);
    assert.doesNotMatch(JSON.stringify(corpus), /SECRET/);
  }
  for (const status of [401,403,404]) {
    const corpus = await getArenaCorpus({channelId:'a-net', publicNet:true, fetcher:async () => new Response('SECRET', {status})});
    assert.equal(corpus.status?.code, 'unavailable');
    assert.doesNotMatch(JSON.stringify(corpus), /SECRET/);
  }
});

test('numeric channel mismatch and malformed metadata fail closed', async () => {
  const corpus = await getArenaCorpus({channelId:'999', publicNet:true, fetcher:fixture});
  assert.equal(corpus.status?.code, 'invalid-response');
  assert.deepEqual(corpus.pages, []);
  for (const metadata of [null, [], {...channel, type:'Text'}, {...channel, id:'invalid'}, {...channel, title:42}]) {
    const result = await getArenaCorpus({channelId:'a-net', publicNet:true, fetcher:async () => json(metadata)});
    assert.equal(result.status?.code, 'invalid-response');
  }
});

test('independent channels sharing blocks cannot share reader or export identity', async () => {
  const one = await getArenaCorpus({channelId:'a-net', publicNet:true, fetcher:fixture});
  const two = await getArenaCorpus({channelId:'another-net', publicNet:true, fetcher:async url => json(new URL(url).pathname.endsWith('/contents') ? content() : {...channel, id:5454})});
  assert.notEqual(one.siteSlug, two.siteSlug);
  assert.notEqual(one.pages[0].href, two.pages[0].href);
  assert.deepEqual(one.pages[0].links, two.pages[0].links);
  assert.ok(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(one.siteSlug)); // cannot collide with configured-site slugs
});

test('presentation follows any configured site and mapping overrides retain its scope', async () => {
  const corpus = await getArenaCorpus({channelId:'a-net', siteSlug:'custom-site', title:'My site', basePath:'/s/custom-site', sourceUrl:'https://www.are.na/desmond-wong/a-net', fetcher:fixture});
  const config = {
    site:{id:'site', slug:'custom-site', title:'My site', description:'', home_page_slug:'101'},
    sources:[{id:'source', site_id:'site', kind:'arena' as const, source_key:'arena', source_ref:'4242', label:'Are.na'}],
    pages:[{id:'page', site_id:'site', source_id:'source', source_page_id:'202', slug:'renamed', title:'B'}], aliases:[],
  };
  const mapped = applyPageMappings(corpus, config, 'source');
  assert.equal(mapped.title, 'My site');
  assert.equal(mapped.pages[1].href, '/s/custom-site/p/renamed');
  assert.match(mapped.pages[0].html, /href="\/s\/custom-site\/p\/renamed#detail"/);
});

test('dynamic pagination and retry preserve channel, block IDs and query', async () => {
  const corpus = await getArenaCorpus({channelId:'a-net', publicNet:true, pageLimit:2, fetcher:async url => {
    const parsed = new URL(url);
    if (!parsed.pathname.endsWith('/contents')) return json(channel);
    const page = Number(parsed.searchParams.get('page'));
    return json(content([entries[page - 1]], page, 2));
  }});
  assert.equal(corpus.pages[0].href, '/n/4242/p/101?pages=2');
  assert.match(corpus.pages[0].html, /\/n\/4242\/p\/202\?pages=2#detail/);
  assert.match(corpus.pages[1].footer, /\/n\/4242\/p\/101\?pages=2/);
  corpus.status = {kind:'partial', code:'rate-limited'};
  corpus.source!.hasMore = true;
  assert.deepEqual(paginationAction(corpus, 2), {kind:'retry', pages:2});
});

test('public route resolution distinguishes missing, unloaded, malformed and failed sources', async () => {
  const corpus = await getArenaCorpus({channelId:'a-net', publicNet:true, fetcher:fixture});
  assert.deepEqual(resolvePublicNetRoute([], corpus), {kind:'page', pageId:'101'});
  assert.deepEqual(resolvePublicNetRoute(['p','202'], corpus), {kind:'page', pageId:'202'});
  assert.deepEqual(resolvePublicNetRoute(['p','999'], corpus), {kind:'not-found'});
  corpus.source!.hasMore = true;
  assert.deepEqual(resolvePublicNetRoute(['p','999'], corpus), {kind:'unloaded', sourcePageId:'999'});
  for (const path of [['foo','101'],['p','0'],['p','bad'],['p','101','extra']]) assert.deepEqual(resolvePublicNetRoute(path, corpus), {kind:'not-found'});
  corpus.pages = []; corpus.status = {kind:'error', code:'unavailable'};
  assert.deepEqual(resolvePublicNetRoute(['p','999'], corpus), {kind:'empty'});
});

test('hostile presentation metadata stays text and cannot alter fetch hosts or reader links', async () => {
  const corpus = await getArenaCorpus({channelId:'a-net', publicNet:true, fetcher:async url => json(new URL(url).pathname.endsWith('/contents') ? content() : {...channel, title:'<script>bad</script>\u0000 title', slug:'../../bad', owner:{slug:'evil.test/user'}})});
  assert.equal(corpus.title, '<script>bad</script>  title');
  assert.equal(corpus.source?.url, 'https://www.are.na/channel/4242');
  assert.equal(corpus.pages[0].href, '/n/4242/p/101');
  for (const options of [{basePath:'//evil.test'}, {sourceUrl:'javascript:alert(1)'}, {sourceUrl:'https://www.are.na.evil.test/a'}]) {
    await assert.rejects(getArenaCorpus({...options, fetcher:async () => {throw new Error('Must not fetch');}}), /Invalid Are.na/);
  }
  const encoded = corpusFromArenaEntries([{...entries[0], title:'<script>bad</script>'}], 1, {siteSlug:'safe', title:'Safe', basePath:'/s/safe'});
  assert.doesNotMatch(encoded.pages[0].html, /<script>/);
});
