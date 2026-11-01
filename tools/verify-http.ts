// hx generated 261101 — read-only deployed/local route, SSR and service verification.
// Run from the repository root after the server is ready:
// node --env-file=.env.local --import tsx tools/verify-http.ts [baseURL]
import { getHlcCorpus, getArenaCorpus } from "../src/lib/content";
import { getSiteConfiguration } from "../src/lib/database";
import type { ReaderPage } from "../src/lib/types";

type Failure = { area: string; path?: string; reason: string };
type Check = { area: "hlc-direct" | "hlc-alias" | "arena-direct"; path: string; page: ReaderPage };
const failures: Failure[] = [];
const counts = { hlcDirect: 0, hlcAliases: 0, arenaDirect: 0, health: 0 };
const started = performance.now();
const base = new URL(process.argv[2] || "http://localhost:3011");
if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("Use an HTTP(S) origin without credentials, path, query or fragment.");

function fail(area: string, reason: string, route?: string) { failures.push({area, ...(route ? {path:route} : {}), reason}); }
function pathname(value: string): string { return new URL(value, base).pathname.replace(/\/+$/, "") || "/"; }

async function request(route: string): Promise<{response:Response; url:URL; redirects:number}> {
  let url = new URL(route, base), redirects = 0;
  for (;;) {
    if (url.origin !== base.origin) throw new Error("Refused a redirect outside the requested application origin.");
    const response = await fetch(url, {redirect:"manual", headers:{Accept:route === "/api/health" ? "application/json" : "text/html"}, signal:AbortSignal.timeout(20_000)});
    if (![301, 302, 303, 307, 308].includes(response.status)) return {response, url, redirects};
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || ++redirects > 6) throw new Error("Missing redirect target or redirect loop.");
    url = new URL(location, url);
  }
}

function readingMain(document: string): string | null {
  // Next's script payload also contains every page's HTML. Remove executable
  // and serialized payloads before requiring real <main id="main"> markup.
  const actual = document.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  return actual.match(/<main\b[^>]*\bid=["']main["'][^>]*>([\s\S]*?)<\/main\s*>/i)?.[1] ?? null;
}

async function verifyPage(check: Check): Promise<void> {
  try {
    const {response, url} = await request(check.path);
    if (response.status !== 200) throw new Error(`Expected HTTP 200; received HTTP ${response.status}.`);
    if (pathname(url.href) !== pathname(check.page.href)) throw new Error(`Destination mismatch: expected ${pathname(check.page.href)}, received ${pathname(url.href)}.`);
    if (!(response.headers.get("content-type") || "").includes("text/html")) throw new Error("The route did not return HTML.");
    const main = readingMain(await response.text());
    if (main === null) throw new Error("The response has no real server-rendered reading main element.");
    const expectedHeading = check.page.html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i)?.[0];
    if (!expectedHeading || !main.includes(expectedHeading)) throw new Error("The server-rendered H1 differs from the expected page.");
    if (!main.startsWith(check.page.html)) throw new Error("The server-rendered body differs from the source adapter output.");
    if (!main.includes(check.page.footer)) throw new Error("The server-rendered outgoing-link footer is missing or changed.");
    if (check.area === "hlc-direct") counts.hlcDirect++;
    else if (check.area === "hlc-alias") counts.hlcAliases++;
    else counts.arenaDirect++;
  } catch (error) {
    fail(check.area, error instanceof Error ? error.message : "Route verification failed.", check.path);
  }
}

async function runBounded(checks: Check[]): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({length:Math.min(4, checks.length)}, async () => {
    while (next < checks.length) { const check = checks[next++]; await verifyPage(check); }
  }));
}

async function main(): Promise<void> {
  const [hlc, config, arenaConfig] = await Promise.all([getHlcCorpus(), getSiteConfiguration("hlc"), getSiteConfiguration("barthes-test")]);
  if (!config || !arenaConfig) throw new Error("Both public site configurations are required.");
  if (hlc.pages.length !== 34) fail("baseline", `Expected 34 HLC pages; received ${hlc.pages.length}.`);
  if (config.aliases.length !== 141) fail("baseline", `Expected 141 seeded HLC aliases; received ${config.aliases.length}.`);
  const edges = hlc.pages.reduce((total, page) => total + page.links.length, 0);
  if (edges !== 132) fail("baseline", `Expected 132 directed HLC links; received ${edges}.`);
  const checks: Check[] = hlc.pages.map((page) => ({area:"hlc-direct", path:page.href, page}));
  const mapping = new Map(config.pages.map((page) => [page.id, page.source_page_id]));
  const byId = new Map(hlc.pages.map((page) => [page.id, page]));
  for (const alias of config.aliases) {
    const id = mapping.get(alias.page_id), page = id && byId.get(id);
    if (!page || !alias.path.startsWith("/") || alias.path.startsWith("//")) fail("hlc-alias", "Alias has no valid same-site source mapping.", alias.path);
    else checks.push({area:"hlc-alias", path:alias.path, page});
  }
  await runBounded(checks);

  try {
    const {response} = await request("/api/health");
    const health = await response.json();
    if (response.status !== 200 || health.status !== "ok" || health.database !== "connected" || !Array.isArray(health.sites) || !health.sites.includes("hlc") || !health.sites.includes("barthes-test")) throw new Error("Health check did not confirm both public sites and a connected runtime database.");
    counts.health++;
  } catch (error) { fail("health", error instanceof Error ? error.message : "Health check failed.", "/api/health"); }

  try {
    const channelId = arenaConfig.sources.find((source) => source.kind === "arena")?.source_ref;
    if (!channelId) throw new Error("The Are.na source is missing from public site configuration.");
    const arena = await getArenaCorpus({channelId});
    if (arena.status?.kind !== "ready") throw new Error("The live Are.na fixture did not load completely.");
    if (arena.pages.length !== 2 || arena.homeId !== "52203993" || !arena.pages.some((page) => page.id === "52203995") || arena.pages[0].links.join(",") !== "52203995" || arena.pages[1].links.length !== 0) throw new Error("The live Are.na two-node/one-edge fixture changed or is incomplete.");
    await runBounded(arena.pages.map((page) => ({area:"arena-direct", path:page.href, page})));
  } catch (error) { fail("arena-source", error instanceof Error ? error.message : "Live Are.na source check failed."); }
}

main().catch((error) => {
  fail("setup", error instanceof Error ? error.message : "Verification could not start.");
}).finally(() => {
  const passed = failures.length === 0;
  console.log(JSON.stringify({passed, baseURL:base.origin, concurrency:4, checks:counts, expected:{hlcDirect:34, hlcAliases:141, arenaDirect:2, health:1}, elapsedMs:Math.round(performance.now() - started), failures}, null, 2));
  if (!passed) process.exitCode = 1;
});
