import { webcrypto } from "node:crypto";
/* > hx generated 260917-121031-003 fresh — Sitemap 0.7 catalog ordering and loose arrangement checks, Codex / OpenAI / gpt-6; delegated under claim 260917-121031-001/sitemap-controls-connections. */
'use strict';
import test from "node:test";
import assert from "node:assert/strict";
import Catalog from "../../src/reader/catalog.mjs";
const pages = [
  { id: 'home', title: 'Home', publishedDate: '2026-09-16' },
  { id: 'zulu', title: 'Zulu', publishedDate: null },
  { id: 'alpha', title: 'Alpha', publishedDate: '2026-09-15' },
  { id: 'alpha2', title: 'alpha', publishedDate: '2026-09-16' },
  { id: 'beta', title: 'Beta', publishedDate: '2026-09-17' },
  { id: 'bad', title: 'Undated', publishedDate: '2026-02-30' }
];
const ids = rows => rows.map(row => row.id);

test('visited and unvisited filters are independent, include empty results, and preserve input', () => {
  const before = structuredClone(pages), visited = ['home', 'alpha'];
  assert.deepEqual(ids(Catalog.indexPages(pages)), ids(pages));
  assert.deepEqual(ids(Catalog.indexPages(pages, { visited, showVisited: false })), ['zulu', 'alpha2', 'beta', 'bad']);
  assert.deepEqual(ids(Catalog.indexPages(pages, { visited: new Set(visited), showUnvisited: false })), visited);
  assert.deepEqual(Catalog.indexPages(pages, { visited, showVisited: false, showUnvisited: false }), []);
  assert.deepEqual(pages, before);
});

test('alphabetical directions are stable, while original order does not reverse', () => {
  assert.deepEqual(ids(Catalog.sortPages(pages, { sort: 'title' })), ['alpha', 'alpha2', 'beta', 'home', 'bad', 'zulu']);
  assert.deepEqual(ids(Catalog.sortPages(pages, { sort: 'title', direction: 'desc' })), ['zulu', 'bad', 'home', 'beta', 'alpha', 'alpha2']);
  assert.deepEqual(ids(Catalog.sortPages(pages, { sort: 'original', direction: 'desc' })), ids(pages));
  assert.throws(() => Catalog.sortPages(pages, { sort: 'unknown' }), /Unknown/);
});

test('publication dates sort in both directions with stable equal dates and missing dates last', () => {
  assert.deepEqual(ids(Catalog.sortPages(pages, { sort: 'date' })), ['alpha', 'home', 'alpha2', 'beta', 'zulu', 'bad']);
  assert.deepEqual(ids(Catalog.sortPages(pages, { sort: 'date', direction: 'desc' })), ['beta', 'home', 'alpha2', 'alpha', 'zulu', 'bad']);
  const adapted = pages.map(page => ({ ...page, publishedDate: '2026-09-16' }));
  for (const direction of ['asc', 'desc']) assert.deepEqual(ids(Catalog.sortPages(adapted, { sort: 'date', direction })), ids(adapted));
});

test('date validation rejects rollover, non-ISO and missing values', () => {
  for (const value of ['2024-02-29', '2000-02-29', '2026-09-16', '0001-01-01', '9999-12-31']) assert.equal(Catalog.normalizeDate(value), value);
  for (const value of [null, undefined, 20260916, '', '2026-9-16', '2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '0000-01-01', '2026-09-16T00:00:00Z']) assert.equal(Catalog.normalizeDate(value), null);
});

test('path arrangement groups traveled components in route order, followed by isolated visited and unvisited', () => {
  const source = ['unvisited-2', 'alone-2', 'branch', 'home', 'other-2', 'next', 'alone-1', 'unvisited-1', 'other-1'].map(id => ({ id, title: id }));
  const options = {
    visited: ['home', 'next', 'alone-1', 'other-1', 'other-2', 'branch', 'alone-2'],
    path: { items: ['next', 'home', 'branch'], cursor: 1 },
    trail: ['other-1', 'other-2', 'alone-1', 'alone-2'],
    edges: [
      { from: 'home', to: 'next', traversed: true },
      { from: 'home', to: 'branch', traversed: true },
      { from: 'other-1', to: 'other-2', traversed: true },
      { from: 'alone-1', to: 'alone-2', traversed: false },
      { from: 'alone-2', to: 'alone-2', traversed: true },
      { from: 'other-2', to: 'unvisited-1', traversed: true },
      { from: 'unknown', to: 'alone-1', traversed: true }
    ]
  };
  const before = structuredClone(options);
  assert.deepEqual(ids(Catalog.graphPages(source, { ...options, order: 'path' })), ['home', 'next', 'branch', 'other-1', 'other-2', 'alone-1', 'alone-2', 'unvisited-2', 'unvisited-1']);
  assert.deepEqual(ids(Catalog.graphPages(source, { ...options, order: 'path', showVisited: false })), ['unvisited-2', 'unvisited-1']);
  assert.deepEqual(ids(Catalog.graphPages(source, { ...options, order: 'path', showUnvisited: false })), ['home', 'next', 'branch', 'other-1', 'other-2', 'alone-1', 'alone-2']);
  assert.deepEqual(options, before);
});

test('graph title/date arrangements share index order without changing input', () => {
  for (const order of ['title', 'date']) for (const direction of ['asc', 'desc']) assert.deepEqual(Catalog.graphPages(pages, { order, direction }), Catalog.indexPages(pages, { sort: order, direction }));
  assert.deepEqual(Catalog.graphPages(pages, { order: 'path' }), pages, 'no visits leaves corpus order');
});

test('shuffle uses unbiased rejection sampling and a cryptographic Fisher–Yates permutation', () => {
  const values = [0xffffffff, 4, 0]; let calls = 0;
  const crypto = { getRandomValues(array) { assert(array instanceof Uint32Array); assert.equal(array.length, 1); array[0] = values[calls++]; return array; } };
  const input = ['a', 'b', 'c'];
  assert.deepEqual(Catalog.shuffle(input, crypto), ['c', 'a', 'b']);
  assert.equal(calls, 3, 'the first out-of-range random word is rejected, not reduced modulo 3');
  assert.deepEqual(input, ['a', 'b', 'c']);
  assert.notEqual(Catalog.shuffle([], crypto), input);
  for (const missing of [null, {}, { getRandomValues: 0 }]) assert.throws(() => Catalog.shuffle(input, missing), /requires WebCrypto/);
});

test('WebCrypto shuffle remains a permutation for larger arrays', () => {
  const crypto = webcrypto;
  const input = Array.from({ length: 1024 }, (_, index) => index), result = Catalog.shuffle(input, crypto);
  assert.equal(result.length, input.length); assert.deepEqual([...result].sort((a, b) => a - b), input);
  assert.notEqual(result, input);
});

test('tiled rows preserve order, use collision dimensions, center on the requested origin and never overlap', () => {
  const source = Array.from({ length: 34 }, (_, index) => ({ id: String(index), x: 900, y: -100, width: 76, height: [108, 140, 176][index % 3], vx: 14, vy: -7 }));
  source[4].collisionWidth = 240; source[4].collisionHeight = 190;
  const before = structuredClone(source);
  for (const width of [1, 240, 480, 900, 2000]) for (const gap of [0, 8, 36]) {
    const result = Catalog.tile(source, { width, gap, originX: 100, originY: -50 });
    assert.deepEqual(ids(result), ids(source));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [i, a] of result.entries()) {
      assert.equal(a.vx, 0); assert.equal(a.vy, 0);
      const aw = a.collisionWidth || a.width, ah = a.collisionHeight || a.height;
      minX = Math.min(minX, a.x - aw / 2); maxX = Math.max(maxX, a.x + aw / 2);
      minY = Math.min(minY, a.y - ah / 2); maxY = Math.max(maxY, a.y + ah / 2);
      for (const b of result.slice(i + 1)) {
        const bw = b.collisionWidth || b.width, bh = b.collisionHeight || b.height;
        assert(Math.abs(a.x - b.x) >= (aw + bw) / 2 + gap || Math.abs(a.y - b.y) >= (ah + bh) / 2 + gap, `overlap ${a.id}/${b.id}, width ${width}`);
      }
    }
    assert.equal((minX + maxX) / 2, 100); assert.equal((minY + maxY) / 2, -50);
    assert(maxX - minX <= Math.max(width, 240));
  }
  assert.deepEqual(source, before);
  assert.deepEqual(Catalog.tile([]), []);
  for (const options of [{ width: 0 }, { width: Infinity }, { gap: -1 }, { originX: NaN }]) assert.throws(() => Catalog.tile(source, options), /Tile dimensions/);
  assert.throws(() => Catalog.tile([{ width: 10, height: 0 }]), /positive width and height/);
});

function cryptoFixture(seed) {
  let value = seed >>> 0, calls = 0;
  return { get calls() { return calls; }, getRandomValues(array) { calls++; value ^= value << 13; value ^= value >>> 17; value ^= value << 5; array[0] = value >>> 0; return array; } };
}
function checkScatter(source, result, gap, originX = 0, originY = 0) {
  assert.deepEqual(ids(result), ids(source), 'identity and caller order remain intact');
  const size = node => ({ width: node.collisionWidth || node.width, height: node.collisionHeight || node.height });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [i, a] of result.entries()) {
    assert(Number.isFinite(a.x) && Number.isFinite(a.y)); assert.equal(a.vx, 0); assert.equal(a.vy, 0);
    assert.notEqual(a, source[i], 'each returned node is detached');
    const sa = size(a);
    minX = Math.min(minX, a.x - sa.width / 2); maxX = Math.max(maxX, a.x + sa.width / 2);
    minY = Math.min(minY, a.y - sa.height / 2); maxY = Math.max(maxY, a.y + sa.height / 2);
    for (const b of result.slice(i + 1)) {
      const sb = size(b);
      assert(Math.abs(a.x - b.x) >= (sa.width + sb.width) / 2 + gap - 1e-8 || Math.abs(a.y - b.y) >= (sa.height + sb.height) / 2 + gap - 1e-8, `scatter overlap ${a.id}/${b.id}`);
    }
  }
  if (result.length) {
    assert(Math.abs((minX + maxX) / 2 - originX) < 1e-7);
    assert(Math.abs((minY + maxY) / 2 - originY) < 1e-7);
  }
}

test('scatter uses cryptographic random positions rather than shared tile rows or columns', () => {
  const source = Array.from({ length: 34 }, (_, i) => ({ id: String(i), width: 76, height: [108, 140, 176][i % 3], x: 50, y: 80, vx: 2, vy: 3 }));
  source[3].collisionWidth = 185; source[7].collisionHeight = 240;
  const before = structuredClone(source), crypto = cryptoFixture(7919), options = { width: 1000, gap: 40, originX: 81, originY: -42, crypto };
  const result = Catalog.scatter(source, options);
  checkScatter(source, result, 40, 81, -42); assert(crypto.calls > source.length);
  assert(new Set(result.map(node => node.x.toFixed(6))).size > 30);
  assert(new Set(result.map(node => node.y.toFixed(6))).size > 30);
  assert(new Set(result.map(node => (node.y - (node.collisionHeight || node.height) / 2).toFixed(6))).size > 30, 'top edges do not share tile rows');
  assert.notDeepEqual(Catalog.scatter(source, options).map(({ x, y }) => [x, y]), result.map(({ x, y }) => [x, y]), 'the next random draw produces another arrangement');
  assert.deepEqual(source, before);
});

test('scatter has a finite collision-free fallback even when every random word repeats', () => {
  for (const word of [0, 0xffffffff]) {
    let calls = 0;
    const crypto = { getRandomValues(array) { assert(++calls < 4500, 'random rejection must stop'); array[0] = word; return array; } };
    const source = Array.from({ length: 34 }, (_, i) => ({ id: String(i), width: 150, height: 200, vx: 8, vy: -8 }));
    const result = Catalog.scatter(source, { width: 1, gap: 24, crypto });
    checkScatter(source, result, 24);
    assert(new Set(result.map(node => node.x.toFixed(6))).size > 20);
    assert(new Set(result.map(node => node.y.toFixed(6))).size > 20);
    assert(result.every(node => Math.abs(node.x) < 50000 && Math.abs(node.y) < 50000), 'fallback bounds remain finite and proportionate');
  }
});

test('scatter respects mixed expanded rectangle bounds at narrow, wide and extreme aspect ratios', () => {
  const crypto = cryptoFixture(4294967291);
  const source = Array.from({ length: 34 }, (_, i) => ({ id: String(i), width: 10 + i, height: 20 + i, collisionWidth: i % 7 === 0 ? 2000 : 80 + i * 3, collisionHeight: i % 11 === 0 ? 1800 : 140 + i * 2 }));
  for (const width of [1, 320, 1400, 10000]) for (const gap of [0, 40, 120]) {
    const result = Catalog.scatter(source, { width, gap, crypto });
    checkScatter(source, result, gap);
    assert(result.every(node => Math.abs(node.x) < 100000 && Math.abs(node.y) < 100000));
  }
});

test('scatter fails explicitly without WebCrypto and never partially mutates input on random failure', () => {
  const source = [{ id: 'a', width: 100, height: 200, x: 5, y: 9 }, { id: 'b', width: 150, height: 70, x: -90, y: -2 }], before = structuredClone(source);
  for (const crypto of [null, {}, { getRandomValues: 1 }]) assert.throws(() => Catalog.scatter(source, { crypto }), /requires WebCrypto/);
  let calls = 0;
  assert.throws(() => Catalog.scatter(source, { crypto: { getRandomValues(array) { if (++calls === 3) throw Error('Crypto unavailable'); array[0] = 123; return array; } } }), /Crypto unavailable/);
  assert.deepEqual(source, before);
  const crypto = cryptoFixture(1);
  assert.deepEqual(Catalog.scatter([], { crypto }), []);
  checkScatter(source.slice(0, 1), Catalog.scatter(source.slice(0, 1), { crypto, originX: 7, originY: -8 }), 36, 7, -8);
  for (const options of [{ width: 0 }, { width: Infinity }, { gap: -1 }, { originY: NaN }]) assert.throws(() => Catalog.scatter(source, { ...options, crypto }), /Scatter dimensions/);
  assert.throws(() => Catalog.scatter([{ width: 0, height: 20 }], { crypto }), /positive width and height/);
});
