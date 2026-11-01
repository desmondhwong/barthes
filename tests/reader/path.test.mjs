/* > hx generated 260916-172018-004 fresh — breadcrumb branch and recovery checks, Codex / OpenAI / gpt-6. */
"use strict";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import Path from "../../src/reader/path.mjs";
const known = ["home", "overview", "mechanics/loops", "concepts/deep/state"];

test("fixed home stays outside the path and selecting an earlier page preserves its future", () => {
  const path = Path.create("home");
  for (const id of known.slice(1)) Path.follow(path, id);
  assert.deepEqual(path, { items: known.slice(1), cursor: 2 });
  Path.select(path, 0);
  assert.equal(Path.current(path), "overview");
  assert.deepEqual(path.items, known.slice(1));
  Path.select(path, 2);
  assert.equal(Path.current(path), "concepts/deep/state");
  Path.select(path, -1);
  assert.equal(Path.current(path), "home");
  assert.deepEqual(path.items, known.slice(1));
});

test("following a new link after moving back replaces only the future branch", () => {
  const path = Path.create("home");
  for (const id of known.slice(1)) Path.follow(path, id);
  Path.select(path, 0);
  Path.follow(path, "home");
  assert.deepEqual(path, { items: ["overview", "home"], cursor: 1 });
  Path.select(path, -1);
  Path.follow(path, "mechanics/loops");
  assert.deepEqual(path, { items: ["mechanics/loops"], cursor: 0 });
});

test("repeated pages and an explicitly followed home link remain distinguishable route stops", () => {
  const path = Path.create("home");
  for (const id of ["overview", "home", "overview", "overview"]) Path.follow(path, id);
  assert.deepEqual(path.items, ["overview", "home", "overview", "overview"]);
  Path.select(path, 1);
  assert.equal(Path.current(path), "home");
  assert.equal(path.cursor, 1);
  const before = structuredClone(path);
  for (const index of [-2, 4, 0.5, NaN, "0"]) Path.select(path, index);
  Path.follow(path, "");
  assert.deepEqual(path, before);
});

test("clear retains the current page plus implicit fixed home", () => {
  assert.deepEqual(Path.clear("overview"), { items: ["overview"], cursor: 0 });
  assert.deepEqual(Path.clear("home"), { items: [], cursor: -1 });
  assert.deepEqual(Path.create("start", "start"), { items: [], cursor: -1 });
  assert.equal(Path.current(Path.create("start", "start"), "start"), "start");
});

test("recoverable local state preserves a valid cursor or resets wholly to its current page", () => {
  const raw = { items: ["overview", "mechanics/loops", "home"], cursor: 0 };
  for (const ids of [known, new Set(known), Object.fromEntries(known.map((id) => [id, {}]))]) {
    const restored = Path.sanitize(raw, "overview", ids);
    assert.deepEqual(restored, raw);
    restored.items.push("overview");
    assert.equal(raw.items.length, 3);
  }
  const bad = [null, [], false, {}, { items: ["constructor"], cursor: 0 }, { items: ["overview"], cursor: 1 }, { items: ["overview"], cursor: -2 }, { items: ["overview"], cursor: "0" }, { items: ["home"], cursor: 0 }, { items: Array(Path.MAX_PATH_ITEMS + 1).fill("overview"), cursor: 0 }];
  for (const value of bad) assert.deepEqual(Path.sanitize(value, "overview", known), Path.create("overview"));
  const sparse = { items: ["overview", , "home"], cursor: 0 };
  assert.deepEqual(Path.sanitize(sparse, "overview", known), Path.create("overview"));
  assert.deepEqual(Path.sanitize({ items: ["overview"], cursor: -1 }, "home", known), { items: ["overview"], cursor: -1 });
});

test("extreme routes stay bounded while retaining current position and a usable fixed home", () => {
  const path = Path.create("home");
  for (let i = 0; i < Path.MAX_PATH_ITEMS + 20; i++) Path.follow(path, "page-" + i);
  assert.equal(path.items.length, Path.MAX_PATH_ITEMS);
  assert.equal(path.items[0], "page-20");
  assert.equal(Path.current(path), "page-" + (Path.MAX_PATH_ITEMS + 19));
  Path.select(path, -1);
  assert.equal(Path.current(path), "home");
});
