// hx generated 261101 — safe content helpers, retaining Sitemap heading/date semantics.
export const escapeHTML = (value: unknown): string => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export const headingId = (value: string): string => value.toLowerCase().replace(/[`*_]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");

export function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export const visibleWordCount = (html: string): number => html.replace(/<[^>]*>/g, " ").replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'" })[entity]!).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length || 0;

export const hlcHref = (id: string): string => id === "home" ? "/s/hlc" : `/s/hlc/p/${id.replaceAll("/", "--")}`;
export const arenaHref = (id: string): string => `/s/barthes-test/p/${id}`;
