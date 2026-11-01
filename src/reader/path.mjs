// Adapted from Sitemap 0.8; original implementation by Codex / OpenAI / gpt-6.

  const MAX_PATH_ITEMS = 512;
  const pageId = (id) => typeof id === "string" && id.length > 0;
  function create(current, home = "home") {
    return current === home ? { items: [], cursor: -1 } : { items: [current], cursor: 0 };
  }
  function current(path, home = "home") { return path.cursor === -1 ? home : path.items[path.cursor]; }
  // Fixed home lives at -1. An explicitly followed home link remains in the
  // chain, so repeated pages describe the route without replacing its root.
  function follow(path, id, home = "home") {
    if (!pageId(id)) return path;
    path.items.splice(path.cursor + 1);
    path.items.push(id);
    if (path.items.length > MAX_PATH_ITEMS) path.items.splice(0, path.items.length - MAX_PATH_ITEMS);
    path.cursor = path.items.length - 1;
    return path;
  }
  function select(path, index) {
    if (Number.isInteger(index) && index >= -1 && index < path.items.length) path.cursor = index;
    return path;
  }
  function clear(current, home = "home") { return create(current, home); }
  // Local storage is recoverable: never guess a cursor after partial damage.
  // Known IDs may be an array, Set, or the graph's page dictionary.
  function sanitize(raw, selected, knownIds, home = "home") {
    const known = knownIds instanceof Set ? (id) => knownIds.has(id) : Array.isArray(knownIds) ? (id) => knownIds.includes(id) : (id) => knownIds !== null && typeof knownIds === "object" && Object.prototype.hasOwnProperty.call(knownIds, id);
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !Array.isArray(raw.items) || raw.items.length > MAX_PATH_ITEMS || !Array.from(raw.items).every((id) => pageId(id) && known(id)) || !Number.isInteger(raw.cursor) || raw.cursor < -1 || raw.cursor >= raw.items.length || current(raw, home) !== selected) return create(selected, home);
    return { items: [...raw.items], cursor: raw.cursor };
  }
  const api = Object.freeze({ create, current, follow, select, clear, sanitize, MAX_PATH_ITEMS });
export default api;
