/* > hx generated 260917-105909-003 fresh — Sitemap 0.6 graph behavior and eased settling checks, Codex / OpenAI / gpt-6; delegated under claim 260917-105909-001/sitemap-0.6. */
"use strict";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import Content from "./content.mjs";
import createGraph from "../../src/reader/graph.mjs";
const Graph = createGraph(Content);
const { PAGES, LINKS, newState, sanitizeState, visit, follow, hrefToId } = Graph;
const edge = (state, from, to) => state.edges.find((item) => item.from === from && item.to === to);
const move = (state, from, to) => visit(follow(state, from, to), to);

test("every page and possible directed link is present before exploration", () => {
  const state = newState();
  assert.equal(state.version, 3);
  assert.deepEqual(state.visible, Object.keys(PAGES));
  assert.equal(state.edges.length, Object.values(LINKS).flat().length);
  assert.ok(state.edges.every((item) => !item.traversed));
  assert.equal(state.open, false);
  assert.deepEqual(state.visited, []);
  assert.equal(Graph.HOME_ID, "home");
  assert.ok(Object.isFrozen(PAGES.overview));
  assert.ok(Object.isFrozen(LINKS.overview));
});

test("hyperlink journeys mark actual links; map jumps and Back only visit pages", () => {
  const state = visit(newState(), "home");
  move(state, "home", "overview");
  move(state, "overview", "concepts/deep/state");
  visit(state, "home");
  visit(state, "notes/future");
  visit(state, "overview");
  visit(state, "overview");
  assert.deepEqual(state.trail, ["home", "overview", "concepts/deep/state", "home", "notes/future", "overview"]);
  assert.equal(edge(state, "home", "overview").traversed, true);
  assert.equal(edge(state, "overview", "concepts/deep/state").traversed, true);
  assert.equal(edge(state, "concepts/deep/state", "overview").traversed, false);
  assert.equal(edge(state, "notes/future", "home").traversed, false);
  const before = structuredClone(state);
  follow(state, "home", "notes/future");
  assert.deepEqual(state, before);
  assert.deepEqual(sanitizeState(JSON.parse(JSON.stringify(state))), state);
});

test("following a link does not pretend its destination has loaded", () => {
  const state = visit(newState(), "home");
  assert.strictEqual(follow(state, "home", "overview"), state);
  assert.equal(edge(state, "home", "overview").traversed, true);
  assert.deepEqual(state.visited, ["home"]);
  assert.deepEqual(state.trail, ["home"]);
  follow(state, "notes/future", "home");
  assert.equal(edge(state, "notes/future", "home").traversed, false);
});

test("unknown and inherited property IDs are inert", () => {
  const state = visit(newState(), "home");
  const before = structuredClone(state);
  for (const id of ["missing", "constructor", "__proto__", "toString", null, 1, {}, []]) {
    visit(state, id); follow(state, "home", id); follow(state, id, "home");
  }
  follow(state, "home", "home");
  assert.deepEqual(state, before);
});

test("stored input recovers valid fields, restores all possibilities and rejects old schema", () => {
  for (const raw of [null, false, [], {}, { version: 1 }, { version: "3" }]) assert.deepEqual(sanitizeState(raw), newState());
  const state = sanitizeState({
    version: 3, visited: ["home", "home", "overview", "__proto__"], visible: [], open: true,
    edges: [null, {}, { from: "home", to: "overview", traversed: true }, { from: "home", to: "overview", traversed: false }, { from: "home", to: "notes/future", traversed: true }, { from: "notes/future", to: "home", traversed: true }],
    trail: ["home", "home", "overview", "notes/future", "home"]
  });
  assert.deepEqual(state.visible, Object.keys(PAGES));
  assert.deepEqual(state.visited, ["home", "overview"]);
  assert.deepEqual(state.trail, ["home", "overview", "home"]);
  assert.equal(state.open, true);
  assert.equal(state.edges.filter((item) => item.traversed).length, 1);
  assert.equal(edge(state, "home", "overview").traversed, true);
  for (let i = 0; i < 1000; i++) visit(state, i % 2 ? "home" : "overview");
  assert.equal(state.trail.length, 30);
  assert.equal(sanitizeState(state).trail.length, 30);
});

test("URL resolution supports nested pages, HTTP and direct files", () => {
  for (const origin of ["https://example.test/demo/", "file:///tmp/demo/"]) {
    assert.equal(hrefToId("../../index.html", origin + "concepts/deep/state.html"), "home");
    assert.equal(hrefToId("../../overview.html?mode=graph#intro", origin + "concepts/deep/state.html"), "overview");
    assert.equal(hrefToId("../mechanics/loops.html", origin + "notes/future.html"), "mechanics/loops");
    assert.equal(hrefToId("mechanics/loops.html", origin), "mechanics/loops");
    assert.equal(hrefToId("./", origin + "index.html"), "home");
    assert.equal(hrefToId("../overview.html", origin + "index.html"), null);
    assert.equal(hrefToId("https://elsewhere.test/demo/index.html", origin + "index.html"), null);
    assert.equal(hrefToId("javascript:alert(1)", origin), null);
  }
  assert.equal(hrefToId(null), null);
  assert.equal(hrefToId("overview.html", "not a URL"), null);
});

test("rectangle sizes reflect bounded word-count tiers and scattering is deterministic", () => {
  const first = Graph.createLayout(), second = Graph.createLayout();
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((node) => node.height), [108, 140, 176, 108, 176]);
  assert.ok(first.every((node) => node.width === 76 && node.height > node.width));
  assert.equal(new Set(first.map((node) => node.x)).size, first.length);
  assert.equal(Graph.pageSize({ wordCount: 1000000 }).height, 176);
  first[0].x = 999;
  assert.equal(second[0].x, 0);
});

test("springs settle into finite separated positions and dragging can pin a node", () => {
  const nodes = Graph.createLayout();
  const original = structuredClone(nodes);
  let speed;
  for (let frame = 0; frame < 2500; frame++) speed = Graph.stepLayout(nodes);
  assert.ok(speed < 0.05, "layout settles: " + speed);
  assert.notDeepEqual(nodes, original);
  assert.ok(nodes.every((node) => [node.x, node.y, node.vx, node.vy].every(Number.isFinite)));
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    assert.ok(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 || Math.abs(a.y - b.y) >= (a.height + b.height) / 2, "page interiors must not overlap");
  }
  nodes[0].x = 550; nodes[0].y = -120;
  for (let frame = 0; frame < 100; frame++) Graph.stepLayout(nodes, nodes[0].id);
  assert.equal(nodes[0].x, 550); assert.equal(nodes[0].y, -120);
  assert.equal(nodes[0].vx, 0); assert.equal(nodes[0].vy, 0);
});

test("coincident coordinates recover and cameras fit node bounds", () => {
  const nodes = Graph.createLayout();
  nodes.forEach((node) => { node.x = 0; node.y = 0; });
  for (let frame = 0; frame < 100; frame++) Graph.stepLayout(nodes);
  assert.ok(nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
  assert.ok(new Set(nodes.map((node) => node.x)).size > 1);
  const bounds = Graph.layoutBounds(nodes), camera = Graph.fitCamera(nodes, 1024, 768);
  assert.ok(bounds.width * camera.zoom <= 1024 - 96 + 0.01);
  assert.ok(bounds.height * camera.zoom <= 768 - 96 + 0.01);
  assert.equal(camera.x, (bounds.minX + bounds.maxX) / 2);
  assert.equal(Graph.clampZoom(Infinity), 1);
  assert.equal(Graph.clampZoom(100), 12);
  assert.equal(Graph.clampZoom(-10), 0.035);
});

test("dense 36-page connectivity settles without overlapping page interiors", () => {
  const ids = Array.from({ length: 36 }, (_,index) => "page-" + index);
  const pages = ids.map((id, index) => ({
    id, href: id + ".html", wordCount: 180 + (index % 3) * 110,
    links: [ids[(index + 1) % 36], ids[(index + 5) % 36], ids[(index + 10) % 36], ids[0]].filter((target) => target !== id)
  }));
  const dense = Graph.createGraph({ version: 3, pages }), nodes = dense.createLayout();
  let motion;
  for (let frame = 0; frame < 4000; frame++) motion = dense.stepLayout(nodes);
  assert.ok(motion < 0.05, "dense graph settles: " + motion);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    assert.ok(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 || Math.abs(a.y - b.y) >= (a.height + b.height) / 2);
  }
});


// The 0.4 renderer changes exclusion size during semantic zoom. Every checked
// frame uses that same world-space rectangle, including direct pointer moves.
const separated = (nodes, context = "frame") => {
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j], sa = Graph.collisionSize(a), sb = Graph.collisionSize(b);
    assert.ok(Math.abs(a.x - b.x) >= (sa.width + sb.width) / 2 || Math.abs(a.y - b.y) >= (sa.height + sb.height) / 2, context + ": " + a.id + " / " + b.id);
  }
};
const graphOf = (adjacency) => Graph.createGraph({ version: 3, pages: Object.entries(adjacency).map(([id, links]) => ({ id, href: id + ".html", wordCount: 270, links })) });
const settle = (simulation, limit = 1200) => {
  let frames = 0;
  while (simulation.active && frames++ < limit) simulation.step();
  assert.equal(simulation.active, false, "simulation cools within " + limit + " frames");
};

test("persistent temperature cools, reheats on demand and stays active throughout a pin", () => {
  const nodes = Graph.createLayout(), simulation = Graph.createSimulation(nodes);
  assert.equal(simulation.density, 35);
  settle(simulation);
  assert.equal(simulation.alpha, 0);
  simulation.reheat();
  assert.ok(simulation.alpha >= 0.7 && simulation.active);
  for (let frame = 0; frame < 800; frame++) simulation.step(nodes[0].id);
  assert.ok(simulation.alpha >= 0.38 && simulation.active);
  const position = { x: nodes[0].x, y: nodes[0].y };
  simulation.step(nodes[0].id);
  assert.deepEqual({ x: nodes[0].x, y: nodes[0].y }, position);
  let firstReleaseMotion = simulation.step();
  assert.ok(firstReleaseMotion <= 18.001, "release has bounded, damped motion");
  settle(simulation);
  simulation.setDensity(90);
  assert.equal(simulation.density, 90);
  assert.ok(simulation.alpha >= 0.7 && simulation.active);
  simulation.setDensity(-10); assert.equal(simulation.density, 0);
  simulation.setDensity(400); assert.equal(simulation.density, 100);
  simulation.setDensity(NaN); assert.equal(simulation.density, 35);
});

test("unconnected nearby rectangles gently yield before touching", () => {
  const graph = graphOf({ a: [], b: [] }), nodes = graph.createLayout();
  Object.assign(nodes[0], { x: 0, y: 0 });
  Object.assign(nodes[1], { x: 140, y: 0 });
  const simulation = graph.createSimulation(nodes);
  const prior = nodes[1].x;
  assert.ok(prior > (nodes[0].width + nodes[1].width) / 2 + 50);
  simulation.step("a");
  assert.equal(nodes[0].x, 0);
  assert.ok(nodes[1].x > prior, "many-body and proximity repulsion act before contact");
  assert.ok(nodes[1].x - prior < 5, "initial yielding is gentle rather than projection");
  separated(nodes);
});

test("pinning and dragging a page transmits spring tension along its links", () => {
  const graph = graphOf({ a: ["b"], b: ["c"], c: [] }), nodes = graph.createLayout();
  nodes.forEach((node, index) => Object.assign(node, { x: (index - 1) * 460, y: 0 }));
  const simulation = graph.createSimulation(nodes);
  settle(simulation);
  const before = nodes.map((node) => node.x);
  nodes[0].x -= 800;
  const pin = nodes[0].x;
  for (let frame = 0; frame < 160; frame++) {
    simulation.step("a");
    assert.equal(nodes[0].x, pin);
    separated(nodes, "drag " + frame);
  }
  assert.ok(nodes[1].x < before[1] - 100, "immediate connected neighbor is pulled");
  assert.ok(nodes[2].x < before[2] - 50, "spring tension reaches the next neighbor");
  settle(simulation);
  assert.notEqual(nodes[0].x, pin, "releasing restores the page to the force system");
});

test("released dragging settles within 90 free frames, then stays exactly still", () => {
  const ids = Array.from({ length: 36 }, (_, index) => "node-" + index);
  const graph = graphOf(Object.fromEntries(ids.map((id, index) => [id, [ids[(index + 1) % ids.length], ids[(index + 7) % ids.length]]])));
  for (const density of [0, 35, 100]) {
    const nodes = graph.createLayout(), simulation = graph.createSimulation(nodes, { density });
    settle(simulation);
    const pinned = nodes[0];
    for (let frame = 0; frame < 30; frame++) {
      pinned.x += 16; pinned.y -= 7;
      simulation.reheat(); simulation.step(pinned.id);
      separated(nodes, "held drag " + density + "/" + frame);
    }
    // Both public paths are supported: an explicit pointer-release cool(),
    // and automatic release when the next step no longer carries the pin.
    if (density === 35) simulation.cool();
    let frames = 0;
    while (simulation.active && frames < 90) {
      simulation.step(); frames++;
      separated(nodes, "release " + density + "/" + frames);
    }
    assert.equal(simulation.active, false, "release must stop in 1.5 seconds at 60 fps");
    assert.ok(frames > 1, "release retains a short, damped settling tail");
    assert.equal(simulation.alpha, 0);
    assert.ok(nodes.every((node) => node.vx === 0 && node.vy === 0));
    const stopped = structuredClone(nodes);
    for (let frame = 0; frame < 300; frame++) assert.equal(simulation.step(), 0);
    assert.deepEqual(nodes, stopped, "sleep never moves even when a caller keeps requesting frames");
  }
});

test("reheats and density changes have finite tails; stop resolves overlaps and zeroes momentum", () => {
  const nodes = Graph.createLayout(), simulation = Graph.createSimulation(nodes);
  settle(simulation);
  for (const wake of [() => simulation.reheat(), () => simulation.setDensity(100), () => simulation.setDensity(0)]) {
    wake();
    assert.ok(simulation.active);
    for (let frame = 0; frame < 90; frame++) { simulation.step(); separated(nodes, "short reheat " + frame); }
    assert.equal(simulation.active, false);
    assert.ok(nodes.every((node) => node.vx === 0 && node.vy === 0));
  }
  nodes.forEach((node) => Object.assign(node, { x: 0, y: 0, vx: 12, vy: -8 }));
  simulation.reheat(); simulation.stop();
  separated(nodes, "explicit stop");
  assert.equal(simulation.active, false);
  assert.ok(nodes.every((node) => node.vx === 0 && node.vy === 0));
  const stopped = structuredClone(nodes);
  simulation.cool(); simulation.step();
  assert.deepEqual(nodes, stopped, "cool does not wake a stopped layout");
});

test("release preserves momentum, eases its final motion and ignores repeated cooldown requests", () => {
  const graph = graphOf({ a: ["b"], b: [] });
  const makeHeld = () => {
    const nodes = graph.createLayout(), simulation = graph.createSimulation(nodes);
    settle(simulation);
    Object.assign(nodes[0], { x: -500, y: 0, vx: 0, vy: 0 });
    Object.assign(nodes[1], { x: 500, y: 0, vx: 0, vy: 0 });
    simulation.reheat();
    for (let frame = 0; frame < 5; frame++) simulation.step("a");
    return { nodes, simulation };
  };
  const held = makeHeld(), released = makeHeld();
  const before = structuredClone(released.nodes), temperature = released.simulation.alpha;
  assert.ok(Math.abs(before[1].vx) > 1, "neighbor has real momentum before release");
  released.simulation.cool();
  assert.deepEqual(released.nodes, before, "cool does not cut velocity or relocate a page");
  assert.equal(released.simulation.alpha, temperature, "release has no instantaneous force drop");
  const motions = [released.simulation.step()];
  held.simulation.step("a");
  assert.deepEqual(released.nodes[1], held.nodes[1], "the first free frame preserves the neighbor's held motion");
  const alphas = [temperature, released.simulation.alpha];
  while (released.simulation.active && motions.length < 90) {
    // A wheel burst may request cooling every frame; it cannot extend or
    // truncate the release already in progress.
    const prior = released.simulation.alpha;
    released.simulation.cool();
    assert.equal(released.simulation.alpha, prior);
    motions.push(released.simulation.step());
    alphas.push(released.simulation.alpha);
    separated(released.nodes, "eased release " + motions.length);
  }
  assert.ok(motions.length >= 60 && motions.length <= 90, "a finite 1–1.5 second release at 60 fps");
  assert.equal(released.simulation.active, false);
  assert.ok(alphas.every((alpha, index) => !index || alpha <= alphas[index - 1]), "temperature eases monotonically");
  assert.ok(motions.slice(20, 40).some(motion => motion > 0.001), "the tail retains perceptible settling after its opening frames");
  assert.ok(Math.max(...motions.slice(-6)) < 0.001, "the last frames are already effectively still before stop");
  const stopped = structuredClone(released.nodes);
  for (let frame = 0; frame < 100; frame++) { released.simulation.cool(); assert.equal(released.simulation.step(), 0); }
  assert.deepEqual(released.nodes, stopped, "the eased release ends in exact sleep");
});

test("density continuously controls constellation spacing without changing topology", () => {
  const ids = Array.from({ length: 16 }, (_, index) => "node-" + index);
  const graph = graphOf(Object.fromEntries(ids.map((id, index) => [id, [ids[(index + 1) % ids.length], ids[(index + 4) % ids.length]]])));
  const results = [0, 35, 70, 100].map((density) => {
    const nodes = graph.createLayout(), simulation = graph.createSimulation(nodes, { density });
    settle(simulation); separated(nodes, "density " + density);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const lengths = ids.flatMap((id) => graph.LINKS[id].map((target) => Math.hypot(byId.get(id).x - byId.get(target).x, byId.get(id).y - byId.get(target).y)));
    return lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  });
  for (let index = 1; index < results.length; index++) assert.ok(results[index] < results[index - 1] * 0.96, "higher density is visibly tighter: " + results);
});

test("dense coincident piles and rapid pointer teleports never overlap after a frame", () => {
  const ids = Array.from({ length: 50 }, (_, index) => "node-" + index);
  const graph = graphOf(Object.fromEntries(ids.map((id, index) => [id, [ids[(index + 1) % ids.length], ids[(index + 7) % ids.length], ids[0]].filter((target) => target !== id)])));
  for (const density of [0, 35, 100]) {
    const nodes = graph.createLayout();
    nodes.forEach((node) => Object.assign(node, { x: 0, y: 0 }));
    const simulation = graph.createSimulation(nodes, { density });
    separated(nodes, "coincident construction " + density);
    for (let frame = 0; frame < 120; frame++) {
      const pinned = nodes[frame % nodes.length], target = nodes[(frame + 11) % nodes.length];
      pinned.x = target.x + Math.sin(frame) * 5;
      pinned.y = target.y + Math.cos(frame) * 5;
      const pin = { x: pinned.x, y: pinned.y };
      simulation.resolve(pinned.id);
      assert.deepEqual({ x: pinned.x, y: pinned.y }, pin);
      separated(nodes, "pointer resolve " + density + " / " + frame);
      simulation.step(pinned.id);
      assert.deepEqual({ x: pinned.x, y: pinned.y }, pin);
      separated(nodes, "pointer integration " + density + " / " + frame);
    }
    assert.ok(nodes.every((node) => [node.x, node.y, node.vx, node.vy].every(Number.isFinite)));
  }
});

test("semantic page expansion is excluded at its rendered size on every frame", () => {
  const nodes = Graph.createLayout(), simulation = Graph.createSimulation(nodes);
  settle(simulation);
  const selected = nodes[1], initial = { x: selected.x, y: selected.y };
  for (let frame = 0; frame < 80; frame++) {
    selected.collisionWidth = selected.width + frame * 22;
    selected.collisionHeight = selected.height + frame * 25;
    simulation.resolve(selected.id);
    separated(nodes, "semantic expansion " + frame);
    assert.deepEqual({ x: selected.x, y: selected.y }, initial);
    simulation.step(selected.id);
    separated(nodes, "semantic integration " + frame);
  }
  delete selected.collisionWidth; delete selected.collisionHeight;
  simulation.reheat();
  settle(simulation);
  separated(nodes, "semantic contraction settled");
});

// hx generated 261026-141314-003 current — clean and legacy link identity.
test('clean and legacy links share page identity under root, mounted HTTP, and file URLs', () => {
  const clean = Graph.createGraph({version:3,pages:[
    {id:'home',href:'./',links:['overview']}, {id:'overview',href:'overview',links:['home','nested/topic']}, {id:'nested/topic',href:'nested--topic',links:['home']}
  ]});
  for (const root of ['https://example.test/','https://example.test/barthes/','file:///tmp/site/']) for (const current of ['index.html','overview','overview.html','nested--topic','nested--topic.html']) {
    for(const href of ['overview','overview.html','overview#detail','overview.html?x=1#detail'])assert.equal(clean.hrefToId(href,root+current),'overview');
    for(const href of ['./','index','index.html'])assert.equal(clean.hrefToId(href,root+current),'home');
    assert.equal(clean.hrefToId('nested--topic',root+current),'nested/topic');
    assert.equal(clean.hrefToId('nested--topic.html',root+current),'nested/topic');
    assert.equal(clean.hrefToId('../outside/overview',root+current),null);
    assert.equal(clean.hrefToId('https://elsewhere.test/overview',root+current),null);
  }
});
