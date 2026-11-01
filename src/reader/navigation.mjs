// Adapted from Sitemap 0.8; original implementation by Codex / OpenAI / gpt-6.

  const FORMAT = 'sitemap-navigation-1';
  const MAX_ITEMS = 512, MAX_ENTRIES = 256;
  const clone = value => JSON.parse(JSON.stringify(value));
  // Browsers can reject changes to a file URL's pathname. A file publication
  // therefore keeps its original document URL and places the page in its hash.
  // Both pushState and the native-hash fallback create one browser entry per
  // changed reading state. Camera/view changes need no navigation write.
  export function createNavigation({ location, history, storage, knownIds, pages = {}, home = 'home' }) {
    const ids = knownIds instanceof Set ? new Set(knownIds) : new Set(Array.isArray(knownIds) ? knownIds : Object.keys(knownIds || pages));
    const known = id => typeof id === 'string' && ids.has(id);
    const origin = new URL(location.href); origin.hash = '';
    if (!['http:', 'https:', 'file:'].includes(origin.protocol)) throw new TypeError('Unsupported navigation URL.');
    const originalURL = origin.href;
    const aliases = href => { const [, pathname, suffix] = href.match(/^([^?#]*)(.*)$/); return (pathname === './' ? ['./', 'index', 'index.html'] : [pathname, pathname.endsWith('.html') ? pathname.slice(0, -5) : pathname + '.html']).map(path => path + suffix); };
    let siteRoot = new URL('.', origin);
    const safeHref = href => {
      if (typeof href !== 'string' || !href || /[\\\x00-\x20]/.test(href)) return false;
      if (href.startsWith('/') && !href.startsWith('//')) return !href.split(/[?#]/, 1)[0].split('/').some(part => part === '..' || part === '.');
      return href === './' || !/^(?:[a-z][\w+.-]*:|\/)/i.test(href) && !/[?#]/.test(href) && !href.split('/').some(part => part === '..' || part === '.' || !part);
    };
    for (const href of Object.values(pages).filter(page => safeHref(page?.href) && !page.href.startsWith('/')).flatMap(page => aliases(page.href)).filter(href => href !== './').sort((a, b) => b.length - a.length)) {
      const suffix = new URL(href, 'https://sitemap.invalid/').pathname;
      if (origin.pathname.endsWith(suffix)) {
        siteRoot = new URL(origin); siteRoot.pathname = origin.pathname.slice(0, -suffix.length) + '/'; siteRoot.search = ''; siteRoot.hash = ''; break;
      }
    }
    if (Object.values(pages).some(page => page.href?.startsWith('/'))) siteRoot = new URL('/', origin);
    const pageURLs = new Map();
    for (const id of ids) if (safeHref(pages[id]?.href)) {
      const url = new URL(pages[id].href, siteRoot);
      if (/^[1-9]\d*$/.test(origin.searchParams.get('pages') || '')) url.searchParams.set('pages', origin.searchParams.get('pages'));
      if (url.protocol === origin.protocol && url.host === origin.host && url.pathname.startsWith(siteRoot.pathname)) pageURLs.set(id, url);
    }
    const pageAtURL = url => {
      if (url.protocol !== origin.protocol || url.host !== origin.host) return null;
      for (const [id] of pageURLs) if (aliases(pages[id].href).some(href => url.pathname === new URL(href, siteRoot).pathname)) return id;
      return url.pathname === siteRoot.pathname && !Object.values(pages).some(page => page.href?.startsWith('/')) && known(home) ? home : null;
    };
    const singlePath = page => ({ items: page === home ? [] : [page], cursor: page === home ? -1 : 0 });
    const validPath = (path, page) => path && Array.isArray(path.items) && path.items.length <= MAX_ITEMS && Array.from(path.items).every(known) && Number.isInteger(path.cursor) && path.cursor >= -1 && path.cursor < path.items.length && (path.cursor === -1 ? home : path.items[path.cursor]) === page;
    const cleanPath = (path, page) => validPath(path, page) ? { items: [...path.items], cursor: path.cursor } : singlePath(page);
    const validEntry = entry => typeof entry === 'string' && /^[a-zA-Z0-9_-]{1,96}$/.test(entry);
    const validAnchor = anchor => typeof anchor === 'string' && anchor.length <= 2048 && !/[\x00-\x1f\x7f]/.test(anchor);
    const validRecord = record => record && record.format === FORMAT && known(record.page) && validEntry(record.entry) && validAnchor(record.anchor) && validPath(record.path, record.page);
    const registry = new Map(), storageKey = `${FORMAT}:${originalURL}`;
    let active = null, sequence = 0;
    const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const raw = storage?.getItem(storageKey);
      if (typeof raw === 'string' && raw.length <= 4 * 1024 * 1024) {
        const records = JSON.parse(raw);
        if (Array.isArray(records)) for (const record of records.slice(-MAX_ENTRIES)) if (validRecord(record)) registry.set(record.entry, clone(record));
      }
    } catch (_) { /* Browser storage is optional, including for native history. */ }
    function remember(record) {
      registry.delete(record.entry); registry.set(record.entry, clone(record));
      while (registry.size > MAX_ENTRIES) registry.delete(registry.keys().next().value);
      try { storage?.setItem(storageKey, JSON.stringify([...registry.values()])); } catch (_) { /* The URL still restores its page. */ }
    }
    function publicRoute(record) {
      // A null entry means a plain document load, not a restored reading path.
      return { page: record.page, path: clone(record.path), anchor: record.anchor, entry: record.entry.startsWith('document-') ? null : record.entry };
    }
    function parseHash(url) {
      if (!url.hash.startsWith('#sitemap-page=')) return undefined;
      const raw = url.hash.slice(1);
      if (raw.length > 8192 || /%(?![\da-f]{2})/i.test(raw)) return null;
      try { decodeURIComponent(raw.replace(/\+/g, ' ')); } catch (_) { return null; }
      const params = new URLSearchParams(raw), keys = [...params.keys()];
      if (keys.some(key => !['sitemap-page', 'entry', 'anchor'].includes(key)) || new Set(keys).size !== keys.length) return null;
      const page = params.get('sitemap-page'), entry = params.get('entry'), anchor = params.get('anchor') || '';
      if (!known(page) || !validEntry(entry) || !validAnchor(anchor)) return null;
      const stored = registry.get(entry);
      let currentState; try { currentState = history.state; } catch (_) {}
      const state = validRecord(currentState) && currentState.entry === entry ? currentState : stored;
      return { format: FORMAT, page, entry, anchor, path: state?.page === page && state.anchor === anchor ? cleanPath(state.path, page) : singlePath(page) };
    }
    function currentRecord(event) {
      let url; try { url = new URL(location.href); } catch (_) { return null; }
      // Never interpret a notification from another origin or directory as a
      // page transition. Hash routes remain on the original document only.
      if (url.protocol !== origin.protocol || url.host !== origin.host) return null;
      const hash = parseHash(url);
      if (hash !== undefined) return (origin.protocol === 'file:' ? url.pathname === origin.pathname && url.search === origin.search : !!pageAtURL(url)) ? hash : null;
      const page = pageAtURL(url);
      if (!page) return null;
      let record; try { record = event?.type === 'popstate' ? event.state : history.state; } catch (_) {}
      const anchor = url.hash.slice(1);
      if (!validAnchor(anchor)) return null;
      if (validRecord(record) && record.page === page && record.anchor === anchor) return clone(record);
      return { format: FORMAT, page, path: singlePath(page), anchor, entry: `document-${encodeURIComponent(page).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 75)}` };
    }
    function initial() { const record = currentRecord(); return record ? publicRoute(record) : null; }
    function read(event) {
      const record = currentRecord(event);
      if (!record || active?.entry === record.entry && active.page === record.page && active.anchor === record.anchor) return null;
      active = record; remember(record); return publicRoute(record);
    }
    function write(state, { push = false, anchor = '' } = {}) {
      if (!state || !known(state.page) || !validAnchor(anchor)) return { ok: false, error: 'Invalid navigation state.' };
      const pageURL = pageURLs.get(state.page);
      if (origin.protocol !== 'file:' && pageURL) { const target = new URL(pageURL); target.hash = anchor; anchor = target.hash.slice(1); }
      const path = cleanPath(state.path, state.page);
      const previous = active || currentRecord();
      const same = previous && previous.page === state.page && previous.anchor === anchor && JSON.stringify(previous.path) === JSON.stringify(path);
      // Seed plain document entries before declaring them unchanged; this gives
      // the original page a full path and stable identity for Back and reload.
      if (same && !previous.entry.startsWith('document-')) { active = previous; return { ok: true, mode: 'unchanged', ...publicRoute(previous) }; }
      const record = { format: FORMAT, page: state.page, path, anchor, entry: `${nonce}-${++sequence}` };
      const hashURL = new URL(originalURL);
      hashURL.hash = new URLSearchParams({ 'sitemap-page': record.page, entry: record.entry, ...(anchor ? { anchor } : {}) }).toString();
      const url = origin.protocol === 'file:' || !pageURL ? hashURL : new URL(pageURL);
      if (url !== hashURL) url.hash = anchor;
      const method = push && !same ? 'pushState' : 'replaceState';
      let mode = 'history';
      // Remember before a native hash mutation: its hashchange acknowledgement
      // may arrive immediately in a host shim, or asynchronously in a browser.
      const oldActive = active; active = record; remember(record);
      try { history[method](clone(record), '', url.href); }
      catch (_) {
        mode = 'hash';
        try {
          const fallbackURL = new URL(location.href); fallbackURL.hash = hashURL.hash;
          if (method === 'pushState') location.hash = fallbackURL.hash;
          else location.replace(fallbackURL.href);
        } catch (_) { active = oldActive; return { ok: false, error: 'Browser navigation is unavailable.' }; }
      }
      return { ok: true, mode, ...publicRoute(record) };
    }
    return Object.freeze({ write, read, initial });
  }
  const api = Object.freeze({ createNavigation });
export default api;
