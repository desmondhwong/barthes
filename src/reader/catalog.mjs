// Adapted from Sitemap 0.8; original implementation by Codex / OpenAI / gpt-6.

  const alphabet = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  function normalizeDate(value) {
    if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
  }
  const idSet = values => values instanceof Set ? values : new Set(Array.isArray(values) ? values : []);
  function filterPages(pages, { visited = [], showVisited = true, showUnvisited = true } = {}) {
    const seen = idSet(visited);
    return pages.filter(page => seen.has(page.id) ? showVisited : showUnvisited);
  }
  function sortPages(pages, { sort = 'original', direction = 'asc' } = {}) {
    const order = direction === 'desc' ? -1 : 1;
    if (!['original', 'title', 'date'].includes(sort)) throw new TypeError('Unknown page sort.');
    if (sort === 'original') return [...pages];
    return pages.map((page, index) => ({ page, index })).sort((a, b) => {
      let comparison;
      if (sort === 'title') comparison = alphabet.compare(a.page.title || '', b.page.title || '') * order;
      else {
        const left = normalizeDate(a.page.publishedDate), right = normalizeDate(b.page.publishedDate);
        // Missing/invalid dates stay last in either direction. Equal dates keep
        // the corpus order rather than implying a time the source never gave.
        if (!left || !right) return left ? -1 : right ? 1 : a.index - b.index;
        comparison = left.localeCompare(right) * order;
      }
      return comparison || a.index - b.index;
    }).map(item => item.page);
  }
  function indexPages(pages, options = {}) { return sortPages(filterPages(pages, options), options); }
  function pathPages(pages, { visited = [], edges = [], path, trail = [], home = 'home' } = {}) {
    const seen = idSet(visited), byId = new Map(pages.map(page => [page.id, page])), adjacent = new Map();
    for (const edge of edges) {
      if (!edge || edge.traversed !== true || edge.from === edge.to || !seen.has(edge.from) || !seen.has(edge.to) || !byId.has(edge.from) || !byId.has(edge.to)) continue;
      if (!adjacent.has(edge.from)) adjacent.set(edge.from, new Set());
      if (!adjacent.has(edge.to)) adjacent.set(edge.to, new Set());
      adjacent.get(edge.from).add(edge.to); adjacent.get(edge.to).add(edge.from);
    }
    const route = Array.isArray(path) ? path : Array.isArray(path?.items) ? path.items : [];
    const rank = new Map();
    // Home is the fixed root before the breadcrumb items. Repeated page IDs
    // occupy one tile, at their first retained route/traversal occurrence.
    for (const id of [home, ...route, ...trail, ...seen, ...byId.keys()]) if (seen.has(id) && byId.has(id) && !rank.has(id)) rank.set(id, rank.size);
    const connected = [...adjacent.keys()].sort((a, b) => rank.get(a) - rank.get(b));
    const emitted = new Set(), result = [];
    // Keep each traveled component together, in route order within it. Merely
    // possible edges never promote an unvisited or disconnected page.
    for (const first of connected) {
      if (emitted.has(first)) continue;
      const component = [], pending = [first]; emitted.add(first);
      while (pending.length) {
        const id = pending.shift(); component.push(id);
        for (const next of adjacent.get(id)) if (!emitted.has(next)) { emitted.add(next); pending.push(next); }
      }
      component.sort((a, b) => rank.get(a) - rank.get(b));
      result.push(...component.map(id => byId.get(id)));
    }
    const isolated = pages.filter(page => seen.has(page.id) && !emitted.has(page.id));
    isolated.sort((a, b) => rank.get(a.id) - rank.get(b.id));
    return result.concat(isolated, pages.filter(page => !seen.has(page.id)));
  }
  function graphPages(pages, options = {}) {
    const order = options.order || 'title';
    const arranged = order === 'path' ? pathPages(pages, options) : sortPages(pages, { sort: order, direction: options.direction });
    return filterPages(arranged, options);
  }
  function shuffle(items, crypto = globalThis.crypto) {
    if (!crypto || typeof crypto.getRandomValues !== 'function') throw new Error('Shuffle requires WebCrypto random values, which are unavailable in this browser.');
    const result = [...items], word = new Uint32Array(1);
    for (let index = result.length - 1; index > 0; index--) {
      const bound = index + 1, ceiling = Math.floor(0x100000000 / bound) * bound;
      // Rejection sampling removes modulo bias when the array length does not
      // divide the 32-bit range. No weaker random source is substituted.
      do { crypto.getRandomValues(word); } while (word[0] >= ceiling);
      const selected = word[0] % bound;
      [result[index], result[selected]] = [result[selected], result[index]];
    }
    return result;
  }
  function tile(nodes, { width = 1000, gap = 36, originX = 0, originY = 0 } = {}) {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(gap) || gap < 0 || !Number.isFinite(originX) || !Number.isFinite(originY)) throw new TypeError('Tile dimensions must be finite, with positive width and nonnegative gap.');
    const dimension = (node, collision, normal) => {
      const value = Number.isFinite(node[collision]) && node[collision] > 0 ? node[collision] : node[normal];
      if (!Number.isFinite(value) || value <= 0) throw new TypeError('Tile nodes require positive width and height.');
      return value;
    };
    const sized = nodes.map(node => ({ node, width: dimension(node, 'collisionWidth', 'width'), height: dimension(node, 'collisionHeight', 'height') }));
    if (!sized.length) return [];
    const available = Math.max(width, ...sized.map(item => item.width));
    let x = 0, y = 0, rowHeight = 0, right = 0;
    const placed = sized.map(item => {
      if (x && x + item.width > available) { x = 0; y += rowHeight + gap; rowHeight = 0; }
      const position = { ...item.node, x: x + item.width / 2, y: y + item.height / 2, vx: 0, vy: 0 };
      right = Math.max(right, x + item.width); x += item.width + gap; rowHeight = Math.max(rowHeight, item.height);
      return position;
    });
    const bottom = y + rowHeight;
    // Origins identify the center of the finished arrangement, preserving a
    // useful camera target regardless of unequal node sizes or row count.
    return placed.map(node => ({ ...node, x: node.x + originX - right / 2, y: node.y + originY - bottom / 2 }));
  }
  function scatter(nodes, { width = 1000, gap = 36, originX = 0, originY = 0, crypto = globalThis.crypto } = {}) {
    if (!crypto || typeof crypto.getRandomValues !== 'function') throw new Error('Shuffle requires WebCrypto random values, which are unavailable in this browser.');
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(gap) || gap < 0 || !Number.isFinite(originX) || !Number.isFinite(originY)) throw new TypeError('Scatter dimensions must be finite, with positive width and nonnegative gap.');
    const dimension = (node, collision, normal) => {
      const value = Number.isFinite(node[collision]) && node[collision] > 0 ? node[collision] : node[normal];
      if (!Number.isFinite(value) || value <= 0) throw new TypeError('Scatter nodes require positive width and height.');
      return value;
    };
    const sized = nodes.map((node, index) => ({ node, index, width: dimension(node, 'collisionWidth', 'width'), height: dimension(node, 'collisionHeight', 'height') }));
    if (!sized.length) return [];
    const word = new Uint32Array(1), random = () => { crypto.getRandomValues(word); return word[0] / 0x100000000; };
    const maxWidth = Math.max(...sized.map(item => item.width)), maxHeight = Math.max(...sized.map(item => item.height));
    const clearance = gap + Math.max(0.000001, Math.max(maxWidth, maxHeight) * Number.EPSILON * 16);
    const area = sized.reduce((sum, item) => sum + (item.width + clearance) * (item.height + clearance), 0);
    const spanX = Math.max(width, maxWidth + clearance * 2), spanY = Math.max(maxHeight + clearance * 2, area * 2.6 / spanX);
    if (![area, spanX, spanY].every(Number.isFinite)) throw new TypeError('Scatter dimensions exceed finite layout bounds.');
    // Larger rectangles settle first. Random tie priorities and independent
    // continuous coordinates avoid a shuffled grid's shared rows and columns.
    const queue = sized.map(item => ({ ...item, priority: random() })).sort((a, b) => b.width * b.height - a.width * a.height || a.priority - b.priority || a.index - b.index);
    const placed = [], result = new Array(nodes.length);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const fits = candidate => placed.every(other => Math.abs(candidate.x - other.x) >= (candidate.width + other.width) / 2 + clearance || Math.abs(candidate.y - other.y) >= (candidate.height + other.height) / 2 + clearance);
    for (const [index, item] of queue.entries()) {
      let candidate;
      // Bounded random rejection keeps ordinary constellations loose while
      // guaranteeing progress even for repeated random words or extreme sizes.
      for (let attempt = 0; attempt < 64; attempt++) {
        const angle = random() * Math.PI * 2, radius = Math.sqrt(random()), expansion = 1 + Math.floor(attempt / 16) * 0.22;
        const trial = { ...item, x: Math.cos(angle) * radius * spanX * expansion / 2, y: Math.sin(angle) * radius * spanY * expansion / 2 };
        if (fits(trial)) { candidate = trial; break; }
      }
      if (!candidate) {
        // Put a final candidate beyond one complete occupied bound. The
        // golden-angle phase prevents an unhelpful line even with a degenerate
        // injected random source; WebCrypto supplies the real extra variation.
        const angle = (index + 1) * Math.PI * (3 - Math.sqrt(5)) + random() * Math.PI * 2;
        const dx = Math.cos(angle), dy = Math.sin(angle), extra = clearance + random() * Math.max(clearance, Math.min(item.width, item.height) * 0.3);
        candidate = { ...item, x: (minX + maxX) / 2 + dx * spanX / 2, y: (minY + maxY) / 2 + dy * spanY / 2 };
        if (Math.abs(dx) > Math.abs(dy)) candidate.x = dx > 0 ? maxX + item.width / 2 + extra : minX - item.width / 2 - extra;
        else candidate.y = dy > 0 ? maxY + item.height / 2 + extra : minY - item.height / 2 - extra;
      }
      if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) throw new TypeError('Scatter dimensions exceed finite layout bounds.');
      placed.push(candidate); result[item.index] = { ...item.node, x: candidate.x, y: candidate.y, vx: 0, vy: 0 };
      minX = Math.min(minX, candidate.x - item.width / 2); maxX = Math.max(maxX, candidate.x + item.width / 2);
      minY = Math.min(minY, candidate.y - item.height / 2); maxY = Math.max(maxY, candidate.y + item.height / 2);
    }
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    return result.map(node => {
      const x = node.x - centerX + originX, y = node.y - centerY + originY;
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Scatter dimensions exceed finite layout bounds.');
      return { ...node, x, y };
    });
  }
  const api = Object.freeze({ normalizeDate, filterPages, sortPages, indexPages, graphPages, pathPages, shuffle, tile, scatter });
export default api;
