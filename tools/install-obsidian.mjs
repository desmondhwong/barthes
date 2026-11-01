// hx generated — install only generated plugin files in an explicitly chosen vault.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const vault=process.argv[2];
if(!vault)throw new Error('Pass the absolute path of the development vault.');
const root=resolve(vault);
await access(join(root,'.obsidian'));
const destination=join(root,'.obsidian/plugins/barthes');
await mkdir(destination,{recursive:true});
for(const name of ['main.js','manifest.json','styles.css']){
  const bytes=await readFile(`packages/obsidian/dist/${name}`);
  const target=join(destination,name);
  try{await readFile(target);}catch(error){if(error.code!=='ENOENT')throw error;}
  await writeFile(target,bytes);
  if(!bytes.equals(await readFile(target)))throw new Error(`Verification failed: ${name}`);
}
console.log('Installed and verified main.js, manifest.json and styles.css; saved plugin data untouched.');
