// hx generated 261101 — adapted from Sitemap 0.8 compile.mjs; source identities in provenance/content-manifest.json.
// The bounded HLC parser is retained to preserve the published adaptation exactly.
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Corpus, ReaderPage } from "../types";
import { escapeHTML, headingId, hlcHref, normalizeDate, visibleWordCount } from "./shared";

type SourcePage = ReaderPage & { markdown?: string };
type Resolver = (raw: string, kind: "wiki" | "markdown") => { href: string; title: string };
const stripComments = (value: string): string => value.replace(/<!--[\s\S]*?-->/g, "");

// Publication metadata comes from leading source comments, never filesystem
// mtimes or dates mentioned in the article. An explicit date overrides the
// adaptation's hx generation date; an invalid explicit date refuses the build.
export function publishedDate(markdown: string): string | null {
  const header = String(markdown).replace(/^\uFEFF/, '').match(/^\s*(?:(?:<!--[\s\S]*?-->)\s*)*/)?.[0] || '';
  const explicit = [...header.matchAll(/<!--\s*published\s*:\s*([\s\S]*?)\s*-->/gi)];
  if (explicit.length > 1) throw new Error('Use exactly one published date comment.');
  if (explicit.length) {
    const value = normalizeDate(explicit[0][1].trim());
    if (!value) throw new Error('Invalid published date; use <!-- published: YYYY-MM-DD --> with a real calendar date.');
    return value;
  }
  const generated = header.match(/<!--\s*hx generated\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))(?=\s|;|-->)/i)?.[1];
  return generated && Number.isFinite(Date.parse(generated)) ? normalizeDate(generated.slice(0, 10)) : null;
}

async function markdownFiles(directory: string, prefix = ''): Promise<string[]> {
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Expected real content directory: ${directory}`);
  const files: string[] = [];
  for (const name of (await readdir(directory)).sort()) {
    if (name.startsWith('.') || name.startsWith('_') || name.toLowerCase() === 'readme.md') continue;
    const relative = prefix ? `${prefix}/${name}` : name;
    const entry = await lstat(path.join(directory, name));
    if (entry.isSymbolicLink()) throw new Error(`Refusing content symlink: ${relative}`);
    if (entry.isDirectory()) files.push(...await markdownFiles(path.join(directory, name), relative));
    else if (entry.isFile() && name.endsWith('.md')) files.push(relative);
  }
  return files;
}

// Inline tokens are escaped independently, so content cannot inject tags or attributes.
function inline(source: string, resolve: Resolver, depth = 0): string {
  if (depth > 8) return escapeHTML(source);
  let result = '', cursor = 0;
  const token = /`([^`\n]+)`|\[\[([^\]\n]+)\]\]|\[([^\]\n]+)\]\(([^\s)]+)(?:\s+"[^"]*")?\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_/g;
  for (const match of source.matchAll(token)) {
    result += escapeHTML(source.slice(cursor, match.index));
    if (match[1] !== undefined) result += `<code>${escapeHTML(match[1])}</code>`;
    else if (match[2] !== undefined) {
      const split = match[2].indexOf('|');
      const target = (split < 0 ? match[2] : match[2].slice(0, split)).trim();
      const label = split < 0 ? null : match[2].slice(split + 1).trim();
      const link = resolve(target, 'wiki');
      result += `<a data-page-link href="${escapeHTML(link.href)}">${inline(label || link.title, resolve, depth + 1)}</a>`;
    } else if (match[3] !== undefined) {
      const target = match[4];
      if (/^(?:https?:\/\/|mailto:)/i.test(target)) result += `<a href="${escapeHTML(target)}">${inline(match[3], resolve, depth + 1)}</a>`;
      else {
        if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(target)) throw new Error(`Unsafe link scheme: ${target}`);
        const link = resolve(target, 'markdown');
        result += `<a data-page-link href="${escapeHTML(link.href)}">${inline(match[3], resolve, depth + 1)}</a>`;
      }
    } else if (match[5] !== undefined || match[6] !== undefined) result += `<strong>${inline(match[5] ?? match[6], resolve, depth + 1)}</strong>`;
    else result += `<em>${inline(match[7] ?? match[8], resolve, depth + 1)}</em>`;
    cursor = match.index + match[0].length;
  }
  result += escapeHTML(source.slice(cursor));
  return result;
}

export function renderMarkdown(markdown: string, resolve: Resolver): string {
  const lines = stripComments(markdown).replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [], slugs = new Map<string, number>();
  let index = 0;
  const isBlock = (line: string) => /^\s*$|^#{1,6}\s|^\s*(```|~~~)|^\s*>|^\s*(?:[-+*]|\d+\.)\s|^\s*(?:---+|\*\*\*+)\s*$/.test(line);
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const fence = line.match(/^\s*(`{3,}|~{3,})([\w-]*)\s*$/);
    if (fence) {
      const body = []; index++;
      while (index < lines.length && !new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`).test(lines[index])) body.push(lines[index++]);
      if (index === lines.length) throw new Error('Unclosed code fence');
      index++;
      blocks.push(`<pre><code${fence[2] ? ` class="language-${escapeHTML(fence[2])}"` : ''}>${escapeHTML(body.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      const slug = headingId(heading[2]), count = slugs.get(slug) || 0;
      slugs.set(slug, count + 1);
      blocks.push(`<h${heading[1].length} id="${escapeHTML(slug + (count ? `-${count}` : ''))}">${inline(heading[2], resolve)}</h${heading[1].length}>`);
      index++; continue;
    }
    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) { blocks.push('<hr>'); index++; continue; }
    if (/^\s*>/.test(line)) {
      const body = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) body.push(lines[index++].replace(/^\s*>\s?/, ''));
      blocks.push(`<blockquote>${renderMarkdown(body.join('\n'), resolve)}</blockquote>`); continue;
    }
    const list = line.match(/^\s*([-+*]|\d+\.)\s+(.+)$/);
    if (list) {
      const ordered = /\d/.test(list[1]), items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-+*]|\d+\.)\s+(.+)$/);
        if (!item || /\d/.test(item[1]) !== ordered) break;
        items.push(`<li>${inline(item[2], resolve)}</li>`); index++;
      }
      blocks.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`); continue;
    }
    const paragraph = [line.trim()]; index++;
    while (index < lines.length && !isBlock(lines[index])) paragraph.push(lines[index++].trim());
    blocks.push(`<p>${inline(paragraph.join(' '), resolve)}</p>`);
  }
  return blocks.join('\n');
}

export async function compileHlcCorpus(contentRoot: string): Promise<Corpus> {
  const files = await markdownFiles(contentRoot), pages: SourcePage[] = [], byId = new Map<string, SourcePage>(), byName = new Map<string, SourcePage[]>(), hrefs = new Set<string>();
  for (const filename of files) {
    const id = filename.slice(0, -3);
    if (!/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(id)) throw new Error(`Use lowercase hyphenated Markdown paths: ${filename}`);
    const filenameHTML = id === 'home' ? 'index.html' : `${id.replaceAll('/', '--')}.html`;
    const href = hlcHref(id);
    if (hrefs.has(filenameHTML)) throw new Error(`Output filename collision: ${filenameHTML}`);
    hrefs.add(filenameHTML);
    const markdown = await readFile(path.join(contentRoot, filename), 'utf8'), clean = stripComments(markdown);
    const title = clean.match(/^#\s+(.+?)\s*#*$/m)?.[1];
    if (!title) throw new Error(`${filename}: one H1 page title is required`);
    let date;
    try { date = publishedDate(markdown); } catch (error) { throw new Error(`${filename}: ${error instanceof Error ? error.message : String(error)}`); }
    const page: SourcePage = {id, title, href, section:id.includes('/') ? id.split('/')[0] : 'start', publishedDate:date, wordCount:0, html:'', links:[], footer:'', markdown};
    byId.set(id, page);
    const basename = path.posix.basename(id); byName.set(basename, [...(byName.get(basename) || []), page]);
    pages.push(page);
  }
  if (!byId.has('home')) throw new Error('Corpus must contain home.md');
  pages.sort((a, b) => a.id === 'home' ? -1 : b.id === 'home' ? 1 : a.id.localeCompare(b.id));
  for (const page of pages) {
    const resolve: Resolver = (raw, kind) => {
      let target;
      try { target = decodeURIComponent(raw); } catch { throw new Error(`${page.id}: invalid encoded link ${raw}`); }
      if (target.includes('\\') || target.includes('\0') || /^(?:[a-z][\w+.-]*:|\/)/i.test(target)) throw new Error(`${page.id}: unsafe local link ${raw}`);
      const hashAt = target.indexOf('#'), fragment = hashAt < 0 ? '' : target.slice(hashAt + 1);
      target = (hashAt < 0 ? target : target.slice(0, hashAt)).replace(/\.md$/i, '');
      let dest;
      if (!target) dest = page;
      else if (kind === 'markdown') {
        const relative = path.posix.normalize(path.posix.join(path.posix.dirname(page.id), target));
        if (relative === '..' || relative.startsWith('../')) throw new Error(`${page.id}: link escapes corpus ${raw}`);
        dest = byId.get(relative);
      } else {
        if (target.split('/').some(segment => segment === '.' || segment === '..')) throw new Error(`${page.id}: wiki links must use corpus-root paths: ${raw}`);
        dest = byId.get(target);
        if (!dest && !target.includes('/')) {
          const matches = byName.get(target) || [];
          if (matches.length > 1) throw new Error(`${page.id}: ambiguous wikilink ${raw}`);
          dest = matches[0];
        }
      }
      if (!dest) throw new Error(`${page.id}: broken ${kind} link ${raw}`);
      if (!page.links.includes(dest.id)) page.links.push(dest.id);
      return {...dest, href:dest.href + (fragment ? `#${headingId(fragment)}` : '')};
    };
    page.html = renderMarkdown(page.markdown || '', resolve);
    page.wordCount = visibleWordCount(page.html);
    delete page.markdown;
  }
  // Page-end navigation repeats the source's graph edges. A Home shortcut
  // absent from the source is explicitly a jump, never a fabricated edge.
  for (const page of pages) {
    const home = byId.get('home')!;
    const links = [`<a ${page.links.includes('home') ? 'data-page-link' : 'data-jump="home"'} href="${escapeHTML(home.href)}">Home</a>`];
    for (const id of page.links) {
      if (id === 'home') continue;
      const dest = byId.get(id)!;
      links.push(`<a data-page-link href="${escapeHTML(dest.href)}">${escapeHTML(dest.title)}</a>`);
    }
    page.footer = `<nav class="page-end" aria-label="Page links">${links.join(' ')}</nav>`;
  }
  return {version:3, title:"HLC field notes", siteSlug:"hlc", homeId:"home", pages, status:{kind:"ready"}, source:{kind:"markdown"}};
}

export async function getHlcCorpus(): Promise<Corpus> {
  return compileHlcCorpus(path.join(process.cwd(), "content/hlc"));
}
