// hx generated 261101 — plugin controller regressions with the public Obsidian boundary mocked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';

class TFile { constructor(path) { this.path=path; } }
class TFolder { constructor(path) { this.path=path; } }
const notices=[];
const requests=[];
class Plugin {
  constructor(app) { this.app=app; this.commands=[]; this.views=[]; this.protocols=[]; }
  async loadData(){ return this.app.stored; }
  async saveData(data){this.app.saves.push(structuredClone(data));}
  registerView(type,factory){this.views.push({type,factory});}
  addCommand(command){this.commands.push(command);}
  registerObsidianProtocolHandler(name,callback){this.protocols.push({name,callback});}
  addRibbonIcon(){}
  registerEvent(){}
  registerInterval(){}
}
const mock={Plugin,TFile,TFolder,ItemView:class{},Notice:class{constructor(message){notices.push(message);}},requestUrl:async request=>{requests.push(request);throw new Error('Unexpected network request in controller test.');}};
const output=buildSync({entryPoints:['packages/obsidian/main.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['obsidian'],logLevel:'silent'}).outputFiles[0].text;
const module={exports:{}};
const nativeRequire=createRequire(import.meta.url);
new Function('require','module','exports',output)(id=>id==='obsidian'?mock:nativeRequire(id),module,module.exports);
const BarthesPlugin=module.exports.default;

function state(nets=[]){return {version:1,vaultId:'vault-controller-test',nets,notes:[],conflicts:[]};}
function net(){return {id:'net-a',title:'Net A',folder:'net-a',channelId:'10',paused:false,autoSync:true,hasPublished:true};}
function environment(stored=null,token='') {
  const storage=new Map(),secrets=new Map();
  if(token)secrets.set(`barthes-token-${stored.sync.vaultId}`,token);
  globalThis.window={setInterval:()=>1,setTimeout:()=>1,clearTimeout(){},open(){}};
  globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
  const app={stored,saves:[],secretStorage:{getSecret:key=>secrets.get(key)??null,setSecret:(key,value)=>secrets.set(key,value)},
    vault:{on:()=>({}),getMarkdownFiles:()=>[],getAllLoadedFiles:()=>[],getRoot:()=>new TFolder(''),getAbstractFileByPath:()=>null},
    metadataCache:{getFirstLinkpathDest:()=>null},workspace:{getLeavesOfType:()=>[]}};
  notices.length=0;requests.length=0;
  return {app,plugin:new BarthesPlugin(app),secrets,storage};
}
function plan(action='unchanged'){return {netId:'net-a',createdAt:'2026-11-01T21:00:00Z',blockers:[],entries:[{noteId:'note-a',path:'net-a/A.md',title:'A',action,local:'A',remote:{id:'11',title:'A',content:'A'},issues:[]}]};}

test('a fresh plugin loads without a token and registers the connection and publishing commands',async()=>{
  const {plugin,app}=environment();
  await plugin.onload();
  assert.equal(plugin.getModel().connected,false);
  assert.deepEqual(plugin.commands.map(command=>command.id),['open-publishing','review-changes','connect-arena','pause-all']);
  assert.equal(plugin.protocols[0].name,'barthes-auth');
  assert.equal(app.saves.length,1);
  assert.equal(requests.length,0);
});

test('invalid saved state is preserved without registering a publisher or making network requests',async()=>{
  const corrupt={version:1,sync:{version:999}};
  const {plugin,app}=environment(corrupt);
  await plugin.onload();
  assert.equal(app.stored,corrupt);
  assert.equal(app.saves.length,0);
  assert.equal(plugin.commands.length,0);
  assert.equal(requests.length,0);
  assert.match(notices[0],/preserved/);
});

test('invalid imported state preserves existing mappings, credentials and saved work',async()=>{
  const {plugin,app,secrets}=environment({version:1,sync:state([net()]),account:{id:'1',name:'Test'}},'local-test-token');
  await plugin.onload();
  const before=JSON.stringify(plugin.data), savedCount=app.saves.length;
  await plugin.actions().importState({size:26,text:async()=>'{"version":1,"sync":{}}'});
  assert.equal(JSON.stringify(plugin.data),before);
  assert.equal(app.saves.length,savedCount);
  assert.equal(secrets.get('barthes-token-vault-controller-test'),'local-test-token');
  assert.match(plugin.model.error,/state/i);
  assert.equal(requests.length,0);
});

test('even valid imports refuse to replace a setup with existing mappings',async()=>{
  const {plugin,app}=environment({version:1,sync:state([net()])});
  await plugin.onload();
  const before=JSON.stringify(plugin.data), savedCount=app.saves.length;
  await plugin.actions().importState({size:100,text:async()=>JSON.stringify({version:1,sync:state()})});
  assert.equal(JSON.stringify(plugin.data),before);
  assert.equal(app.saves.length,savedCount);
  assert.match(plugin.model.error,/empty Barthes setup/);
});

test('automatic sync rechecks the post-pull plan and never publishes a newly arrived note',async()=>{
  const {plugin}=environment({version:1,sync:state([net()])},'local-test-token');
  await plugin.onload();
  await plugin.actions().setPublisherDevice(true);
  const calls=[];
  plugin.engine={
    plan:async()=>{calls.push('plan');return plan(calls.filter(value=>value==='plan').length===1?'pull':'create');},
    pull:async()=>{calls.push('pull');},publish:async()=>{calls.push('publish');},
  };
  await plugin.autoTick();
  assert.deepEqual(calls,['plan','pull','plan']);
  assert.equal(plugin.getModel().nets[0].status,'Needs attention');
});

test('automatic sync stays idle without a device grant or while a net is paused',async()=>{
  const {plugin}=environment({version:1,sync:state([net()])},'local-test-token');
  await plugin.onload();
  let called=false;plugin.engine={plan:async()=>{called=true;return plan();}};
  await plugin.autoTick();
  assert.equal(called,false);
  await plugin.actions().setPublisherDevice(true);
  plugin.data.sync.nets[0].paused=true;
  await plugin.autoTick();
  assert.equal(called,false);
});
