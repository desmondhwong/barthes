/** Server-side, read-only access to the public reader metadata. Never uses an admin key. */
export type SiteRecord = {
  id: string;
  slug: string;
  title: string;
  description: string;
  home_page_slug: string;
};

export type SourceRecord = {
  id: string;
  site_id: string;
  kind: "markdown" | "arena";
  source_key: string;
  source_ref: string;
  label: string;
};

export type PageRecord = {
  id: string;
  site_id: string;
  source_id: string;
  source_page_id: string;
  slug: string;
  title: string;
};

export type AliasRecord = { site_id: string; page_id: string; path: string };

export type SiteConfiguration = {
  site: SiteRecord;
  sources: SourceRecord[];
  pages: PageRecord[];
  aliases: AliasRecord[];
};

export type DatabaseConnectionStatus = {
  ok: true;
  checkedAt: string;
  siteSlugs: string[];
};

/** Injection is for deterministic tests; application callers use the process environment. */
export type DatabaseReadOptions = {
  url?: string;
  publishableKey?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export class DatabaseError extends Error {
  constructor(message: string, readonly code: "configuration" | "network" | "response") {
    super(message);
    this.name = "DatabaseError";
  }
}

function connection(options: DatabaseReadOptions) {
  if (typeof window !== "undefined") {
    throw new DatabaseError("Database configuration is read on the server only.", "configuration");
  }
  const origin = options.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = options.publishableKey ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!origin || !key) {
    throw new DatabaseError("The Supabase reader connection is not configured.", "configuration");
  }
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new DatabaseError("The Supabase URL is invalid.", "configuration");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new DatabaseError("The Supabase URL must be an HTTPS origin.", "configuration");
  }
  return { origin: url.origin, key, fetch: options.fetch ?? fetch, timeoutMs: options.timeoutMs ?? 8_000 };
}

async function readRows<T>(
  table: string,
  parameters: Record<string, string>,
  options: DatabaseReadOptions,
): Promise<T[]> {
  const config = connection(options);
  const url = new URL(`/rest/v1/${table}`, config.origin);
  url.search = new URLSearchParams(parameters).toString();
  let response: Response;
  try {
    response = await config.fetch(url, {
      headers: { apikey: config.key, Accept: "application/json" },
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new DatabaseError("The Supabase reader connection could not be reached.", "network");
  }
  if (!response.ok) {
    // Do not echo service bodies, request headers, credentials, or URLs into logs/UI.
    throw new DatabaseError(`The Supabase reader request failed (HTTP ${response.status}).`, "response");
  }
  let rows: unknown;
  try {
    rows = await response.json();
  } catch {
    throw new DatabaseError("The Supabase reader returned invalid JSON.", "response");
  }
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new DatabaseError("The Supabase reader returned an invalid row collection.", "response");
  }
  return rows as T[];
}

export async function getSiteConfiguration(
  slug: string,
  options: DatabaseReadOptions = {},
): Promise<SiteConfiguration | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const [site] = await readRows<SiteRecord>("sites", {
    select: "id,slug,title,description,home_page_slug",
    slug: `eq.${slug}`,
    limit: "1",
  }, options);
  if (!site) return null;
  const filter = { site_id: `eq.${site.id}`, order: "id.asc" };
  const [sources, pages, aliases] = await Promise.all([
    readRows<SourceRecord>("site_sources", {
      select: "id,site_id,kind,source_key,source_ref,label", ...filter,
    }, options),
    readRows<PageRecord>("pages", {
      select: "id,site_id,source_id,source_page_id,slug,title", ...filter,
    }, options),
    readRows<AliasRecord>("page_aliases", {
      select: "site_id,page_id,path", site_id: filter.site_id, order: "path.asc",
    }, options),
  ]);
  return { site, sources, pages, aliases };
}

export async function checkDatabaseConnection(
  options: DatabaseReadOptions = {},
): Promise<DatabaseConnectionStatus> {
  const sites = await readRows<{ slug: string }>("sites", { select: "slug", order: "slug.asc" }, options);
  if (sites.some(site => typeof site.slug !== "string")) {
    throw new DatabaseError("The Supabase reader returned invalid site metadata.", "response");
  }
  return { ok: true, checkedAt: new Date().toISOString(), siteSlugs: sites.map(site => site.slug) };
}
