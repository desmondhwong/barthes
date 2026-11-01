// Adapted from Sitemap 0.8; original implementation by Codex / OpenAI / gpt-6.


  const READ_ZOOM = 8;
  const MIN_ZOOM = 0.04;
  const ZOOM_FACTOR = 1.2;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
  const smooth = (low, high, value) => {
    const t = clamp((value - low) / (high - low), 0, 1);
    return t * t * (3 - 2 * t);
  };

  function clampZoom(value) {
    return Number.isFinite(value) ? clamp(value, MIN_ZOOM, READ_ZOOM) : READ_ZOOM;
  }

  const levels = [READ_ZOOM];
  while (levels[0] / ZOOM_FACTOR > MIN_ZOOM) levels.unshift(levels[0] / ZOOM_FACTOR);
  levels.unshift(MIN_ZOOM);
  const zoomLevels = Object.freeze(levels);

  // Near a page, its layout and viewport remain unchanged: only this single
  // transform shrinks the literal reading sheet. Text and its measured line
  // boxes share the same sheet dimensions. Only when both are invisible does
  // the outline change shape toward the bounded graph rectangle.
  function geometry(viewport = {}, node = {}, zoom = READ_ZOOM) {
    const width = positive(viewport && viewport.width, 1024);
    const height = positive(viewport && viewport.height, 768);
    const gap = width < 640 ? 12 : 28;
    const readingWidth = Math.max(1, width - gap * 2);
    const readingHeight = Math.max(1, height - 32);
    const z = clampZoom(zoom);
    const fullWorldWidth = readingWidth / READ_ZOOM;
    const fullWorldHeight = readingHeight / READ_ZOOM;
    const abstractWidth = positive(node && node.width, 76);
    const abstractHeight = positive(node && node.height, 140);
    const pageShape = smooth(0.65, 1.6, z);
    const worldWidth = abstractWidth + (fullWorldWidth - abstractWidth) * pageShape;
    const worldHeight = abstractHeight + (fullWorldHeight - abstractHeight) * pageShape;

    const textOpacity = smooth(3.2, 4.8, z);
    const linesOpacity = (1 - textOpacity) * smooth(1.8, 3.2, z);
    const remaining = 1 - textOpacity - linesOpacity;
    const abstractOpacity = remaining * (1 - smooth(0.65, 1.3, z)) * smooth(0.28, 0.6, z);
    const outlineOpacity = remaining - abstractOpacity;
    const interactive = z >= 7.95;
    const level = interactive ? "reading" : z >= 4 ? "page" : z >= 2.5 ? "lines" : z >= 0.975 ? "outline" : "abstract";

    return {
      readingWidth, readingHeight, worldWidth, worldHeight,
      scale: z / READ_ZOOM,
      textOpacity, linesOpacity, outlineOpacity, abstractOpacity,
      level, interactive
    };
  }

  // hx generated Sitemap 0.6: interpolate the selected page's screen position,
  // not independent world axes that swing it away during a large zoom.
  function cameraAt(from, to, anchor, progress) {
    const t = clamp(progress, 0, 1), ease = t * t * (3 - 2 * t);
    if (t === 0) return { ...from };
    if (t === 1) return { ...to };
    const zoom = from.zoom * Math.pow(to.zoom / from.zoom, ease);
    const result = { zoom };
    for (const axis of ["x", "y"]) {
      const start = (anchor[axis] - from[axis]) * from.zoom;
      const end = (anchor[axis] - to[axis]) * to.zoom;
      result[axis] = anchor[axis] - (start + (end - start) * ease) / zoom;
    }
    return result;
  }
  const api = Object.freeze({ READ_ZOOM, MIN_ZOOM, ZOOM_FACTOR, zoomLevels, clampZoom, geometry, cameraAt });
export default api;
