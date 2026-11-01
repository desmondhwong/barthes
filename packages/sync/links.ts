// hx generated 261101 — scoped Markdown links, preserving source bytes elsewhere.
import type { NoteMapping, SyncIssue, VaultPort } from "./types";

export function normalizedPath(path: string): string {
  const raw = path.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (raw.includes("//") || raw.split("/").some(part => part === ".." || part === "." || part.startsWith(".") || /[\u0000-\u001f]/.test(part))) {
    throw new Error("Choose an ordinary vault folder; hidden and relative paths are excluded.");
  }
  return raw;
}
export function withinFolder(path: string, folder: string): boolean {
  return !path.split("/").some(part => part.startsWith(".")) && (!folder || path.startsWith(`${folder}/`));
}
export function titleFromPath(path: string): string { return path.split("/").at(-1)!.replace(/\.md$/i, ""); }

type Span = { start: number; end: number; target: string; label: string; kind: "wiki" | "markdown" | "embed" | "image" };

/** Scan authoring syntax only outside fenced/indented/inline code and comments.
 * Unsupported reference syntax is a visible blocker instead of a silent rewrite. */
function scan(markdown: string): { spans: Span[]; issues: SyncIssue[] } {
  const spans: Span[] = [], issues: SyncIssue[] = [];
  const masked = markdown.split("");
  const hide = (start: number, end: number) => { for (let i = start; i < end; i++) if (masked[i] !== "\n") masked[i] = " "; };
  // String offsets are UTF-16, as are Obsidian and JavaScript string slices.
  let fence: { char: string; length: number } | undefined, offset = 0;
  for (const line of markdown.split(/(?<=\n)/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      hide(offset, offset + line.length);
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && /^\s*$/.test(line.slice(marker[0].length))) fence = undefined;
    } else if (marker) { fence = {char:marker[1][0], length:marker[1].length}; hide(offset, offset + line.length); }
    else if (/^(?: {4}|\t)/.test(line)) hide(offset, offset + line.length);
    offset += line.length;
  }
  let visible = masked.join("");
  for (const match of visible.matchAll(/<!--[\s\S]*?(?:-->|$)/g)) hide(match.index!, match.index! + match[0].length);
  visible = masked.join("");
  for (const match of visible.matchAll(/(`+)([^`]|`(?!\1))*?\1/g)) hide(match.index!, match.index! + match[0].length);
  visible = masked.join("");
  // Raw HTML can carry local file references that this publication format cannot translate.
  if (/<(?:img|a|iframe|video|audio|source|embed|object)\b/i.test(visible)) issues.push({kind:"unsupported", message:"HTML links and embedded media need conversion to ordinary Markdown before publishing."});
  if (/^ {0,3}\[[^\]\n]+\]:/m.test(visible) || /\[[^\]\n]+\]\s*\[[^\]\n]*\]/.test(visible.replace(/!?\[\[[^\]]*\]\]/g, ""))) issues.push({kind:"unsupported", message:"Reference-style Markdown links need conversion to inline links before publishing."});
  for (let i = 0; i < visible.length; i++) {
    if (visible[i] === "\\") { i++; continue; }
    const start = i, image = visible[i] === "!";
    let at = image ? i + 1 : i;
    if (visible.slice(at, at + 2) === "[[") {
      const end = visible.indexOf("]]", at + 2);
      if (end === -1) continue;
      const inner = markdown.slice(at + 2, end), split = inner.indexOf("|");
      const target = split === -1 ? inner : inner.slice(0, split), label = split === -1 ? target : inner.slice(split + 1);
      spans.push({start, end:end + 2, target, label, kind:image ? "embed" : "wiki"}); i = end + 1; continue;
    }
    if (visible[at] !== "[") continue;
    let labelEnd = at + 1, depth = 1;
    for (; labelEnd < visible.length; labelEnd++) {
      if (visible[labelEnd] === "\\") { labelEnd++; continue; }
      if (visible[labelEnd] === "[") depth++;
      if (visible[labelEnd] === "]" && --depth === 0) break;
    }
    if (depth !== 0 || visible[labelEnd + 1] !== "(") continue;
    let end = labelEnd + 2, parens = 1;
    for (; end < visible.length; end++) {
      if (visible[end] === "\\") { end++; continue; }
      if (visible[end] === "(") parens++;
      if (visible[end] === ")" && --parens === 0) break;
    }
    if (parens !== 0) continue;
    const destination = markdown.slice(labelEnd + 2, end).trim();
    let target = destination;
    if (target.startsWith("<")) { const close = target.indexOf(">"); if (close < 0) continue; target = target.slice(1, close); }
    else target = target.replace(/\s+["'][\s\S]*["']\s*$/, "");
    spans.push({start, end:end + 1, target:target.replace(/\\([() ])/g, "$1"), label:markdown.slice(at + 1, labelEnd), kind:image ? "image" : "markdown"}); i = end;
  }
  return {spans, issues};
}

function splitTarget(target: string): {path: string; fragment: string} {
  const index = target.indexOf("#");
  return index < 0 ? {path:target, fragment:""} : {path:target.slice(0, index), fragment:target.slice(index)};
}
function plainLabel(label: string): string { return label.replace(/[\\[\]]/g, "\\$&"); }
function headingFragment(fragment: string): string {
  if (!fragment) return "";
  let value = fragment.slice(1);
  try { value = decodeURIComponent(value); } catch { /* Keep authored text. */ }
  // Match the reader's heading IDs, including its treatment of Markdown marks.
  return "#" + value.toLowerCase().replace(/[`*_]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
}

export function publishMarkdown(markdown: string, sourcePath: string, notes: readonly NoteMapping[], vault: Pick<VaultPort, "resolveLink">, allowUnassigned = false): {content: string; issues: SyncIssue[]} {
  const {spans, issues} = scan(markdown), replacements: {start:number;end:number;text:string}[] = [];
  const selected = new Map(notes.map(note => [note.path, note]));
  for (const span of spans) {
    const external = /^(?:https?:|mailto:|tel:)/i.test(span.target);
    if (span.kind === "embed" || span.kind === "image") {
      issues.push({kind:span.kind === "embed" ? "embed" : "attachment", target:span.target, message:`Embedded content is not published in this version: ${span.target}`}); continue;
    }
    if (external && span.kind === "markdown") continue;
    if (/^[a-z][a-z\d+.-]*:/i.test(span.target) || span.target.startsWith("//")) {
      issues.push({kind:"unsupported",target:span.target,message:`Unsupported link address: ${span.target}`}); continue;
    }
    if (span.kind === "markdown" && span.target.startsWith("#")) continue;
    const {path:rawPath, fragment} = splitTarget(span.target);
    if (fragment.startsWith("#^")) { issues.push({kind:"unsupported",target:span.target,message:`Block references are not published in this version: ${span.target}`}); continue; }
    let decoded = rawPath;
    try { decoded = decodeURIComponent(rawPath); } catch { /* Resolver reports unknown. */ }
    const path = decoded ? vault.resolveLink(sourcePath, decoded) : sourcePath;
    if (!path) { issues.push({kind:"unresolved",target:span.target,message:`Unresolved link: ${span.target}`}); continue; }
    if (!/\.md$/i.test(path)) { issues.push({kind:"attachment",target:span.target,message:`Attachment publishing is not available: ${span.target}`}); continue; }
    const target = selected.get(path);
    if (!target) { issues.push({kind:"outside",target:span.target,message:`Link leaves the selected folder: ${span.target}`}); continue; }
    if (!target.blockId) {
      if (!allowUnassigned) issues.push({kind:"unresolved",target:span.target,message:`The linked note has not received its Are.na identity: ${span.target}`});
      continue;
    }
    replacements.push({start:span.start,end:span.end,text:`[${span.kind === "wiki" ? plainLabel(span.label) : span.label}](https://www.are.na/block/${target.blockId}${span.kind === "wiki" ? headingFragment(fragment) : fragment})`});
  }
  let content = markdown;
  for (const replacement of replacements.reverse()) content = content.slice(0, replacement.start) + replacement.text + content.slice(replacement.end);
  return {content, issues};
}

export function pullMarkdown(markdown: string, notes: readonly NoteMapping[]): string {
  const {spans} = scan(markdown), byBlock = new Map(notes.filter(note => note.blockId).map(note => [note.blockId!, note]));
  let content = markdown;
  for (const span of spans.reverse()) {
    if (span.kind !== "markdown") continue;
    const match = /^https:\/\/(?:www\.)?are\.na\/block\/([1-9]\d*)(#[^?]*)?$/.exec(span.target);
    const note = match && byBlock.get(match[1]);
    if (!match || !note) continue;
    let fragment = match[2] || "";
    if (fragment) {
      let requested = fragment;
      try { requested = decodeURIComponent(fragment); } catch { continue; }
      const headings = [...(note.baseLocal || "").matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)];
      const matching = headings.filter(heading => headingFragment(`#${heading[1]}`) === requested);
      // Retain the working source link when its local heading cannot be resolved
      // unambiguously; an invented wikilink fragment would break navigation.
      if (matching.length !== 1) continue;
      fragment = `#${matching[0][1]}`;
    }
    const target = note.path.replace(/\.md$/i, "") + fragment;
    const replacement = `[[${target}|${span.label.replace(/\\([\[\]\\])/g, "$1")}]]`;
    content = content.slice(0, span.start) + replacement + content.slice(span.end);
  }
  return content;
}
