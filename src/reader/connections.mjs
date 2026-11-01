// Adapted from Sitemap 0.8; original implementation by Codex / OpenAI / gpt-6.

  const EPSILON = 1e-9;
  const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
  const validRect = rect => finitePoint(rect) && Number.isFinite(rect.w) && rect.w > 0 && Number.isFinite(rect.h) && rect.h > 0 && rect.hidden !== true;
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const rectAt = (screen, id) => screen instanceof Map ? screen.get(id) : screen && Object.hasOwn(screen, id) ? screen[id] : null;
  function contains(rect, point) {
    return !!(validRect(rect) && finitePoint(point) && Math.abs(point.x - rect.x) <= rect.w / 2 && Math.abs(point.y - rect.y) <= rect.h / 2);
  }
  function clipped(left, right) {
    const dx = right.x - left.x, dy = right.y - left.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) <= EPSILON) return null;
    const boundary = rect => Math.min(dx ? rect.w / 2 / Math.abs(dx) : Infinity, dy ? rect.h / 2 / Math.abs(dy) : Infinity);
    const start = boundary(left), end = 1 - boundary(right);
    // Overlapping or touching blocks have no exposed connection between them.
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start <= EPSILON) return null;
    const a = { x: left.x + dx * start, y: left.y + dy * start };
    const b = { x: left.x + dx * end, y: left.y + dy * end };
    return finitePoint(a) && finitePoint(b) ? { a, b } : null;
  }
  function segments(edges, screen, { current = null, local = false } = {}) {
    const groups = new Map();
    for (const edge of Array.isArray(edges) ? edges : []) {
      if (!edge || typeof edge.from !== 'string' || !edge.from || typeof edge.to !== 'string' || !edge.to || edge.from === edge.to) continue;
      if (local && edge.from !== current && edge.to !== current) continue;
      const fromRect = rectAt(screen, edge.from), toRect = rectAt(screen, edge.to);
      if (!validRect(fromRect) || !validRect(toRect)) continue;
      const [from, to] = [edge.from, edge.to].sort(compare), key = JSON.stringify([from, to]);
      if (!groups.has(key)) {
        const rects = [from, to].map(id => { const { x, y, w, h } = rectAt(screen, id); return { x, y, w, h }; });
        const line = clipped(...rects);
        if (!line) continue;
        groups.set(key, { key, from, to, ...line, rects, edges: [] , traversed: false });
      }
      const segment = groups.get(key), existing = segment.edges.find(item => item.from === edge.from && item.to === edge.to);
      if (existing) existing.traversed ||= edge.traversed === true;
      else segment.edges.push({ from: edge.from, to: edge.to, traversed: edge.traversed === true });
      segment.traversed ||= edge.traversed === true;
    }
    const result = [...groups.values()].sort((a, b) => compare(a.key, b.key));
    for (const segment of result) segment.edges.sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to));
    return result;
  }
  function distanceToSegment(segment, point) {
    if (!finitePoint(segment?.a) || !finitePoint(segment?.b)) return null;
    const dx = segment.b.x - segment.a.x, dy = segment.b.y - segment.a.y, length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || length <= EPSILON) return null;
    const t = Math.max(0, Math.min(1, ((point.x - segment.a.x) * (dx / length) + (point.y - segment.a.y) * (dy / length)) / length));
    const distance = Math.hypot(point.x - (segment.a.x + dx * t), point.y - (segment.a.y + dy * t));
    return Number.isFinite(t) && Number.isFinite(distance) ? { t, distance } : null;
  }
  function pick(list, point, { tolerance = 7, current = null, rectangles = [] } = {}) {
    if (!Array.isArray(list) || !finitePoint(point)) return null;
    const extra = rectangles instanceof Map ? [...rectangles.values()] : Array.isArray(rectangles) ? rectangles : rectangles && typeof rectangles === 'object' ? Object.values(rectangles) : [];
    // Nodes own their hit area. Extra rectangles cover isolated visible nodes
    // through which another connection may pass; callers may also gate DOM hits.
    if (extra.some(rect => contains(rect, point)) || list.some(segment => Array.isArray(segment?.rects) && segment.rects.some(rect => contains(rect, point)))) return null;
    const limit = Number.isFinite(tolerance) ? Math.max(0, tolerance) : 7;
    let best = null;
    for (const segment of list) {
      if (!Array.isArray(segment?.edges) || !segment.edges.length) continue;
      const hit = distanceToSegment(segment, point);
      if (!hit || hit.distance > limit + EPSILON) continue;
      const incident = segment.from === current || segment.to === current;
      if (!best || hit.distance < best.distance - EPSILON || Math.abs(hit.distance - best.distance) <= EPSILON && (incident && !best.incident || incident === best.incident && compare(segment.key, best.segment.key) < 0)) best = { ...hit, incident, segment };
    }
    if (!best) return null;
    const { segment, t, distance, incident } = best;
    const target = incident ? segment.from === current ? segment.to : segment.from : t < 0.5 ? segment.from : segment.to;
    // Prefer the real direction toward the chosen page. Incoming-only links
    // retain their original direction; the caller must never invent a reverse.
    const edge = segment.edges.find(edge => edge.to === target) || segment.edges[0];
    return { from: edge.from, to: edge.to, target, segment, distance, t };
  }
  const api = Object.freeze({ segments, pick, contains });
export default api;
