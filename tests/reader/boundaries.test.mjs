import test from 'node:test';
import assert from 'node:assert/strict';
import createGraph from '../../src/reader/graph.mjs';
import createWorkspace from '../../src/reader/workspace.mjs';
import { createNavigation } from '../../src/reader/navigation.mjs';
import Path from '../../src/reader/path.mjs';
import { retainUnloaded } from '../../src/reader/state.mjs';

const corpus = (site = 'barthes-test') => ({
  version: 3, title: 'Barthes test', siteSlug: site, homeId: '52203993',
  pages: [
    { id: '52203993', href: `/s/${site}/p/52203993`, links: ['52203995'] },
    { id: '52203995', href: `/s/${site}/p/52203995`, links: [] },
  ],
});

test('Are.na first block is home without a synthetic node; absolute page routes resolve within their corpus', () => {
  const graph = createGraph(corpus());
  assert.equal(graph.HOME_ID, '52203993');
  assert.equal(Object.keys(graph.PAGES).length, 2);
  const base = 'https://example.test/s/barthes-test/p/52203993';
  assert.equal(graph.hrefToId('/s/barthes-test/p/52203995?pages=2#detail', base), '52203995');
  assert.equal(graph.hrefToId('/s/elsewhere/p/52203995', base), null);
  assert.equal(graph.hrefToId('https://other.test/s/barthes-test/p/52203995', base), null);
  assert.deepEqual(Path.create(graph.HOME_ID, graph.HOME_ID), { items: [], cursor: -1 });
});

test('namespaced exports reject another site even when page IDs coincide; HLC legacy files remain importable', () => {
  const graph = createGraph(corpus());
  const state = graph.visit(graph.newState(), graph.HOME_ID);
  const workspace = createWorkspace(graph, { corpusId: 'barthes-test', allowLegacy: false });
  const preferences = workspace.defaultPreferences();
  const snapshot = workspace.createSnapshot(state, graph.HOME_ID, preferences);
  assert.equal(snapshot.version, 5);
  assert.equal(snapshot.corpus, 'barthes-test');
  assert.deepEqual(workspace.parseSnapshot(JSON.stringify(snapshot)), snapshot);
  const another = createWorkspace(graph, { corpusId: 'another', allowLegacy: false });
  assert.throws(() => another.parseSnapshot(JSON.stringify(snapshot)), /another corpus/);
  const legacy = { ...snapshot, version: 4 }; delete legacy.corpus;
  assert.throws(() => workspace.parseSnapshot(JSON.stringify(legacy)), /legacy explorations/);
  const hlc = createWorkspace(graph, { corpusId: 'hlc', allowLegacy: true });
  assert.equal(hlc.parseSnapshot(JSON.stringify(legacy)).corpus, 'hlc');
});

test('source removal reconciles stored visits and real edges, while incompatible imports fail without mutating input', () => {
  const oldGraph = createGraph(corpus());
  const state = oldGraph.visit(oldGraph.newState(), '52203993');
  oldGraph.follow(state, '52203993', '52203995'); oldGraph.visit(state, '52203995');
  const oldWorkspace = createWorkspace(oldGraph, { corpusId: 'barthes-test', allowLegacy: false });
  const snapshot = oldWorkspace.createSnapshot(state, '52203995', oldWorkspace.defaultPreferences());
  const before = structuredClone(snapshot);
  const changed = corpus(); changed.pages = [{ ...changed.pages[0], links: [] }];
  const graph = createGraph(changed);
  assert.deepEqual(graph.sanitizeState(state).visited, ['52203993']);
  assert.deepEqual(graph.sanitizeState(state).edges, []);
  const workspace = createWorkspace(graph, { corpusId: 'barthes-test', allowLegacy: false });
  assert.throws(() => workspace.parseSnapshot(JSON.stringify(snapshot)), /unknown/);
  assert.deepEqual(snapshot, before);
});

test('absolute hosted navigation retains pagination across direct entries, page changes and anchors', () => {
  const content = corpus(); for (const page of content.pages) page.href += '?pages=3'; const pages = Object.fromEntries(content.pages.map(page => [page.id, page]));
  let href = 'https://example.test/s/barthes-test/p/52203993?pages=3';
  let state = null; let pushes = 0;
  const location = { get href() { return href; } };
  const history = {
    get state() { return state; },
    replaceState(value, unused, url) { state = value; href = url; },
    pushState(value, unused, url) { state = value; href = url; pushes++; },
  };
  const navigation = createNavigation({ location, history, pages, knownIds: pages, home: content.homeId });
  assert.equal(navigation.initial().page, '52203993');
  navigation.write({ page: '52203993', path: { items: [], cursor: -1 } });
  navigation.write({ page: '52203995', path: { items: ['52203995'], cursor: 0 } }, { push: true, anchor: 'section' });
  assert.equal(href, 'https://example.test/s/barthes-test/p/52203995?pages=3#section');
  assert.equal(pushes, 1);
  assert.equal(navigation.read({ type: 'popstate', state }), null);
  href = 'https://example.test/s/another/p/52203995';
  assert.equal(navigation.read({ type: 'popstate', state }), null);
});

test('partial-source refresh keeps unloaded visits and links until complete membership is known', () => {
  const graph = createGraph(corpus());
  const previous = graph.visit(graph.newState(), '52203993');
  graph.follow(previous, '52203993', '52203995'); graph.visit(previous, '52203995');
  const firstPage = corpus(); firstPage.pages = [{ ...firstPage.pages[0], links: [] }];
  const loaded = createGraph(firstPage).sanitizeState(previous);
  const retained = retainUnloaded(previous, loaded, true);
  assert.deepEqual(retained.visited, ['52203993', '52203995']);
  assert.equal(retained.edges[0].traversed, true);
  assert.deepEqual(graph.sanitizeState(retained).visited, previous.visited);
  assert.deepEqual(retainUnloaded(previous, loaded, false), loaded);
});
