/* > hx generated 260916-172018-005 fresh — version 4 portable state validation checks, Codex / OpenAI / gpt-6. */
"use strict";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import Content from "./content.mjs";
import createGraph from "../../src/reader/graph.mjs";
const Graph = createGraph(Content);
import Path from "../../src/reader/path.mjs";
import createWorkspace from "../../src/reader/workspace.mjs";
const Workspace = createWorkspace(Graph);
const prefs = (values = {}) => ({ ...Workspace.defaultPreferences(), ...values });
function journey() {
  const graph = Graph.visit(Graph.newState(), "home");
  const path = Path.create("home");
  let current = "home";
  for (const next of ["overview", "mechanics/loops", "concepts/deep/state", "overview", "home"]) {
    Graph.follow(graph, current, next); Graph.visit(graph, next); Path.follow(path, next); current = next;
  }
  return Workspace.createSnapshot(graph, current, prefs({ theme: "dark", view: "zen", density: 71, chromeHidden: true }), { name: "Saved view", preferences: prefs({ view: "reduced", mapOpen: true, density: 20 }) }, path);
}

test("a directed journey and independent saved view round-trip as detached data", () => {
  const source = journey();
  const restored = Workspace.parseSnapshot(JSON.stringify(source, null, 2));
  assert.deepEqual(restored, source);
  assert.equal(restored.version, 4);
  assert.equal(restored.graph.visible.length, Content.pages.length);
  assert.equal(restored.graph.edges.find((edge) => edge.from === "home" && edge.to === "overview").traversed, true);
  assert.equal(restored.graph.edges.find((edge) => edge.from === "notes/future" && edge.to === "home").traversed, false);
  restored.graph.visited.push("notes/future");
  restored.preferences.theme = "light";
  assert.equal(source.graph.visited.includes("notes/future"), false);
  assert.equal(source.preferences.theme, "dark");
  restored.path.items.push("home");
  assert.equal(source.path.items.length, 5);
});

test("all view arrangements export without changing the caller", () => {
  for (const theme of ["light", "dark"]) for (const view of ["normal", "reduced", "zen"]) for (const mapOpen of [true, false]) {
    const graph = Graph.visit(Graph.newState(), "home"); graph.open = mapOpen;
    const preferences = prefs({ theme, view, mapOpen });
    const exported = Workspace.createSnapshot(graph, "home", preferences);
    assert.deepEqual(Workspace.parseSnapshot(JSON.stringify(exported)), exported);
    exported.graph.edges[0].traversed = true;
    assert.equal(graph.edges[0].traversed, false);
    assert.deepEqual(preferences, prefs({ theme, view, mapOpen }));
  }
});

test("local preferences recover field by field and ignore inherited fields", () => {
  const defaults = prefs();
  for (const value of [null, [], false, "dark", 42, { theme: "neon", view: "hidden", mapOpen: 0 }]) assert.deepEqual(Workspace.normalizePreferences(value), defaults);
  assert.deepEqual(Workspace.normalizePreferences({ theme: "dark", view: "reduced", mapOpen: true, density: 100, chromeHidden: true, extra: "ignored" }), prefs({ theme: "dark", view: "reduced", mapOpen: true, density: 100, chromeHidden: true }));
  assert.deepEqual(Workspace.normalizePreferences(Object.create({ theme: "dark", view: "zen", mapOpen: true, density: 0, chromeHidden: true })), defaults);
  for (const density of [-1, 101, 0.5, "35", NaN, Infinity]) assert.deepEqual(Workspace.normalizePreferences({ density, chromeHidden: "true" }), defaults);
  assert.equal(Workspace.normalizePreferences({ density: 0 }).density, 0);
});

test("malformed imports reject wholly and preserve live state", () => {
  const live = journey(), before = structuredClone(live);
  const invalid = [
    (s) => { s.version = 1; }, (s) => { s.format = "other"; }, (s) => { s.graph.version = "3"; },
    (s) => { s.current = "constructor"; }, (s) => { s.current = "notes/future"; },
    (s) => { s.graph.visible.pop(); }, (s) => { s.graph.trail.pop(); },
    (s) => { s.graph.visited.push("__proto__"); }, (s) => { s.graph.visited.push("home"); },
    (s) => { s.graph.visible[1] = "home"; }, (s) => { s.graph.trail = []; },
    (s) => { s.graph.trail = ["home", "home"]; }, (s) => { s.graph.trail = ["notes/future", "home"]; },
    (s) => { s.graph.edges[0] = { from: "home", to: "notes/future", traversed: true }; },
    (s) => { s.graph.edges.find((e) => e.from === "notes/future").traversed = true; },
    (s) => { s.graph.edges[1] = { ...s.graph.edges[0] }; }, (s) => { s.graph.edges.pop(); },
    (s) => { s.graph.edges[0].traversed = "true"; }, (s) => { s.graph.edges[0].onload = "payload"; },
    (s) => { s.graph.open = 0; }, (s) => { s.graph.open = true; },
    (s) => { s.preferences.theme = "system"; }, (s) => { s.preferences.view = "hidden"; },
    (s) => { s.preferences.mapOpen = "false"; }, (s) => { s.profile.name = "Other"; },
    (s) => { s.preferences.density = -1; }, (s) => { s.preferences.density = 101; }, (s) => { s.preferences.density = 35.5; },
    (s) => { s.preferences.density = "35"; }, (s) => { s.preferences.chromeHidden = 1; },
    (s) => { delete s.preferences.chromeHidden; }, (s) => { s.profile.preferences.density = "20"; },
    (s) => { s.profile.preferences.view = "other"; }, (s) => { s.profile.graph = s.graph; },
    (s) => { delete s.path; }, (s) => { s.path.items.push("notes/future"); }, (s) => { s.path.items[0] = "constructor"; },
    (s) => { s.path.cursor = 1; }, (s) => { s.path.cursor = -2; }, (s) => { s.path.cursor = "4"; },
    (s) => { s.path.cursor = 5; }, (s) => { s.path.items = []; }, (s) => { s.path.extra = true; },
    (s) => { s.preferences = {}; }, (s) => { delete s.profile; }, (s) => { s.extra = true; }
  ];
  for (const alter of invalid) {
    const malformed = structuredClone(live); alter(malformed);
    assert.throws(() => Workspace.parseSnapshot(JSON.stringify(malformed)), /Invalid snapshot/);
    assert.deepEqual(live, before);
  }
  for (const key of ["visited", "visible", "edges", "trail"]) {
    const malformed = structuredClone(live.graph); delete malformed[key][0];
    assert.throws(() => Workspace.createSnapshot(malformed, "home", live.preferences, live.profile), /Invalid snapshot/);
  }
});

test("parser rejects invalid JSON, oversized UTF-8 and obsolete formats clearly", () => {
  for (const text of [null, {}, "", "{", "null", "[]", "true", '{"__proto__":{"polluted":true}}']) assert.throws(() => Workspace.parseSnapshot(text), /Invalid snapshot/);
  assert.equal({}.polluted, undefined);
  assert.throws(() => Workspace.parseSnapshot(" ".repeat(Workspace.MAX_SNAPSHOT_BYTES + 1)), /256 KiB/);
  assert.throws(() => Workspace.parseSnapshot('"' + "é".repeat(140000) + '"'), /256 KiB/);
  const obsolete = journey(); obsolete.version = 1;
  assert.throws(() => Workspace.parseSnapshot(JSON.stringify(obsolete)), /supported exploration versions/);
  for (const [key, length, item] of [["visited", 6, "home"], ["visible", 6, "home"], ["trail", 31, "home"], ["edges", 100, {}]]) {
    const snapshot = journey(); snapshot.graph[key] = Array(length).fill(item);
    assert.throws(() => Workspace.parseSnapshot(JSON.stringify(snapshot)), /at most/);
  }
  const tooLong = journey(); tooLong.path.items = Array(Path.MAX_PATH_ITEMS + 1).fill("home"); tooLong.path.cursor = 0;
  assert.throws(() => Workspace.parseSnapshot(JSON.stringify(tooLong)), /at most 512/);
});

test("portable paths preserve future stops, repeated pages and selection of fixed home", () => {
  const source = journey();
  for (const cursor of [-1, 0, 2, 4]) {
    const graph = Graph.sanitizeState(source.graph);
    const path = structuredClone(source.path); Path.select(path, cursor);
    const current = Path.current(path); Graph.visit(graph, current);
    const snapshot = Workspace.createSnapshot(graph, current, source.preferences, source.profile, path);
    const result = Workspace.parseSnapshot(JSON.stringify(snapshot));
    assert.deepEqual(result.path, path);
    assert.deepEqual(result.path.items, source.path.items);
    assert.equal(result.current, current);
  }
});

test("version 3 exports migrate with a current-only path and independent default controls", () => {
  const source = journey();
  const legacy = structuredClone(source);
  legacy.version = 3; delete legacy.path;
  delete legacy.preferences.density; delete legacy.preferences.chromeHidden;
  delete legacy.profile.preferences.density; delete legacy.profile.preferences.chromeHidden;
  const before = structuredClone(legacy);
  const migrated = Workspace.parseSnapshot(JSON.stringify(legacy));
  assert.equal(migrated.version, 4);
  assert.deepEqual(migrated.path, { items: [], cursor: -1 });
  assert.deepEqual(migrated.graph, source.graph);
  assert.deepEqual(migrated.preferences, prefs({ theme: "dark", view: "zen" }));
  assert.deepEqual(migrated.profile.preferences, prefs({ view: "reduced", mapOpen: true }));
  assert.deepEqual(legacy, before);
  legacy.current = "overview"; Graph.visit(legacy.graph, "overview");
  assert.deepEqual(Workspace.parseSnapshot(JSON.stringify(legacy)).path, { items: ["overview"], cursor: 0 });
  legacy.preferences.density = 1;
  assert.throws(() => Workspace.parseSnapshot(JSON.stringify(legacy)), /missing or unsupported fields/);
});
