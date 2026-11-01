// hx generated 261101 — one-time, create-only import of the approved public HLC adaptations.
// Re-running verifies existing bytes; it never overwrites a divergent maintained copy.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prototype = path.resolve(process.argv[2] || path.join(root, '../sitemap'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function files(dir, prefix = '') {
  const entries = [];
  for (const name of (await readdir(dir)).sort()) {
    const relative = prefix ? `${prefix}/${name}` : name;
    const stat = await lstat(path.join(dir, name));
    if (stat.isSymbolicLink()) throw new Error(`Refusing symlink ${relative}`);
    if (stat.isDirectory()) entries.push(...await files(path.join(dir, name), relative));
    else if (stat.isFile() && name.endsWith('.md')) entries.push(relative);
  }
  return entries;
}
async function createOrVerify(destination, bytes) {
  await mkdir(path.dirname(destination), {recursive:true});
  try {
    const stat = await lstat(destination);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected regular file: ${destination}`);
    if (!Buffer.from(await readFile(destination)).equals(Buffer.from(bytes))) throw new Error(`Preserve divergent maintained file: ${destination}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(destination, bytes, {flag:'wx'});
  }
}

const sourceRoot = path.join(prototype, 'hlc-1');
const sourceFiles = await files(sourceRoot);
if (sourceFiles.length !== 34) throw new Error('Expected the approved 34-page HLC corpus.');
const rows = [];
for (const relative of sourceFiles) {
  const bytes = await readFile(path.join(sourceRoot, relative));
  await createOrVerify(path.join(root, 'content/hlc', relative), bytes);
  rows.push({source:`work/sitemap/hlc-1/${relative}`, destination:`content/hlc/${relative}`, bytes:bytes.length, sha256:sha256(bytes)});
}
const compilerPath = path.join(prototype, 'src/tools/compile.mjs');
const { compileCorpus } = await import(pathToFileURL(compilerPath).href);
const { data } = await compileCorpus({contentRoot:sourceRoot, write:false});
if (data.pages.length !== 34 || data.pages.reduce((sum, page) => sum + page.links.length, 0) !== 132) throw new Error('Approved content topology changed.');
await createOrVerify(path.join(root, 'tests/content/fixtures/hlc-baseline.json'), JSON.stringify(data, null, 2) + '\n');
const manifest = {
  _generated:'hx generated 261101 — approved Barthes first-pass public-corpus import',
  schema:'barthes-content-provenance-1',
  maintainedSource:'content/hlc',
  preservedPrototype:'work/sitemap/hlc-1',
  boundary:'Only the 34 already-published HLC adaptation Markdown files. Underlying vault notes are not imported.',
  transformation:'Markdown copied byte-for-byte. Compiler adapted to TypeScript and /s/hlc routes; content and stable source IDs preserved. tests/content/fixtures/hlc-baseline.json retains original compiled output for parity checks.',
  compiler:{source:'work/sitemap/src/tools/compile.mjs', sha256:sha256(await readFile(compilerPath)), destination:'src/lib/content/hlc.ts'},
  pages:34,
  directedEdges:132,
  files:rows,
};
await createOrVerify(path.join(root, 'provenance/content-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Verified/imported ${rows.length} public HLC files and ${manifest.directedEdges} authored edges.`);
