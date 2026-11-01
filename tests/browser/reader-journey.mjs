/**
 * Standalone Playwright journey. Pass a Playwright Page and the app origin.
 * This resets only this app's Barthes storage; use a disposable browser context.
 * No Playwright package/import is required. The function may be serialized.
 */
export async function readerJourney(page, baseURL) {
  const started = Date.now();
  const checks = [];
  const origin = new URL(baseURL).origin;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const check = async (name, operation) => {
    const start = Date.now();
    try { await operation(); checks.push({ name, status: 'passed', ms: Date.now() - start }); }
    catch (error) { checks.push({ name, status: 'failed', message: String(error.message || error), ms: Date.now() - start }); throw error; }
  };
  const read = async id => {
    await page.waitForFunction(expected => {
      const host = document.querySelector('.barthes-reader');
      const current = document.querySelector('.page-node.current.readable');
      return host?.dataset.page === expected && current?.dataset.node === expected;
    }, id, { timeout: 10000 });
  };
  const current = () => page.locator('.barthes-reader').getAttribute('data-page');
  const historyLength = () => page.evaluate(() => history.length);
  const traveled = () => page.evaluate(() => {
    const state = JSON.parse(sessionStorage.getItem(`barthes:3:${location.origin}/s/hlc`) || '{}');
    return (state.edges || []).filter(edge => edge.traversed).length;
  });
  const showGraph = async () => {
    if ((await page.locator('#map-button').textContent()).trim() === 'Graph') await page.locator('#map-button').click();
    await page.waitForFunction(() => document.querySelector('#map-button')?.textContent === 'Read page' && !document.querySelector('.page-node.readable'));
  };
  const showReading = async () => {
    const id = await current();
    if ((await page.locator('#map-button').textContent()).trim() === 'Read page') await page.locator('#map-button').click();
    await read(id);
  };
  const follow = href => page.locator(`.page-node.current .page-body a[href="${href}"]`).first().click();
  let initialReaderMs = null;
  let originalReducedMotion = false;
  try {
    await check('fresh HLC reader: 34 pages, one current reading surface', async () => {
      await page.setViewportSize({ width: 1365, height: 900 });
      await page.goto(`${origin}/s/hlc`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('body.reader-enhanced');
      await page.evaluate(() => {
        for (const storage of [sessionStorage, localStorage]) {
          for (const key of Object.keys(storage)) {
            if (key.startsWith('barthes:') || key.startsWith('sitemap-navigation-1:')) storage.removeItem(key);
          }
        }
      });
      const start = Date.now();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await read('home'); initialReaderMs = Date.now() - start;
      assert(await page.locator('.page-node').count() === 34, 'Expected exactly 34 HLC nodes.');
      assert(await page.locator('.page-node.readable').count() === 1, 'Expected one readable page.');
      originalReducedMotion = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    });

    await check('authored link adds one history entry; Back/Forward preserves branch', async () => {
      const before = await historyLength();
      await follow('/s/hlc/p/foundations--cultural-hologram');
      await read('foundations/cultural-hologram');
      assert(await historyLength() === before + 1, 'One link must add exactly one browser-history entry.');
      assert(new URL(page.url()).pathname === '/s/hlc/p/foundations--cultural-hologram', 'Incorrect clean URL.');
      await page.goBack(); await read('home');
      assert(await page.locator('.path-link').count() === 1, 'Back erased the forward breadcrumb branch.');
      await page.goForward(); await read('foundations/cultural-hologram');
      assert(await traveled() === 1, 'A single authored link must record one traversal.');
    });

    await check('breadcrumb return preserves future; new hyperlink replaces that branch', async () => {
      await page.locator('#home-link').click(); await read('home');
      assert(await page.locator('.path-link').count() === 1, 'Selecting Home erased the future branch prematurely.');
      await follow('/s/hlc/p/foundations--digital-trace'); await read('foundations/digital-trace');
      assert(await page.locator('.path-link').count() === 1, 'A new branch retained obsolete future entries.');
      assert((await page.locator('.path-link').getAttribute('href')).includes('digital-trace'), 'Breadcrumb does not describe the new branch.');
    });

    await check('G toggles graph/read without adding history or changing URL', async () => {
      const before = await historyLength(), url = page.url(), id = await current();
      await page.keyboard.press('g'); await showGraph();
      await page.keyboard.press('g'); await read(id);
      assert(await historyLength() === before && page.url() === url, 'Camera toggle changed browser navigation.');
    });

    await check('Index jump visits a page without inventing a traveled edge', async () => {
      const before = await traveled(), length = await historyLength();
      await page.locator('#open-index').click();
      await page.locator('#index a[href="/s/hlc/p/start--what-is-hlc"]').click();
      await read('start/what-is-hlc');
      assert(await traveled() === before, 'Index jump recorded a hyperlink traversal.');
      assert(await historyLength() === length + 1, 'Index jump did not add exactly one entry.');
    });

    await check('theme, reduced frame, saved view and Zen recovery', async () => {
      await page.locator('#open-settings').click();
      await page.locator('#theme-setting').selectOption('dark');
      await page.locator('#view-setting').selectOption('reduced');
      await page.locator('#save-view').click();
      assert(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'Dark theme not applied.');
      assert(!await page.locator('.page-node.current .page-kicker').isVisible(), 'Reduced frame retained page metadata.');
      await page.locator('#theme-setting').selectOption('light');
      await page.locator('#view-setting').selectOption('normal');
      await page.locator('#restore-view').click();
      assert(await page.evaluate(() => document.body.dataset.view) === 'reduced', 'Saved frame not restored.');
      assert(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'Saved theme not restored.');
      await page.locator('#view-setting').selectOption('zen');
      await page.locator('#close-settings').click();
      assert(!await page.locator('.site-header').isVisible(), 'Zen did not hide the bar.');
      await page.locator('#show-bar').click();
      assert(await page.locator('.site-header').isVisible(), 'Menu failed to recover the bar.');
      assert(await page.evaluate(() => document.body.dataset.view) === 'normal', 'Zen recovery did not return to Normal.');
      await page.locator('#open-settings').click(); await page.locator('#reset-view').click(); await page.locator('#close-settings').click();
      await showReading();
    });

    await check('graph filters preserve recoverable empty state and local-neighbor view', async () => {
      await showGraph();
      await page.locator('#graph-visited').click();
      assert(await page.locator('.page-node.visited:visible').count() === 0, 'Visited filter left visited nodes visible.');
      await page.locator('#graph-unvisited').click();
      assert(await page.locator('.page-node:visible').count() === 0, 'Both hidden filters did not empty the graph.');
      assert(await page.locator('#graph-empty').isVisible(), 'Empty graph has no recovery message.');
      await page.locator('#graph-visited').click(); await page.locator('#graph-unvisited').click();
      assert(await page.locator('.page-node:visible').count() === 34, 'Restoring filters did not restore the corpus.');
      await page.locator('#graph-local').click();
      const localCount = await page.locator('.page-node:visible').count();
      assert(localCount > 0 && localCount < 34, 'Local-links filter did not narrow this page neighborhood.');
      await page.locator('#graph-local').click();
    });

    await check('title/date/path/shuffle arrangements and keyboard density control', async () => {
      for (const selector of ['[data-arrange-toggle="title"]', '[data-arrange-toggle="title"]', '[data-arrange-toggle="date"]', '[data-arrange="path:asc"]', '[data-arrange="shuffle:asc"]']) {
        await page.locator(selector).click();
        assert(await page.locator('#graph-status').getAttribute('data-error') === 'false', `Arrangement failed: ${selector}`);
        assert((await page.locator('#graph-status').textContent()).includes('34 pages arranged'), 'Arrangement did not report the whole visible corpus.');
      }
      await page.locator('#density').focus(); await page.keyboard.press('End'); await page.keyboard.press('ArrowLeft');
      assert((await page.locator('#density-value').textContent()).trim() === '99', 'Density did not respond to precise keyboard input.');
      await page.keyboard.press('Home');
      assert((await page.locator('#density-value').textContent()).trim() === '0', 'Density Home endpoint was not applied.');
    });

    await check('held zoom stops after pointer release', async () => {
      await showReading();
      const id = await current(), button = await page.locator('#zoom-out').boundingBox();
      assert(button, 'Zoom button has no visible bounds.');
      await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
      await page.mouse.down(); await page.waitForTimeout(480); await page.mouse.up();
      await page.waitForTimeout(120);
      const after = await page.locator('.page-node.current').boundingBox();
      await page.waitForTimeout(220);
      const later = await page.locator('.page-node.current').boundingBox();
      assert(after && later && Math.abs(after.width - later.width) < 0.2 && Math.abs(after.height - later.height) < 0.2, 'Zoom continued after pointer release.');
      assert(await current() === id, 'Held zoom changed the selected reading page.');
      await showReading();
    });

    await check('reduced motion supports immediate graph/read recovery', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await showGraph();
      assert(await page.locator('.page-node.readable').count() === 0, 'Reduced-motion graph did not open.');
      await showReading();
      await page.emulateMedia({ reducedMotion: originalReducedMotion ? 'reduce' : 'no-preference' });
    });

    await check('mobile Arrange panel and hidden-bar reveal remain usable', async () => {
      await page.setViewportSize({ width: 390, height: 700 }); await showGraph();
      await page.locator('#open-graph-tools').click();
      assert(await page.locator('#graph-tools').isVisible(), 'Mobile Arrange panel did not open.');
      await page.locator('#close-graph-tools').click();
      await page.locator('#hide-bar').click(); await page.locator('#show-bar').click();
      assert(await page.locator('.site-header').isVisible(), 'Mobile Menu did not restore the bar.');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile layout overflows horizontally.');
      await showReading();
    });
    return { ok: true, initialReaderMs, elapsedMs: Date.now() - started, checks };
  } catch (error) {
    await page.mouse.up().catch(() => {});
    await page.emulateMedia({ reducedMotion: originalReducedMotion ? 'reduce' : 'no-preference' }).catch(() => {});
    return { ok: false, initialReaderMs, elapsedMs: Date.now() - started, checks, error: String(error.message || error) };
  }
}
