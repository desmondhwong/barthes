// Adapted from Sitemap 0.8; original implementation by Codex / OpenAI / gpt-6.
import Path from "./path.mjs";
  export function createWorkspace(Graph, { corpusId = null, allowLegacy = true } = {}) {
    const MAX_SNAPSHOT_BYTES = 256 * 1024;
    const PAGE_COUNT = Object.keys(Graph.PAGES).length;
    const EDGE_COUNT = Object.values(Graph.LINKS).reduce((sum, links) => sum + links.length, 0);
    const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
    const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
    const known = (id) => typeof id === "string" && has(Graph.PAGES, id);
    const themes = ["light", "dark"];
    const views = ["normal", "reduced", "zen"];
    function defaultPreferences() { return { theme: "light", view: "normal", mapOpen: false, density: 35, chromeHidden: false }; }
    function normalizePreferences(raw) {
      const prefs = defaultPreferences();
      if (!record(raw)) return prefs;
      if (has(raw, "theme") && themes.includes(raw.theme)) prefs.theme = raw.theme;
      if (has(raw, "view") && views.includes(raw.view)) prefs.view = raw.view;
      if (has(raw, "mapOpen") && typeof raw.mapOpen === "boolean") prefs.mapOpen = raw.mapOpen;
      if (has(raw, "density") && Number.isInteger(raw.density) && raw.density >= 0 && raw.density <= 100) prefs.density = raw.density;
      if (has(raw, "chromeHidden") && typeof raw.chromeHidden === "boolean") prefs.chromeHidden = raw.chromeHidden;
      return prefs;
    }
    function requireValue(condition, message) { if (!condition) throw new Error("Invalid snapshot: " + message); }
    function exactKeys(value, keys, label) {
      requireValue(record(value), label + " must be an object.");
      const actual = Object.keys(value);
      requireValue(actual.length === keys.length && keys.every((key) => has(value, key)), label + " has missing or unsupported fields.");
    }
    function preferences(raw, label, legacy) {
      exactKeys(raw, legacy ? ["theme", "view", "mapOpen"] : ["theme", "view", "mapOpen", "density", "chromeHidden"], label);
      requireValue(themes.includes(raw.theme), label + ".theme must be light or dark.");
      requireValue(views.includes(raw.view), label + ".view must be normal, reduced or zen.");
      requireValue(typeof raw.mapOpen === "boolean", label + ".mapOpen must be a boolean.");
      if (!legacy) {
        requireValue(Number.isInteger(raw.density) && raw.density >= 0 && raw.density <= 100, label + ".density must be an integer from 0 to 100.");
        requireValue(typeof raw.chromeHidden === "boolean", label + ".chromeHidden must be a boolean.");
      }
      return { theme: raw.theme, view: raw.view, mapOpen: raw.mapOpen, density: legacy ? 35 : raw.density, chromeHidden: legacy ? false : raw.chromeHidden };
    }
    function ids(value, max, label, unique) {
      requireValue(Array.isArray(value) && value.length <= max, label + " must be an array of at most " + max + " pages.");
      requireValue(Array.from(value).every(known), label + " contains an unknown page.");
      if (unique) requireValue(new Set(value).size === value.length, label + " contains duplicate pages.");
      return [...value];
    }
    function validateSnapshot(raw) {
      requireValue(record(raw), "Snapshot must be an object.");
      requireValue(raw.version === 3 || raw.version === 4 || raw.version === 5, "unsupported version; supported exploration versions are 3, 4 and 5.");
      const namespaced = raw.version === 5;
      if (namespaced) {
        requireValue(raw.corpus === corpusId, "this exploration belongs to another corpus.");
        raw = { ...raw }; delete raw.corpus; raw.version = 4;
      } else requireValue(allowLegacy, "legacy explorations can only be imported into the HLC corpus.");
      const legacy = raw.version === 3;
      exactKeys(raw, legacy ? ["format", "version", "current", "graph", "preferences", "profile"] : ["format", "version", "current", "graph", "preferences", "profile", "path"], "Snapshot");
      requireValue(raw.format === "sitemap-exploration", "unsupported format.");
      requireValue(known(raw.current), "current page is unknown.");
      exactKeys(raw.graph, ["version", "visited", "visible", "edges", "trail", "open"], "Graph");
      requireValue(raw.graph.version === 3, "unsupported graph version.");
      requireValue(typeof raw.graph.open === "boolean", "graph.open must be a boolean.");
      const visited = ids(raw.graph.visited, PAGE_COUNT, "Visited pages", true);
      const visible = ids(raw.graph.visible, PAGE_COUNT, "Visible pages", true);
      const trail = ids(raw.graph.trail, 30, "Trail", false);
      requireValue(visible.length === PAGE_COUNT, "all pages must remain visible.");
      requireValue(visited.includes(raw.current), "current page must be visited.");
      requireValue(trail.length > 0 && trail.at(-1) === raw.current, "trail must end at the current page.");
      requireValue(trail.every((id, index) => visited.includes(id) && (index === 0 || id !== trail[index - 1])), "trail must contain visited pages without consecutive duplicates.");
      requireValue(Array.isArray(raw.graph.edges) && raw.graph.edges.length <= EDGE_COUNT, "edges must be an array of at most " + EDGE_COUNT + " links.");
      requireValue(raw.graph.edges.length === EDGE_COUNT, "all possible links must remain visible.");
      const edgeKeys = new Set();
      const edges = Array.from(raw.graph.edges).map((edge) => {
        exactKeys(edge, ["from", "to", "traversed"], "Edge");
        requireValue(known(edge.from) && known(edge.to) && Graph.LINKS[edge.from].includes(edge.to), "edge is not an actual page link.");
        requireValue(typeof edge.traversed === "boolean", "edge.traversed must be a boolean.");
        requireValue(!edge.traversed || visited.includes(edge.from), "traversed link source must have been visited.");
        const key = JSON.stringify([edge.from, edge.to]);
        requireValue(!edgeKeys.has(key), "duplicate edge.");
        edgeKeys.add(key);
        return { from: edge.from, to: edge.to, traversed: edge.traversed };
      });
      const prefs = preferences(raw.preferences, "Preferences", legacy);
      requireValue(raw.graph.open === prefs.mapOpen, "graph and preference camera modes disagree.");
      let profile = null;
      if (raw.profile !== null) {
        exactKeys(raw.profile, ["name", "preferences"], "Profile");
        requireValue(raw.profile.name === "Saved view", "unsupported profile name.");
        profile = { name: "Saved view", preferences: preferences(raw.profile.preferences, "Profile preferences", legacy) };
      }
      const rawPath = legacy ? Path.create(raw.current, Graph.HOME_ID) : raw.path;
      exactKeys(rawPath, ["items", "cursor"], "Path");
      const items = ids(rawPath.items, Path.MAX_PATH_ITEMS, "Path items", false);
      requireValue(items.every((id) => visited.includes(id)), "path items must have been visited.");
      requireValue(Number.isInteger(rawPath.cursor) && rawPath.cursor >= -1 && rawPath.cursor < items.length, "path.cursor must select fixed home or a path item.");
      const path = { items, cursor: rawPath.cursor };
      requireValue(Path.current(path, Graph.HOME_ID) === raw.current, "path cursor must identify the current page.");
      return { format: "sitemap-exploration", version: corpusId ? 5 : 4, ...(corpusId ? { corpus: corpusId } : {}), current: raw.current, graph: { version: 3, visited, visible, edges, trail, open: raw.graph.open }, preferences: prefs, profile, path };
    }
    function createSnapshot(graph, current, prefs, profile = null, path = Path.create(current, Graph.HOME_ID)) {
      return validateSnapshot({ format: "sitemap-exploration", version: corpusId ? 5 : 4, ...(corpusId ? { corpus: corpusId } : {}), current, graph, preferences: prefs, profile, path });
    }
    function parseSnapshot(text) {
      requireValue(typeof text === "string", "expected JSON text.");
      requireValue(text.length <= MAX_SNAPSHOT_BYTES && new TextEncoder().encode(text).length <= MAX_SNAPSHOT_BYTES, "file exceeds 256 KiB.");
      let raw;
      try { raw = JSON.parse(text); } catch (_) { throw new Error("Invalid snapshot: expected valid JSON."); }
      return validateSnapshot(raw);
    }
    return Object.freeze({ defaultPreferences, normalizePreferences, createSnapshot, parseSnapshot, MAX_SNAPSHOT_BYTES, createWorkspace });
  }

export default createWorkspace;
