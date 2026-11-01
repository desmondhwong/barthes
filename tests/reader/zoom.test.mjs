/* > hx generated 260916-172241-002 fresh — semantic zoom continuity and geometry checks, Codex / OpenAI / gpt-6. */
"use strict";
import test from "node:test";
import assert from "node:assert/strict";
import Zoom from "../../src/reader/zoom.mjs";

const viewport = { width: 1440, height: 900 };
const node = { width: 76, height: 140 };
const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test("reading sheet fills the stage with visible space around every edge", () => {
  const desktop = Zoom.geometry(viewport, node, Zoom.READ_ZOOM);
  assert.equal(desktop.readingWidth, 1384);
  assert.equal(desktop.readingHeight, 868);
  assert.equal(desktop.worldWidth * Zoom.READ_ZOOM, desktop.readingWidth);
  assert.equal(desktop.worldHeight * Zoom.READ_ZOOM, desktop.readingHeight);
  assert.equal(desktop.scale, 1);
  assert.equal(desktop.textOpacity, 1);
  assert.equal(desktop.interactive, true);
  assert.equal(desktop.level, "reading");
  const phone = Zoom.geometry({ width: 390, height: 780 }, node, 8);
  assert.equal(phone.readingWidth, 366);
  assert.equal(phone.readingHeight, 748);
});

test("the literal page and measured line composition scale proportionally before the shape changes", () => {
  const full = Zoom.geometry(viewport, node, 8);
  for (const z of [7.9, 6.5, 4.8, 4, 3.2, 2.5, 2, 1.8, 1.6]) {
    const actual = Zoom.geometry(viewport, node, z);
    near(actual.worldWidth, full.worldWidth);
    near(actual.worldHeight, full.worldHeight);
    near(actual.readingWidth, full.readingWidth);
    near(actual.readingHeight, full.readingHeight);
    near(actual.readingWidth * actual.scale, actual.worldWidth * z);
    near(actual.readingHeight * actual.scale, actual.worldHeight * z);
    assert.equal(actual.interactive, false);
  }
  assert.equal(Zoom.geometry(viewport, node, 1.6).linesOpacity, 0);
  assert.equal(Zoom.geometry(viewport, node, 1.6).textOpacity, 0);
});

test("semantic layers pass through literal text, matching lines, outline and abstract rectangle", () => {
  const layer = (z) => Zoom.geometry(viewport, node, z);
  assert.equal(layer(6).textOpacity, 1);
  near(layer(4).textOpacity, 0.5);
  near(layer(4).linesOpacity, 0.5);
  assert.equal(layer(3.2).linesOpacity, 1);
  assert.equal(layer(1.8).outlineOpacity, 1);
  assert.equal(layer(1.3).outlineOpacity, 1);
  assert.equal(layer(0.65).abstractOpacity, 1);
  const tags = [8, 6, 3.2, 1.8, 0.5].map((z) => layer(z).level);
  assert.deepEqual(tags, ["reading", "page", "lines", "outline", "abstract"]);
});

test("geometry and crossfades remain continuous at every transition boundary", () => {
  for (const boundary of [0.28, 0.6, 0.65, 0.975, 1.3, 1.6, 1.8, 2.5, 3.2, 4, 4.8, 7.95]) {
    const below = Zoom.geometry(viewport, node, boundary - 1e-7);
    const above = Zoom.geometry(viewport, node, boundary + 1e-7);
    for (const key of ["readingWidth", "readingHeight", "worldWidth", "worldHeight", "scale", "textOpacity", "linesOpacity", "outlineOpacity", "abstractOpacity"]) near(below[key], above[key], 0.0001);
  }
  for (let z = Zoom.MIN_ZOOM; z <= 8; z += 0.0037) {
    const values = Zoom.geometry(viewport, node, z);
    const opacities = [values.textOpacity, values.linesOpacity, values.outlineOpacity, values.abstractOpacity];
    assert.ok(opacities.every((opacity) => Number.isFinite(opacity) && opacity >= 0 && opacity <= 1));
    near(opacities.reduce((sum, opacity) => sum + opacity, 0), 1);
  }
});

test("far rectangles retain their bounded page-length tiers independently of the viewport", () => {
  for (const height of [108, 140, 176]) {
    for (const size of [{ width: 320, height: 568 }, viewport, { width: 7680, height: 4320 }]) {
      for (const z of [Zoom.MIN_ZOOM, 0.2, 0.65]) {
        const actual = Zoom.geometry(size, { width: 76, height }, z);
        assert.equal(actual.worldWidth, 76);
        assert.equal(actual.worldHeight, height);
        assert.equal(actual.abstractOpacity, z <= 0.28 ? 0 : 1);
      }
    }
  }
});

test("small, large and unavailable stage measurements produce finite positive geometry", () => {
  for (const size of [null, {}, { width: 1, height: 1 }, { width: 320, height: 160 }, { width: 8192, height: 8192 }, { width: NaN, height: Infinity }]) {
    for (const z of [Zoom.MIN_ZOOM, 1, 3.2, 8, NaN]) {
      const actual = Zoom.geometry(size, null, z);
      for (const key of ["readingWidth", "readingHeight", "worldWidth", "worldHeight", "scale"]) assert.ok(Number.isFinite(actual[key]) && actual[key] > 0);
    }
  }
  const input = structuredClone({ viewport, node });
  Zoom.geometry(input.viewport, input.node, 1);
  assert.deepEqual(input, { viewport, node });
});

test("zoom steps give gradual control through every semantic level and clamp at the endpoints", () => {
  assert.equal(Zoom.zoomLevels[0], Zoom.MIN_ZOOM);
  assert.equal(Zoom.zoomLevels.at(-1), Zoom.READ_ZOOM);
  assert.ok(Object.isFrozen(Zoom.zoomLevels));
  for (let index = 1; index < Zoom.zoomLevels.length; index++) {
    assert.ok(Zoom.zoomLevels[index] > Zoom.zoomLevels[index - 1]);
    assert.ok(Zoom.zoomLevels[index] / Zoom.zoomLevels[index - 1] <= 1.20000000001);
  }
  assert.equal(Zoom.clampZoom(-1), Zoom.MIN_ZOOM);
  assert.equal(Zoom.clampZoom(100), Zoom.READ_ZOOM);
  assert.equal(Zoom.clampZoom(NaN), Zoom.READ_ZOOM);
  assert.equal(Zoom.clampZoom(2), 2);
  assert.equal(Zoom.geometry(viewport, node, 7.949).interactive, false);
  assert.equal(Zoom.geometry(viewport, node, 7.95).interactive, true);
});

// hx generated Sitemap 0.6 direct camera and distant icon regressions.
test("distant graph icons have no interior text or line decoration", () => {
  for (const z of [0.04, 0.1, 0.2, 0.28]) {
    const geo = Zoom.geometry(viewport, node, z);
    assert.equal(geo.textOpacity + geo.linesOpacity + geo.abstractOpacity, 0);
    assert.equal(geo.outlineOpacity, 1);
  }
});
test("selected page follows a direct screen path during large zooms without a center jump", () => {
  const anchor = {x:1200,y:-740};
  for (const [from,to] of [[{x:0,y:0,zoom:.2},{...anchor,zoom:8}],[{...anchor,zoom:8},{...anchor,zoom:.12}],[{x:50,y:80,zoom:4},{x:200,y:300,zoom:.25}]]) {
    assert.deepEqual(Zoom.cameraAt(from,to,anchor,0),from);
    assert.deepEqual(Zoom.cameraAt(from,to,anchor,1),to);
    for(let i=0;i<=100;i++) {
      const camera=Zoom.cameraAt(from,to,anchor,i/100);
      assert.ok(camera.zoom>=Math.min(from.zoom,to.zoom)&&camera.zoom<=Math.max(from.zoom,to.zoom));
      for(const axis of ['x','y']) {
        const start=(anchor[axis]-from[axis])*from.zoom,end=(anchor[axis]-to[axis])*to.zoom,actual=(anchor[axis]-camera[axis])*camera.zoom;
        assert.ok(actual>=Math.min(start,end)-1e-8&&actual<=Math.max(start,end)+1e-8,'screen anchor stays on its direct segment');
      }
    }
  }
});
