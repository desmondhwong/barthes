// hx generated 261101 — verify the server-rendered handoff before enhancement.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Reader from '../../src/reader/Reader';
import {corpusFromArenaEntries} from '../../src/lib/content/arena';

test('server-rendered load more and retry preserve the current dynamic page and escape source titles', () => {
  const corpus = corpusFromArenaEntries([
    {id:101, type:'Text', title:'First', content:{markdown:'First'}},
    {id:202, type:'Text', title:'Second', content:{markdown:'[First](https://www.are.na/block/101)'}},
  ], 2, {siteSlug:'arena:4242', basePath:'/n/4242', title:'<script>title</script>'});
  corpus.source = {...corpus.source!, requestedPages:2, pagesLoaded:2, hasMore:true, pageLimit:10};
  corpus.status = {kind:'partial', message:'More content'};
  const render = () => renderToStaticMarkup(createElement(Reader, {corpus, initialPageId:'202'}));
  let html = render();
  assert.match(html, /data-reader-reload href="\/n\/4242\/p\/202\?pages=3">Load more/);
  assert.match(html, /&lt;script&gt;title&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /href="\/n\/4242\/p\/101\?pages=2"/);
  corpus.status = {kind:'partial', code:'rate-limited', message:'Wait before retrying.'};
  html = render();
  assert.match(html, /data-reader-reload href="\/n\/4242\/p\/202\?pages=2">Retry load/);
  assert.doesNotMatch(html, />Load more</);
  corpus.status = {kind:'partial', message:'More content'};
  corpus.source.requestedPages = 10; corpus.source.pagesLoaded = 10;
  html = render();
  assert.doesNotMatch(html, /data-reader-reload/);
  assert.match(html, /Open the full channel on Are.na/);
});
