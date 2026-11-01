/* > hx generated 260916-182408-003 fresh — Sitemap 0.5 native history checks, Codex / OpenAI / gpt-6; delegated under claim 260916-182408-001/sitemap-0.5. */
'use strict';
import test from "node:test";
import assert from "node:assert/strict";
import { createNavigation } from "../../src/reader/navigation.mjs";
const pages = {
  home: { href: 'index.html' },
  overview: { href: 'overview.html' },
  'concepts/deep/state': { href: 'concepts/deep/state.html' },
  loops: { href: 'loops.html' }
};
const state = (page, items = page === 'home' ? [] : [page], cursor = items.length - 1) => ({ page, path: { items, cursor } });
const copy = value => value == null ? value : structuredClone(value);
function browser(url, { reject = 'none', storage = new Map() } = {}) {
  const entries = [{ url, state: null }], events = [];
  let cursor = 0;
  function change(next, value, push) {
    if (push) { entries.splice(cursor + 1); entries.push({ url: next, state: copy(value) }); cursor++; }
    else entries[cursor] = { url: next, state: copy(value) };
  }
  function nativeHash(next, push) {
    const before = entries[cursor].url;
    if (next === before) return;
    change(next, entries[cursor].state, push);
    events.push({ type: 'hashchange', oldURL: before, newURL: next });
  }
  const location = {
    get href() { return entries[cursor].url; },
    get hash() { return new URL(this.href).hash; },
    set hash(value) { const next = new URL(this.href); next.hash = value; nativeHash(next.href, true); },
    replace(value) { nativeHash(new URL(value, this.href).href, false); }
  };
  function historyWrite(value, unused, href, push) {
    const before = new URL(location.href), next = new URL(href, before);
    if (reject === 'all' || reject === 'file-path' && before.protocol === 'file:' && next.pathname !== before.pathname) throw new Error('SecurityError');
    change(next.href, value, push);
  }
  const history = {
    get state() { return copy(entries[cursor].state); },
    pushState(value, unused, href) { historyWrite(value, unused, href, true); },
    replaceState(value, unused, href) { historyWrite(value, unused, href, false); },
    go(offset) {
      const target = cursor + offset;
      if (target < 0 || target >= entries.length) return;
      const before = location.href; cursor = target;
      events.push({ type: 'popstate', state: this.state });
      if (new URL(before).hash !== location.hash) events.push({ type: 'hashchange', oldURL: before, newURL: location.href });
    }
  };
  const session = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  return { location, history, session, entries, events, storage, get cursor() { return cursor; }, adapter() { return createNavigation({ location, history, storage: session, pages, knownIds: pages }); }, drain(adapter) { return events.splice(0).map(event => adapter.read(event)).filter(Boolean); } };
}

for (const [url, reject, mode] of [
  ['https://example.test/site/index.html', 'none', 'history'],
  ['file:///tmp/site/index.html', 'file-path', 'history'],
  ['file:///tmp/site/index.html', 'all', 'hash'],
  ['https://example.test/site/index.html', 'all', 'hash']
]) test(`Back and Forward restore every page/path exactly (${new URL(url).protocol}, ${reject})`, () => {
  const b = browser(url, { reject }), n = b.adapter();
  assert.equal(n.initial().page, 'home');
  assert.equal(n.initial().entry, null, 'plain entry must not override a saved session path');
  assert.equal(n.write(state('home')).mode, mode);
  const visits = [state('home'), state('overview'), state('concepts/deep/state', ['overview', 'concepts/deep/state']), state('loops', ['overview', 'concepts/deep/state', 'loops'])];
  for (const visit of visits.slice(1)) assert.equal(n.write(visit, { push: true }).mode, mode);
  assert.equal(b.entries.length, 4);
  assert.deepEqual(b.drain(n), [], 'our own native hash acknowledgements do not navigate again');
  for (let i = 2; i >= 0; i--) {
    b.history.go(-1); const arrivals = b.drain(n);
    assert.equal(arrivals.length, 1, 'popstate/hashchange pair is one arrival');
    assert.deepEqual({ page: arrivals[0].page, path: arrivals[0].path }, visits[i]);
    assert.equal(n.write(visits[i]).mode, 'unchanged', 'restoration does not replace the entry identity');
  }
  for (let i = 1; i < visits.length; i++) {
    b.history.go(1); const arrivals = b.drain(n);
    assert.equal(arrivals.length, 1);
    assert.deepEqual({ page: arrivals[0].page, path: arrivals[0].path }, visits[i]);
  }
  assert.equal(b.entries.length, 4);
  if (url.startsWith('file:')) for (const entry of b.entries) assert.equal(new URL(entry.url).pathname, '/tmp/site/index.html');
  else if (reject === 'none') assert.equal(new URL(b.location.href).pathname, '/site/loops.html');
});

test('selecting a breadcrumb restores its retained later path; a new branch drops browser Forward', () => {
  const b = browser('file:///tmp/site/index.html', { reject: 'all' }), n = b.adapter();
  n.write(state('home'));
  n.write(state('overview'), { push: true });
  n.write(state('loops', ['overview', 'loops']), { push: true });
  const selected = state('overview', ['overview', 'loops'], 0);
  n.write(selected, { push: true });
  b.drain(n);
  b.history.go(-1); assert.equal(b.drain(n)[0].page, 'loops');
  b.history.go(1); assert.deepEqual(b.drain(n)[0].path, selected.path);
  b.history.go(-1); b.drain(n);
  n.write(state('concepts/deep/state', ['overview', 'loops', 'concepts/deep/state']), { push: true });
  assert.equal(b.entries.length, 4);
  b.drain(n); b.history.go(1); assert.deepEqual(b.drain(n), []);
});

test('identical page/path writes and replace-only path edits do not add browser entries', () => {
  const b = browser('file:///tmp/site/index.html'), n = b.adapter();
  n.write(state('home')); n.write(state('overview'), { push: true });
  const entry = n.initial().entry;
  for (let i = 0; i < 5; i++) assert.equal(n.write(state('overview'), { push: true }).mode, 'unchanged');
  assert.equal(n.initial().entry, entry); assert.equal(b.entries.length, 2);
  n.write(state('overview', ['overview', 'loops', 'overview']));
  assert.equal(b.entries.length, 2);
  assert.deepEqual(n.initial().path.items, ['overview', 'loops', 'overview']);
});

test('file reload restores the selected page, anchor and full route from native state or optional session registry', () => {
  for (const reject of ['file-path', 'all']) {
    const b = browser('file:///tmp/site/index.html', { reject }), n = b.adapter();
    const visit = state('concepts/deep/state', ['overview', 'loops', 'concepts/deep/state']);
    n.write(state('home')); n.write(visit, { push: true, anchor: 'state & time' }); b.drain(n);
    const reloaded = b.adapter(), restored = reloaded.initial();
    assert.equal(restored.page, visit.page); assert.deepEqual(restored.path, visit.path); assert.equal(restored.anchor, 'state & time');
    assert.equal(reloaded.write(visit, { anchor: restored.anchor }).mode, 'unchanged');
    assert.equal(b.entries.length, 2);
    const fresh = browser(b.location.href, { reject, storage: b.storage });
    assert.deepEqual(fresh.adapter().initial(), restored, 'registry survives fresh document with no history state');
    const withoutStorage = browser(b.location.href, { reject }).adapter().initial();
    assert.equal(withoutStorage.page, visit.page); assert.deepEqual(withoutStorage.path, state(visit.page).path);
  }
});

test('direct nested entry keeps its own document path on file navigation', () => {
  const b = browser('file:///tmp/site/concepts/deep/state.html#introduction', { reject: 'file-path' }), n = b.adapter();
  assert.equal(n.initial().page, 'concepts/deep/state'); assert.equal(n.initial().anchor, 'introduction');
  n.write(state('concepts/deep/state'), { anchor: 'introduction' }); n.write(state('home'), { push: true });
  assert.equal(new URL(b.location.href).pathname, '/tmp/site/concepts/deep/state.html');
  b.history.go(-1); const arrival = b.drain(n)[0];
  assert.equal(arrival.page, 'concepts/deep/state'); assert.equal(arrival.anchor, 'introduction');
});

test('HTTP anchors retain history identity after URL encoding and later native fallback', () => {
  const b = browser('https://example.test/site/index.html'), n = b.adapter();
  n.write(state('home')); const written = n.write(state('overview'), { push: true, anchor: 'state & café' });
  assert.equal(n.initial().entry, written.entry);
  assert.equal(decodeURIComponent(n.initial().anchor), 'state & café');
  b.history.pushState = () => { throw Error('denied'); };
  assert.equal(n.write(state('loops', ['overview', 'loops']), { push: true }).mode, 'hash');
  assert.equal(new URL(b.location.href).pathname, '/site/overview.html');
  assert.equal(n.initial().page, 'loops'); b.drain(n);
  b.history.go(-1); const restored = b.drain(n)[0];
  assert.equal(restored.entry, written.entry); assert.equal(restored.page, 'overview');
});

test('invalid or external routes cannot become pages; unsafe page hrefs never become egress', () => {
  for (const hash of ['#sitemap-page=unknown&entry=x', '#sitemap-page=home', '#sitemap-page=home&entry=x&entry=y', '#sitemap-page=home&entry=x&url=https://evil.test', '#sitemap-page=home&entry=x&anchor=%', '#sitemap-page=home&entry=x&anchor=%FF', '#sitemap-page=home&entry=x&anchor=%00']) {
    assert.equal(browser('file:///tmp/site/index.html' + hash).adapter().initial(), null);
  }
  const b = browser('https://example.test/site/index.html'), n = createNavigation({ location: b.location, history: b.history, pages: { ...pages, loops: { href: 'https://evil.test/leak' } }, knownIds: pages });
  n.write(state('home')); assert.equal(n.write(state('loops'), { push: true }).ok, true);
  assert.equal(new URL(b.location.href).origin, 'https://example.test');
  assert.equal(n.initial().page, 'loops');
  const before = b.location.href;
  assert.equal(n.write(state('unknown'), { push: true }).ok, false);
  assert.equal(n.write(state('home'), { anchor: '\u0000' }).ok, false);
  assert.equal(b.location.href, before);
  b.entries[b.cursor].url = 'https://evil.test/site/index.html#sitemap-page=home&entry=x';
  assert.equal(n.read({ type: 'hashchange' }), null);
});

test('denied or corrupt session storage leaves native history operational', () => {
  for (const storage of [{ getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } }, { getItem: () => '{bad', setItem() {} }]) {
    const b = browser('file:///tmp/site/index.html', { reject: 'all' });
    const n = createNavigation({ location: b.location, history: b.history, storage, pages, knownIds: pages });
    n.write(state('home')); n.write(state('overview'), { push: true }); b.drain(n);
    b.history.go(-1); assert.equal(b.drain(n)[0].page, 'home');
    b.history.go(1); assert.equal(b.drain(n)[0].page, 'overview');
  }
});

// hx generated 261026-141314-002 current — clean URL history regression checks.
const cleanPages = {home:{href:'./'}, overview:{href:'overview'}, loops:{href:'loops'}, 'concepts/deep/state':{href:'concepts--deep--state'}};
function cleanAdapter(b) { return createNavigation({location:b.location, history:b.history, storage:b.session, pages:cleanPages, knownIds:cleanPages}); }
test('clean and legacy HTTP routes preserve mount, anchors, reload, and one-stop history', () => {
  for (const mount of ['/', '/barthes/', '/nested/site/']) for (const [entry,id] of [['','home'],['index','home'],['index.html','home'],['overview','overview'],['overview.html','overview'],['concepts--deep--state.html','concepts/deep/state']]) {
    const b=browser('https://example.test'+mount+entry+'#intro'), n=cleanAdapter(b);
    assert.equal(n.initial().page,id); assert.equal(n.initial().anchor,'intro');
    n.write(state(id),{anchor:'intro'});
    assert.equal(b.entries.length,1);
    assert.equal(new URL(b.location.href).pathname,mount+(id==='home'?'':cleanPages[id].href));
    n.write(state('loops'),{push:true,anchor:'detail'});
    assert.equal(b.entries.length,2); assert.equal(new URL(b.location.href).pathname,mount+'loops');
    assert.equal(cleanAdapter(browser(b.location.href)).initial().page,'loops');
    b.history.go(-1); assert.equal(b.drain(n).at(-1).page,id);
    b.history.go(1); const forward=b.drain(n).at(-1); assert.equal(forward.page,'loops'); assert.equal(forward.anchor,'detail');
    n.write(state('home'),{push:true}); assert.equal(new URL(b.location.href).pathname,mount);
  }
});
test('clean data preserves file document routes and denied-History hash fallback', () => {
  for (const url of ['file:///tmp/site/index.html','file:///tmp/site/overview.html','https://example.test/barthes/overview.html']) for (const reject of ['none','all']) {
    const b=browser(url,{reject}), n=cleanAdapter(b), first=n.initial().page;
    assert.equal(first,url.includes('overview')?'overview':'home');
    n.write(state(first)); n.write(state('loops'),{push:true,anchor:'detail'});
    if(url.startsWith('file:')||reject==='all')assert.equal(new URL(b.location.href).pathname,new URL(url).pathname);
    assert.equal(cleanAdapter(browser(b.location.href,{reject,storage:b.storage})).initial().page,'loops');
    b.history.go(-1); assert.equal(b.drain(n).at(-1).page,first);
    b.history.go(1); assert.equal(b.drain(n).at(-1).page,'loops');
  }
});
