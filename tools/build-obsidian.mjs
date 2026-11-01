// hx generated — reproducible native plugin bundle; does not install it.
import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
const out='packages/obsidian/dist';
await mkdir(out,{recursive:true});
await build({entryPoints:['packages/obsidian/main.ts'],outfile:`${out}/main.js`,bundle:true,platform:'node',format:'cjs',target:'es2022',external:['obsidian'],sourcemap:false,banner:{js:'// Barthes 0.2.0 — generated from maintained source.'}});
for(const file of ['manifest.json','styles.css'])await copyFile(`packages/obsidian/${file}`,`${out}/${file}`);
console.log(`Built ${out}`);
