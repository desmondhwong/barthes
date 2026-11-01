// Adapted from Sitemap 0.8; original implementation by Codex / OpenAI / gpt-6.

  export function createGraph(content) {
    if (!content || content.version !== 3 || !Array.isArray(content.pages) || !content.pages.length) throw new Error("Sitemap requires version 3 compiled content.");
    const pages = Object.create(null);
    for (const page of content.pages) {
      if (!page || typeof page.id !== "string" || !page.id || Object.hasOwn(pages, page.id) || typeof page.href !== "string" || !Array.isArray(page.links)) throw new Error("Invalid compiled page.");
      pages[page.id] = Object.freeze({ ...page, links: Object.freeze([...new Set(page.links)]) });
    }
    const PAGES = Object.freeze(pages);
    const IDS = Object.freeze(Object.keys(PAGES));
    const known = (id) => typeof id === "string" && Object.hasOwn(PAGES, id);
    const links = Object.create(null);
    for (const id of IDS) {
      if (!PAGES[id].links.every(known)) throw new Error("Compiled content has an unresolved link: " + id);
      links[id] = PAGES[id].links;
    }
    const LINKS = Object.freeze(links);
    const HOME_ID = known(content.homeId) ? content.homeId : known("home") ? "home" : IDS.find((id) => PAGES[id].href === "index.html") || IDS[0];
    const EDGE_PAIRS = IDS.flatMap((from) => LINKS[from].map((to) => ({ from, to })));
    const linked = (from, to) => known(from) && known(to) && LINKS[from].includes(to);
    const TRAIL_LIMIT = 30;
    const INPUT_LIMIT = Math.max(1024, EDGE_PAIRS.length * 4);
    function newState() {
      return { version: 3, visited: [], visible: [...IDS], edges: EDGE_PAIRS.map(({ from, to }) => ({ from, to, traversed: false })), trail: [], open: false };
    }
    // Stored input is recoverable. Every real possibility remains visible;
    // an intentional hyperlink navigation alone records traversal.
    function sanitizeState(raw) {
      const state = newState();
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.version !== 3) return state;
      if (Array.isArray(raw.visited)) state.visited = [...new Set(raw.visited.slice(0, INPUT_LIMIT).filter(known))];
      state.open = typeof raw.open === "boolean" ? raw.open : false;
      const byKey = new Map(state.edges.map((edge) => [JSON.stringify([edge.from, edge.to]), edge]));
      if (Array.isArray(raw.edges)) {
        for (const edge of raw.edges.slice(0, INPUT_LIMIT)) {
          if (!edge || edge.traversed !== true || !linked(edge.from, edge.to) || !state.visited.includes(edge.from)) continue;
          byKey.get(JSON.stringify([edge.from, edge.to])).traversed = true;
        }
      }
      if (Array.isArray(raw.trail)) {
        for (const id of raw.trail.slice(-INPUT_LIMIT)) {
          if (known(id) && state.visited.includes(id) && state.trail.at(-1) !== id) state.trail.push(id);
        }
        state.trail = state.trail.slice(-TRAIL_LIMIT);
      }
      return state;
    }
    function visit(state, id) {
      if (!known(id)) return state;
      if (!state.visited.includes(id)) state.visited.push(id);
      if (state.trail.at(-1) !== id) state.trail.push(id);
      if (state.trail.length > TRAIL_LIMIT) state.trail.splice(0, state.trail.length - TRAIL_LIMIT);
      return state;
    }
    function follow(state, from, to) {
      if (!linked(from, to) || !state.visited.includes(from)) return state;
      const edge = state.edges.find((item) => item.from === from && item.to === to);
      if (edge) edge.traversed = true;
      return state;
    }
    // A base may be the root or a nested generated page; the longest known
    // page suffix determines its site root. Hashes never invent graph edges.
    const aliases = href => { const [, pathname, suffix] = href.match(/^([^?#]*)(.*)$/); return (pathname === './' ? ['./', 'index', 'index.html'] : [pathname, pathname.endsWith('.html') ? pathname.slice(0, -5) : pathname + '.html']).map(path => path + suffix); };
    function hrefToId(href, base) {
      if (typeof href !== "string") return null;
      try {
        const baseURL = new URL(base || (globalThis.location && globalThis.location.href) || "https://sitemap.invalid/index.html");
        if (!["http:", "https:", "file:"].includes(baseURL.protocol)) return null;
        const resolved = new URL(href, baseURL);
        if (resolved.protocol !== baseURL.protocol || resolved.host !== baseURL.host) return null;
        for (const id of IDS) if (PAGES[id].href.startsWith('/') && aliases(PAGES[id].href).some(candidate => new URL(candidate, baseURL).pathname === resolved.pathname)) return id;
        let directory = new URL(".", baseURL);
        if (!baseURL.pathname.endsWith("/")) {
          for (const href of Object.values(PAGES).flatMap(page => aliases(page.href)).filter(href => href !== "./").sort((a, b) => b.length - a.length)) {
            const suffix = new URL(href, "https://sitemap.invalid/").pathname;
            if (baseURL.pathname.endsWith(suffix)) {
              directory = new URL(baseURL.href);
              directory.pathname = baseURL.pathname.slice(0, -suffix.length) + "/";
              directory.search = "";
              directory.hash = "";
              break;
            }
          }
        }
        const target = new URL(href, baseURL);
        if (target.protocol !== directory.protocol || target.host !== directory.host) return null;
        if (target.pathname === directory.pathname) return HOME_ID;
        return IDS.find((id) => aliases(PAGES[id].href).some(href => target.pathname === new URL(href, directory).pathname)) || null;
      } catch (_) { return null; }
    }
    function pageSize(page) {
      const words = Number.isFinite(page.wordCount) ? page.wordCount : 0;
      return { width: 76, height: words < 220 ? 108 : words < 330 ? 140 : 176 };
    }
    // Golden-angle scattering has no columns; connectivity supplies springs.
    function createLayout() {
      return IDS.map((id, index) => {
        const angle = index * Math.PI * (3 - Math.sqrt(5));
        const radius = 215 * Math.sqrt(index);
        return { id, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0, ...pageSize(PAGES[id]) };
      });
    }
    function collisionSize(node) {
      const dimension = (override, fallback) => Number.isFinite(override) && override > 0 ? override : Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
      return { width: dimension(node.collisionWidth, node.width), height: dimension(node.collisionHeight, node.height) };
    }
    function createSimulation(nodes, { density = 35 } = {}) {
      const byId = new Map(nodes.map((node) => [node.id, node]));
      const springs = [], degree = new Map(nodes.map((node) => [node.id, 0])), seen = new Set();
      for (const { from, to } of EDGE_PAIRS) {
        if (from === to || !byId.has(from) || !byId.has(to)) continue;
        const key = JSON.stringify([from, to].sort());
        if (seen.has(key)) continue;
        seen.add(key);
        springs.push([byId.get(from), byId.get(to)]);
        degree.set(from, degree.get(from) + 1); degree.set(to, degree.get(to) + 1);
      }
      const normalizeDensity = (value) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 35;
      // The initial layout is settled offscreen. Visible interactions have a
      // short, finite tail, with no perpetual low-temperature ambient drift.
      let densityValue = normalizeDensity(density), temperature = 1;
      let framesLeft = 480, coolingRate = 0.988, released = false, heldId = null;
      const releaseFrames = 84;
      let releaseTemperature = 0, releaseAge = 0;
      function reheat() {
        temperature = Math.max(temperature, 0.7);
        framesLeft = 84; coolingRate = 0.925; released = false;
      }
      function cool() {
        heldId = null;
        if (!temperature || released) return;
        // Preserve momentum and force at release. Repeated camera events must
        // neither restart this tail nor repeatedly reduce its temperature.
        releaseTemperature = temperature; releaseAge = 0; released = true;
      }
      const setDensity = (value) => {
        const next = normalizeDensity(value);
        if (next !== densityValue) { densityValue = next; reheat(); }
        return densityValue;
      };
      function prepare() {
        for (const node of nodes) {
          if (!Number.isFinite(node.x)) node.x = 0;
          if (!Number.isFinite(node.y)) node.y = 0;
          if (!Number.isFinite(node.vx)) node.vx = 0;
          if (!Number.isFinite(node.vy)) node.vy = 0;
        }
      }
      function movement(before) {
        return nodes.reduce((maximum, node, index) => Math.max(maximum, Math.hypot(node.x - before[index].x, node.y - before[index].y)), 0);
      }
      // This is a positional constraint, separate from soft repulsion. It must
      // also run after a pointer teleport or a semantic-size change, before paint.
      function resolve(fixedId = null) {
        prepare();
        const before = nodes.map((node) => ({ x: node.x, y: node.y }));
        const dimensions = new Map(nodes.map((node) => [node, collisionSize(node)]));
        const gap = 8 + (1 - densityValue / 100) * 16;
        const overlap = (a, b) => {
          const sa = dimensions.get(a), sb = dimensions.get(b);
          return { x: (sa.width + sb.width) / 2 + gap - Math.abs(b.x - a.x), y: (sa.height + sb.height) / 2 + gap - Math.abs(b.y - a.y) };
        };
        const touches = (a, b) => { const amount = overlap(a, b); return amount.x > 0 && amount.y > 0; };
        // Local projection preserves the constellation in ordinary interaction.
        // A tiny surplus avoids floating-point contact becoming a new overlap.
        for (let pass = 0; pass < 28; pass++) {
          let collisions = 0;
          for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j], amount = overlap(a, b);
            if (amount.x <= 0 || amount.y <= 0) continue;
            collisions++;
            const shareA = a.id === fixedId ? 0 : b.id === fixedId ? 1 : 0.5;
            const shareB = b.id === fixedId ? 0 : a.id === fixedId ? 1 : 0.5;
            if (amount.x < amount.y) {
              const push = (Math.sign(b.x - a.x) || (i % 2 ? -1 : 1)) * (amount.x + 0.0001);
              a.x -= push * shareA; b.x += push * shareB;
              if (shareA) a.vx = 0;
              if (shareB) b.vx = 0;
            } else {
              const push = (Math.sign(b.y - a.y) || (i % 2 ? -1 : 1)) * (amount.y + 0.0001);
              a.y -= push * shareA; b.y += push * shareB;
              if (shareA) a.vy = 0;
              if (shareB) b.vy = 0;
            }
          }
          if (!collisions) break;
        }
        // Iterative pair projection alone cannot guarantee a collision-free
        // frame in a dense pile. Residual intersections use a finite insertion
        // pass: keep earlier rectangles fixed and choose the nearest empty
        // axis candidate for this rectangle. Outer candidates always exist.
        const ordered = [...nodes].sort((a, b) => (b.id === fixedId ? 1 : 0) - (a.id === fixedId ? 1 : 0));
        const placed = [];
        for (const node of ordered) {
          if (!placed.some((other) => touches(node, other))) { placed.push(node); continue; }
          const origin = { x: node.x, y: node.y }, size = dimensions.get(node), candidates = [];
          for (const other of placed) {
            const otherSize = dimensions.get(other);
            const dx = (size.width + otherSize.width) / 2 + gap + 0.0001;
            const dy = (size.height + otherSize.height) / 2 + gap + 0.0001;
            candidates.push({ x: other.x - dx, y: origin.y }, { x: other.x + dx, y: origin.y }, { x: origin.x, y: other.y - dy }, { x: origin.x, y: other.y + dy });
          }
          candidates.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y));
          for (const candidate of candidates) {
            node.x = candidate.x; node.y = candidate.y;
            if (!placed.some((other) => touches(node, other))) break;
          }
          if (node.x !== origin.x) node.vx = 0;
          if (node.y !== origin.y) node.vy = 0;
          placed.push(node);
        }
        const fixed = byId.get(fixedId);
        if (fixed) { fixed.vx = 0; fixed.vy = 0; }
        return movement(before);
      }
      function step(fixedId = null) {
        const fixed = byId.get(fixedId);
        if (fixed) {
          heldId = fixed.id;
          temperature = Math.max(temperature, 0.38);
          released = false;
        } else if (heldId !== null) cool();
        // resolve() remains independently available for direct pointer moves
        // and size changes. An asleep force simulation itself is an exact no-op.
        if (!fixed && !temperature) return 0;
        prepare();
        const initial = nodes.map((node) => ({ x: node.x, y: node.y }));
        const spread = 1 - densityValue / 100;
        const charge = 12000 + spread * 31000;
        const proximityRange = 65 + spread * 120;
        const dimensions = new Map(nodes.map((node) => [node, collisionSize(node)]));
        for (const node of nodes) {
          // Weak attraction permits loose clusters; degree-normalized springs
          // below keep highly connected pages from collapsing their neighbors.
          node.vx -= node.x * 0.000055 * temperature;
          node.vy -= node.y * 0.000055 * temperature;
        }
        for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j], sa = dimensions.get(a), sb = dimensions.get(b);
          let dx = b.x - a.x, dy = b.y - a.y;
          if (Math.abs(dx) + Math.abs(dy) < 0.001) { dx = Math.cos(j * 2.399) * 0.1; dy = Math.sin(j * 2.399) * 0.1; }
          const distance = Math.hypot(dx, dy);
          const edgeGap = Math.hypot(Math.max(0, Math.abs(dx) - (sa.width + sb.width) / 2), Math.max(0, Math.abs(dy) - (sa.height + sb.height) / 2));
          const proximity = Math.max(0, 1 - edgeGap / proximityRange);
          const force = (Math.min(4.5, charge / Math.max(distance * distance, 4096)) + proximity * proximity * 2.6) * temperature;
          const fx = dx / distance * force, fy = dy / distance * force;
          a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
        }
        for (const [a, b] of springs) {
          const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 1;
          const sa = dimensions.get(a), sb = dimensions.get(b);
          const ux = Math.abs(dx / distance), uy = Math.abs(dy / distance);
          const boundary = Math.min(ux > 0.0001 ? (sa.width + sb.width) / (2 * ux) : Infinity, uy > 0.0001 ? (sa.height + sb.height) / (2 * uy) : Infinity);
          const rest = Math.max(180 + spread * 380, (Number.isFinite(boundary) ? boundary : 0) + 70 + spread * 110);
          const strength = 0.018 / Math.sqrt(Math.max(1, degree.get(a.id)) * Math.max(1, degree.get(b.id)));
          const force = (distance - rest) * strength * temperature;
          const fx = dx / distance * force, fy = dy / distance * force;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
        for (const node of nodes) {
          if (node === fixed) { node.vx = 0; node.vy = 0; continue; }
          const progress = releaseAge / releaseFrames;
          const frictionEase = progress * progress * (3 - 2 * progress);
          const damping = released ? 0.76 - 0.06 * frictionEase : 0.76;
          node.vx *= damping; node.vy *= damping;
          const speed = Math.hypot(node.vx, node.vy);
          if (speed > 18) { node.vx *= 18 / speed; node.vy *= 18 / speed; }
          if (Math.abs(node.vx) < 0.0001) node.vx = 0;
          if (Math.abs(node.vy) < 0.0001) node.vy = 0;
          node.x += node.vx; node.y += node.vy;
        }
        resolve(fixedId);
        const lastMotion = movement(initial);
        if (!fixed) {
          if (released) {
            const progress = ++releaseAge / releaseFrames;
            // Exponential relaxation gives the visible movement a short tail;
            // the squared envelope approaches zero with zero terminal slope.
            temperature = releaseTemperature * Math.exp(-7 * progress) * (1 - progress) ** 2;
            if (releaseAge >= releaseFrames) stop();
          } else {
            temperature *= coolingRate;
            if (--framesLeft <= 0 || temperature < 0.0008) stop();
          }
        }
        return lastMotion;
      }
      function stop() {
        resolve();
        for (const node of nodes) { node.vx = 0; node.vy = 0; }
        temperature = 0; framesLeft = 0; heldId = null;
      }
      prepare();
      resolve();
      return Object.freeze({ step, resolve, setDensity, reheat, cool, stop, get alpha() { return temperature; }, get active() { return temperature > 0; }, get density() { return densityValue; } });
    }
    // Legacy callers retain a persistent simulation for each mutable node array.
    const simulations = new WeakMap();
    function stepLayout(nodes, fixedId = null) {
      if (!simulations.has(nodes)) simulations.set(nodes, createSimulation(nodes));
      return simulations.get(nodes).step(fixedId);
    }
    function layoutBounds(nodes) {
      if (!nodes.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
      const minX = Math.min(...nodes.map((node) => node.x - node.width / 2));
      const minY = Math.min(...nodes.map((node) => node.y - node.height / 2));
      const maxX = Math.max(...nodes.map((node) => node.x + node.width / 2));
      const maxY = Math.max(...nodes.map((node) => node.y + node.height / 2));
      return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }
    const clampZoom = (zoom) => Math.max(0.035, Math.min(12, Number.isFinite(zoom) ? zoom : 1));
    function fitCamera(nodes, width, height, padding = 48) {
      const bounds = layoutBounds(nodes);
      return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, zoom: clampZoom(Math.min(Math.max(1, width - padding * 2) / Math.max(1, bounds.width), Math.max(1, height - padding * 2) / Math.max(1, bounds.height), 1)) };
    }
    return Object.freeze({ PAGES, LINKS, HOME_ID, newState, sanitizeState, visit, follow, hrefToId, createLayout, createSimulation, stepLayout, pageSize, collisionSize, layoutBounds, clampZoom, fitCamera, createGraph });
  }

export default createGraph;
