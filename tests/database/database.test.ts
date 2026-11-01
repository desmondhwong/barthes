import assert from "node:assert/strict";
import test from "node:test";
import {
  checkDatabaseConnection,
  DatabaseError,
  getSiteConfiguration,
  type DatabaseReadOptions,
} from "../../src/lib/database.ts";

const site = {
  id: "11111111-1111-4111-8111-111111111111", slug: "hlc", title: "HLC field notes",
  description: "Published adaptations", home_page_slug: "home",
};
const mockKey = "sb_publishable_test_fixture";
function options(implementation: (url: URL, init?: RequestInit) => Response | Promise<Response>): DatabaseReadOptions {
  return {
    url: "https://database.example.test",
    publishableKey: mockKey,
    fetch: ((input: string | URL | Request, init?: RequestInit) =>
      Promise.resolve(implementation(new URL(String(input)), init))) as typeof fetch,
  };
}

test("site configuration reads only the selected site's public mapping tables", async () => {
  const calls: URL[] = [];
  const result = await getSiteConfiguration("hlc", options((url, init) => {
    calls.push(url);
    assert.equal(new Headers(init?.headers).get("apikey"), mockKey);
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal);
    assert.equal(url.searchParams.has("owner_id"), false);
    if (url.pathname.endsWith("/sites")) {
      assert.equal(url.searchParams.get("slug"), "eq.hlc");
      return Response.json([site]);
    }
    assert.equal(url.searchParams.get("site_id"), `eq.${site.id}`);
    return Response.json([]);
  }));
  assert.equal(result?.site.slug, "hlc");
  assert.deepEqual(result?.pages, []);
  assert.deepEqual(calls.map(url => url.pathname).sort(), [
    "/rest/v1/page_aliases", "/rest/v1/pages", "/rest/v1/site_sources", "/rest/v1/sites",
  ]);
});

test("missing/non-public sites and invalid slugs return null without fetching other tables", async () => {
  let count = 0;
  const config = options(() => { count += 1; return Response.json([]); });
  assert.equal(await getSiteConfiguration("missing", config), null);
  assert.equal(await getSiteConfiguration("hlc,or=(is_public.eq.false)", config), null);
  assert.equal(count, 1);
});

test("connection check makes a real read and reports the returned site slugs", async () => {
  const result = await checkDatabaseConnection(options(url => {
    assert.equal(url.pathname, "/rest/v1/sites");
    assert.equal(url.searchParams.get("select"), "slug");
    return Response.json([{ slug: "barthes-test" }, { slug: "hlc" }]);
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.siteSlugs, ["barthes-test", "hlc"]);
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
});

test("network and service errors never echo keys or service bodies", async () => {
  for (const implementation of [
    () => { throw new Error(`request failed: ${mockKey}`); },
    () => new Response(`private response ${mockKey}`, { status: 403 }),
  ]) {
    await assert.rejects(checkDatabaseConnection(options(implementation)), (error: unknown) => {
      assert.ok(error instanceof DatabaseError);
      assert.equal(error.message.includes(mockKey), false);
      assert.equal(error.message.includes("private response"), false);
      return true;
    });
  }
});

test("invalid response shapes are errors instead of a successful empty connection", async () => {
  for (const value of [{ error: "bad" }, [null], [{ slug: 42 }]]) {
    await assert.rejects(checkDatabaseConnection(options(() => Response.json(value))), DatabaseError);
  }
});

test("invalid URL configuration is rejected before making a request", async () => {
  let called = false;
  const config = options(() => { called = true; return Response.json([]); });
  for (const url of ["broken", "http://database.example.test", "https://name:password@database.example.test"]) {
    await assert.rejects(checkDatabaseConnection({ ...config, url }), DatabaseError);
  }
  assert.equal(called, false);
});
