/* > hx generated 260917-121258-003 fresh — Sitemap 0.7 connection geometry and interaction regression tests, Codex / OpenAI / gpt-6; delegated under claim 260917-121031-001/sitemap-controls-connections. */
'use strict';
import test from "node:test";
import assert from "node:assert/strict";
import C from "../../src/reader/connections.mjs";
const rect = (x, y, w = 20, h = 20) => ({ x, y, w, h });
const edge = (from, to, traversed = false) => ({ from, to, traversed });

test('clips horizontal, vertical and diagonal lines to rectangular page boundaries', () => {
  assert.deepEqual(C.segments([edge('a', 'b')], { a: rect(0, 0), b: rect(100, 0, 40) })[0].a, { x: 10, y: 0 });
  assert.deepEqual(C.segments([edge('a', 'b')], { a: rect(0, 0), b: rect(100, 0, 40) })[0].b, { x: 80, y: 0 });
  const vertical = C.segments([edge('a', 'b')], { a: rect(0, 0, 20, 30), b: rect(0, 100) })[0];
  assert.deepEqual(vertical.a, { x: 0, y: 15 }); assert.deepEqual(vertical.b, { x: 0, y: 90 });
  const diagonal = C.segments([edge('b', 'a')], { a: rect(0, 0, 20, 40), b: rect(100, 100, 40, 20) })[0];
  assert.deepEqual(diagonal.a, { x: 10, y: 10 }); assert.deepEqual(diagonal.b, { x: 90, y: 90 });
});

test('omits self links, hidden or invalid rectangles, touching and overlapping pages', () => {
  const screen = { a: rect(0, 0), b: rect(20, 0), c: rect(10, 10), hidden: { ...rect(100, 0), hidden: true }, bad: rect(NaN, 20), zero: rect(70, 0, 0) };
  assert.deepEqual(C.segments([edge('a', 'a'), edge('a', 'b'), edge('a', 'c'), edge('a', 'missing'), edge('a', 'hidden'), edge('a', 'bad'), edge('a', 'zero'), null], screen), []);
  assert.deepEqual(C.segments([edge('a', 'b')], { a: rect(-1e308, 0), b: rect(1e308, 0) }), []);
});

test('local filtering includes incoming and outgoing edges, and visible screen entries gate links', () => {
  const all = [edge('a', 'b'), edge('c', 'a'), edge('b', 'c')], screen = { a: rect(0, 0), b: rect(100, 0), c: rect(0, 100) };
  assert.deepEqual(C.segments(all, screen, { current: 'a', local: true }).map(s => [s.from, s.to]), [['a', 'b'], ['a', 'c']]);
  assert.equal(C.segments(all, { a: screen.a, b: screen.b }, { current: 'a', local: true }).length, 1);
  assert.deepEqual(C.segments(all, screen, { local: true }), []);
});

test('reciprocal and duplicate edges share one segment while preserving real directions and traversal', () => {
  const source = [edge('b', 'a'), edge('a', 'b'), edge('a', 'b', true)], screen = { a: rect(0, 0), b: rect(100, 0) };
  const segments = C.segments(source, screen); assert.equal(segments.length, 1); assert.equal(segments[0].traversed, true);
  assert.deepEqual(segments[0].edges, [edge('a', 'b', true), edge('b', 'a')]);
  assert.deepEqual(C.segments([...source].reverse(), screen), segments);
  const outgoing = C.pick(segments, { x: 30, y: 0 }, { current: 'a' }); assert.equal(outgoing.target, 'b'); assert.equal(outgoing.from, 'a'); assert.equal(outgoing.to, 'b');
  const reverse = C.pick(segments, { x: 70, y: 0 }, { current: 'b' }); assert.equal(reverse.target, 'a'); assert.equal(reverse.from, 'b'); assert.equal(reverse.to, 'a');
});

test('incoming-only selection targets the other endpoint without inventing a reversed edge', () => {
  const segments = C.segments([edge('a', 'b')], { a: rect(0, 0), b: rect(100, 0) });
  const selected = C.pick(segments, { x: 50, y: 3 }, { current: 'b' });
  assert.equal(selected.target, 'a'); assert.equal(selected.from, 'a'); assert.equal(selected.to, 'b');
});

test('a nonincident connection chooses the nearer endpoint and ties toward the canonical end', () => {
  const segments = C.segments([edge('a', 'b')], { a: rect(0, 0), b: rect(100, 0) });
  assert.equal(C.pick(segments, { x: 20, y: 2 }, { current: 'elsewhere' }).target, 'a');
  assert.equal(C.pick(segments, { x: 80, y: -2 }, { current: 'elsewhere' }).target, 'b');
  assert.equal(C.pick(segments, { x: 50, y: 0 }).target, 'b');
});

test('hit tolerance is measured in screen pixels and ends use finite-segment distance', () => {
  const segments = C.segments([edge('a', 'b')], { a: rect(0, 0, 20, 4), b: rect(100, 0, 20, 4) });
  assert.ok(C.pick(segments, { x: 50, y: 7 })); assert.equal(C.pick(segments, { x: 50, y: 7.01 }), null);
  assert.ok(C.pick(segments, { x: 7, y: 5 }, { tolerance: 6 })); assert.equal(C.pick(segments, { x: 0, y: 5 }, { tolerance: 6 }), null);
  assert.ok(C.pick(segments, { x: 50, y: 0 }, { tolerance: 0 })); assert.equal(C.pick(segments, { x: 50, y: 0.1 }, { tolerance: 0 }), null);
});

test('diagonal hits use perpendicular distance rather than axis-aligned bounding boxes', () => {
  const segments = C.segments([edge('a', 'b')], { a: rect(0, 0), b: rect(100, 100) });
  const hit = C.pick(segments, { x: 50, y: 55 }, { tolerance: 4 }); assert.ok(hit); assert.ok(Math.abs(hit.distance - Math.sqrt(12.5)) < 1e-9);
  assert.equal(C.pick(segments, { x: 50, y: 60 }, { tolerance: 7 }), null);
});

test('block interiors and extra isolated blocks take precedence over connections', () => {
  const segments = C.segments([edge('a', 'b')], { a: rect(0, 0), b: rect(100, 0) });
  assert.equal(C.pick(segments, { x: 8, y: 0 }), null);
  assert.equal(C.pick(segments, { x: 50, y: 0 }, { rectangles: { isolated: rect(50, 0) } }), null);
  assert.equal(C.contains(rect(0, 0), { x: 10, y: 10 }), true); assert.equal(C.contains(rect(0, 0), { x: 10.01, y: 0 }), false);
});

test('crossings prioritize current connections on equal distance and are independent of list order', () => {
  const segments = C.segments([edge('a', 'b'), edge('c', 'd')], { a: rect(-50, 0), b: rect(50, 0), c: rect(0, -50), d: rect(0, 50) });
  const cross = { x: 0, y: 0 };
  assert.equal(C.pick(segments, cross, { current: 'c' }).target, 'd');
  assert.equal(C.pick([...segments].reverse(), cross, { current: 'c' }).target, 'd');
  assert.equal(C.pick(segments, cross).segment.key, C.pick([...segments].reverse(), cross).segment.key);
  assert.equal(C.pick(segments, { x: 1, y: 0 }, { current: 'c' }).segment.from, 'a', 'a clearly nearer line wins over current affinity');
});

test('invalid points and segments cannot produce nonfinite selections', () => {
  const segments = C.segments([edge('a', 'b')], { a: rect(0, 0), b: rect(100, 0) });
  for (const point of [null, {}, { x: NaN, y: 0 }, { x: 0, y: Infinity }, { x: 1e308, y: 1e308 }]) assert.equal(C.pick(segments, point), null);
  assert.equal(C.pick([{ a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, edges: [edge('a', 'b')] }], { x: 0, y: 0 }), null);
});

test('geometry generation and selection leave source edges and screen rectangles untouched', () => {
  const edges = [Object.freeze(edge('a', 'b'))], screen = Object.freeze({ a: Object.freeze(rect(0, 0)), b: Object.freeze(rect(100, 0)) });
  const segments = C.segments(edges, screen); C.pick(segments, { x: 50, y: 0 }); segments[0].rects[0].x = 900; segments[0].edges[0].traversed = true;
  assert.equal(screen.a.x, 0); assert.equal(edges[0].traversed, false);
});
