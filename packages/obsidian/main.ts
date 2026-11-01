// hx generated 261101 — Barthes Obsidian publishing client.
import { ItemView, Notice, Plugin, TFile, TFolder, type WorkspaceLeaf } from 'obsidian';
import { request as httpsRequest } from 'node:https';
import { SyncEngine, createSyncState, validateSyncState, ArenaClient, createAuthorization, exchangeAuthorization, type SyncState, type SyncPlan, type NetMapping } from '../sync';
import { renderPanel, type PanelModel, type PanelActions } from './panel';

const VIEW = 'barthes-publishing';
const CLIENT_ID = '_AyviNSTkchdBaoVz5SnOcq9j8oPL7sA29VegMzKEvI';
const REDIRECT = 'obsidian://barthes-auth';
const DEFAULT_READER = 'https://barthes-git-feat-first-pass-desmondhwong.vercel.app';
type Stored = { version: 1; sync: SyncState; account?: {id:string;name:string}; publisherDeviceId?: string; readerOrigin?: string };

/** Desktop native HTTPS: fixed host, bounded body, cancellation, no redirects. */
const arenaFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== 'https://api.are.na') throw new Error('Unexpected authorization destination.');
  const headers = Object.fromEntries(new Headers(init?.headers).entries());
  return new Promise<Response>((resolve,reject)=>{
    const request=httpsRequest(url,{method:init?.method??'GET',headers,signal:init?.signal??undefined},response=>{
      let size=0;const chunks:Buffer[]=[];
      response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>8_000_000){request.destroy(new Error('Response exceeds the sync limit.'));return;}chunks.push(chunk);});
      response.on('error',reject);
      response.on('end',()=>{
        const responseHeaders=new Headers();
        for(const [name,value] of Object.entries(response.headers))if(value)responseHeaders.set(name,Array.isArray(value)?value.join(', '):value);
        resolve(new Response(Buffer.concat(chunks).toString('utf8'),{status:response.statusCode||502,headers:responseHeaders}));
      });
    });
    request.on('error',reject);
    if(typeof init?.body==='string')request.write(init.body);
    request.end();
  });
};

export default class BarthesPlugin extends Plugin {
  data!: Stored;
  engine!: SyncEngine;
  model!: PanelModel;
  private tokenKey = '';
  private pendingKey = '';
  private deviceId = '';
  private busy = false;
  private timer?: number;
  private currentPlan: SyncPlan | null = null;
  private channels: PanelModel['channels'] = [];
  private statuses = new Map<string,string>();
  private saveTail: Promise<void> = Promise.resolve();
  private renameTail: Promise<void> = Promise.resolve();
  private ready = false;

  async onload() {
    const stored = await this.loadData();
    try {
      if (stored != null) {
        if (stored.version !== 1 || !stored.sync) throw new Error('Unsupported saved Barthes settings.');
        validateSyncState(stored.sync);
        this.data = stored;
      } else this.data = {version:1, sync:createSyncState()};
    } catch {
      new Notice('Barthes saved state could not be read. It has been preserved. Restore a valid state file before enabling publishing.', 0);
      return;
    }
    this.tokenKey = `barthes-token-${this.data.sync.vaultId}`;
    this.pendingKey = `barthes-pending-${this.data.sync.vaultId}`;
    try {
      this.deviceId = localStorage.getItem('barthes-device-id') || crypto.randomUUID();
      localStorage.setItem('barthes-device-id',this.deviceId);
    } catch { this.deviceId = ''; }
    this.rebuildEngine();
    this.registerView(VIEW, leaf => new BarthesView(leaf,this));
    this.addRibbonIcon('network','Barthes',()=>void this.openPanel());
    this.addCommand({id:'open-publishing',name:'Open publishing',callback:()=>void this.openPanel()});
    this.addCommand({id:'review-changes',name:'Review changes',callback:()=>void this.reviewFirst()});
    this.addCommand({id:'connect-arena',name:'Connect Are.na',callback:()=>void this.perform(()=>this.connect())});
    this.addCommand({id:'pause-all',name:'Pause all synchronization',callback:()=>void this.perform(async()=>{
      for(const net of this.data.sync.nets) await this.engine.setNetOptions(net.id,{paused:true});
    })});
    this.registerObsidianProtocolHandler('barthes-auth', params=>void this.perform(()=>this.finishAuthorization(params)));
    this.registerEvent(this.app.vault.on('rename',(file,oldPath)=>{
      this.renameTail = this.renameTail.then(async()=>{await this.waitUntilIdle();await this.engine.rename(oldPath,file.path);this.invalidate();}).catch(()=>this.message('A rename needs review.','error'));
    }));
    this.registerEvent(this.app.vault.on('create',()=>this.invalidate()));
    this.registerEvent(this.app.vault.on('modify',()=>this.invalidate()));
    this.registerEvent(this.app.vault.on('delete',()=>this.invalidate()));
    this.registerInterval(window.setInterval(()=>void this.autoTick(),60_000));
    this.ready = true;
    await this.persist();
  }
  onunload() { if(this.timer)window.clearTimeout(this.timer); }
  private async waitUntilIdle() { while(this.busy) await new Promise(resolve=>window.setTimeout(resolve,100)); }
  private client() { return new ArenaClient(this.app.secretStorage.getSecret(this.tokenKey) || '',arenaFetch); }
  private connected() { return Boolean(this.app.secretStorage.getSecret(this.tokenKey)); }
  private rebuildEngine() {
    const vault = this.app.vault;
    this.engine = new SyncEngine({state:this.data.sync, remote:this.client(), persist:()=>this.persist(), vault:{
      listNotes:async()=>Promise.all(vault.getMarkdownFiles().map(async file=>({path:file.path,content:await vault.read(file)}))),
      read:async path=>{const file=vault.getAbstractFileByPath(path);return file instanceof TFile ? vault.read(file) : null;},
      write:async(path,content,expected)=>{
        const file=vault.getAbstractFileByPath(path);
        if(!(file instanceof TFile))throw new Error('The local note moved or was removed. Review again.');
        await vault.process(file,current=>{if(current!==expected)throw new Error('The local note changed. Review again.');return content;});
      },
      resolveLink:(source,target)=>this.app.metadataCache.getFirstLinkpathDest(target,source)?.path ?? null,
    }});
  }
  private persist() {
    const snapshot=JSON.parse(JSON.stringify(this.data));
    this.saveTail=this.saveTail.catch(()=>{}).then(()=>this.saveData(snapshot));
    return this.saveTail;
  }
  private invalidate() {
    this.currentPlan=null;
    for(const net of this.data.sync.nets)this.statuses.set(net.id,net.paused?'Paused':'Changes pending');
    this.refresh();
    if(this.timer)window.clearTimeout(this.timer);
    this.timer=window.setTimeout(()=>void this.autoTick(),3000);
  }
  async openPanel() {
    let leaf=this.app.workspace.getLeavesOfType(VIEW)[0];
    if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:VIEW,active:true});}
    await this.app.workspace.revealLeaf(leaf);
    this.refresh();
  }
  private async reviewFirst(){await this.openPanel();if(this.data.sync.nets[0])await this.perform(()=>this.review(this.data.sync.nets[0].id));}
  private message(text:string,kind:'error'|'message'='message') {this.model={...this.getModel(),[kind]:text};this.refresh(false);}
  getModel(): PanelModel {
    return {connected:this.connected(),accountName:this.data.account?.name,busy:this.busy,
      folders:this.app.vault.getAllLoadedFiles().filter((file):file is TFolder=>file instanceof TFolder && file.path!=='/').map(file=>file.path).sort(),
      channels:this.channels,nets:this.data.sync.nets.map(net=>({...net,status:this.statuses.get(net.id) || (net.paused?'Paused':net.hasPublished?'Review changes':'Not published')})),
      publisherDevice:Boolean(this.deviceId&&this.data.publisherDeviceId===this.deviceId),plan:this.currentPlan,conflictsCount:this.data.sync.conflicts.length};
  }
  refresh(clear=true){if(!this.data)return;if(clear)this.model=this.getModel();for(const leaf of this.app.workspace.getLeavesOfType(VIEW))(leaf.view as BarthesView).render();}
  async perform(operation:()=>Promise<void>) {
    if(this.busy)return;
    this.busy=true;this.refresh();
    try{await operation();this.busy=false;this.refresh();}
    catch(error){
      this.busy=false;
      const wait=error&&typeof error==='object'&&'retryAfterSeconds' in error?error.retryAfterSeconds:undefined;
      const detail=error instanceof Error?error.message:'The operation failed. Your saved work is retained.';
      this.message(detail+(typeof wait==='number'?` Try again in ${wait} seconds.`:''),'error');
    }
  }
  private async connect() {
    const {url,pending}=await createAuthorization(CLIENT_ID,REDIRECT);
    this.app.secretStorage.setSecret(this.pendingKey,JSON.stringify(pending));
    window.open(url,'_blank');
    new Notice('Authorize Barthes in your browser, then return to Obsidian.');
  }
  private async finishAuthorization(params:Record<string,string>) {
    const raw=this.app.secretStorage.getSecret(this.pendingKey);
    if(!raw)throw new Error('This connection request is no longer active. Choose Connect Are.na again.');
    this.app.secretStorage.setSecret(this.pendingKey,'');
    const token=await exchangeAuthorization(params,JSON.parse(raw),arenaFetch);
    const client=new ArenaClient(token,arenaFetch), user=await client.getCurrentUser();
    if(this.data.account && this.data.account.id!==String(user.id) && this.data.sync.nets.length)throw new Error('These nets belong to another account. Reconnect the original Are.na account.');
    this.app.secretStorage.setSecret(this.tokenKey,token);
    this.data.account={id:String(user.id),name:user.name};
    this.rebuildEngine();await this.persist();await this.refreshChannels();await this.openPanel();
  }
  private async refreshChannels(){this.channels=await this.client().listOwnChannels();}
  private async addNet(input:{folder:string;channelId?:string;title:string}) {
    // Reject overlapping local scopes before creating a remote channel.
    const folder=input.folder.replace(/^\/+|\/+$/g,'');
    if(this.data.sync.nets.some(net=>!folder||!net.folder||folder===net.folder||folder.startsWith(net.folder+'/')||net.folder.startsWith(folder+'/')))throw new Error('That folder overlaps an existing net. Choose a separate folder.');
    const source=folder?this.app.vault.getAbstractFileByPath(folder):this.app.vault.getRoot();
    if(!(source instanceof TFolder))throw new Error('Choose an existing folder.');
    const channel=input.channelId?await this.client().getChannel(input.channelId):await this.client().createChannel(input.title);
    if(channel.visibility==='private')throw new Error('Choose a publicly readable channel for this reader.');
    await this.engine.addNet({title:channel.title,folder,channelId:String(channel.id),channelSlug:channel.slug});
    await this.refreshChannels();
  }
  private async review(id:string){this.currentPlan=await this.engine.plan(id);this.statuses.set(id,this.currentPlan.blockers.length||this.currentPlan.entries.some(e=>e.action==='conflict')?'Needs attention':this.currentPlan.entries.every(e=>e.action==='unchanged')?'Up to date':'Changes pending');}
  private async autoTick() {
    if(!this.ready||this.busy||!this.connected()||!this.deviceId||this.data.publisherDeviceId!==this.deviceId)return;
    const nets=this.data.sync.nets.filter(net=>net.autoSync&&!net.paused&&net.hasPublished);
    if(!nets.length)return;
    await this.perform(async()=>{
      for(const net of nets){
        const plan=await this.engine.plan(net.id);
        // New notes always need explicit first-publication review.
        if(plan.blockers.length||plan.entries.some(e=>['conflict','create','missing'].includes(e.action))){this.statuses.set(net.id,'Needs attention');continue;}
        await this.engine.pull(plan);
        const outgoing=await this.engine.plan(net.id);
        if(outgoing.blockers.length||outgoing.entries.some(e=>['conflict','create','missing'].includes(e.action))){this.statuses.set(net.id,'Needs attention');continue;}
        await this.engine.publish(outgoing);
        this.statuses.set(net.id,'Up to date');
      }
      this.currentPlan=null;
    });
  }
  actions():PanelActions {
    const run=(fn:()=>Promise<void>)=>this.perform(fn);
    return {
      connect:()=>run(()=>this.connect()),
      disconnect:()=>run(async()=>{this.app.secretStorage.setSecret(this.tokenKey,'');this.app.secretStorage.setSecret(this.pendingKey,'');this.channels=[];this.rebuildEngine();}),
      refreshChannels:()=>run(()=>this.refreshChannels()),addNet:input=>run(()=>this.addNet(input)),
      setSource:(id,folder)=>run(async()=>{await this.engine.setNetFolder(id,folder);this.currentPlan=null;}),
      review:id=>run(()=>this.review(id)),pause:(id,paused)=>run(async()=>{await this.engine.setNetOptions(id,{paused});this.statuses.set(id,paused?'Paused':'Changes pending');}),
      autoSync:(id,autoSync)=>run(async()=>{if(autoSync&&(!this.deviceId||this.data.publisherDeviceId!==this.deviceId))throw new Error('Choose this device as the publisher first.');await this.engine.setNetOptions(id,{autoSync});}),
      openNet:id=>{const net=this.data.sync.nets.find(n=>n.id===id);if(net)window.open(`${this.readerOrigin()}/n/${encodeURIComponent(net.channelId)}`,'_blank');},
      publish:plan=>run(async()=>{await this.engine.publish(plan);await this.review(plan.netId);}),
      pull:plan=>run(async()=>{await this.engine.pull(plan);await this.review(plan.netId);}),
      resolve:(plan,id,resolution)=>run(async()=>{await this.engine.resolve(plan,id,resolution);await this.review(plan.netId);}),
      openNote:path=>this.app.workspace.openLinkText(path,'',true).then(()=>{}),
      setPublisherDevice:enabled=>run(async()=>{if(enabled&&!this.deviceId)throw new Error('Local device storage is unavailable. Automatic sync stays disabled.');this.data.publisherDeviceId=enabled?this.deviceId:undefined;await this.persist();}),
      exportState:()=>{const blob=new Blob([JSON.stringify({version:1,sync:this.data.sync,account:this.data.account},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='barthes-sync-state.json';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);},
      importState:file=>run(async()=>{
        if(file.size>20*1024*1024)throw new Error('The state file is too large.');
        const parsed=JSON.parse(await file.text());
        if(parsed.version!==1)throw new Error('Unsupported state file.');
        validateSyncState(parsed.sync);
        if(this.data.sync.nets.length)throw new Error('Import into an empty Barthes setup so current mappings are preserved.');
        if(this.data.account&&parsed.account&&this.data.account.id!==parsed.account.id)throw new Error('The file belongs to another Are.na account.');
        this.data.sync=parsed.sync;this.data.account=parsed.account;this.data.publisherDeviceId=undefined;
        for(const net of this.data.sync.nets){net.paused=true;net.autoSync=false;}
        // Import carries no secrets and never starts synchronization.
        this.app.secretStorage.setSecret(this.tokenKey,'');
        this.app.secretStorage.setSecret(this.pendingKey,'');
        this.tokenKey=`barthes-token-${this.data.sync.vaultId}`;this.pendingKey=`barthes-pending-${this.data.sync.vaultId}`;
        this.app.secretStorage.setSecret(this.tokenKey,'');
        this.app.secretStorage.setSecret(this.pendingKey,'');
        this.rebuildEngine();await this.persist();this.currentPlan=null;
      }),
    };
  }
  private readerOrigin(){try{const u=new URL(this.data.readerOrigin||DEFAULT_READER);if(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))return u.origin;}catch{}return DEFAULT_READER;}
}

class BarthesView extends ItemView {
  constructor(leaf:WorkspaceLeaf,private plugin:BarthesPlugin){super(leaf);}
  getViewType(){return VIEW;}
  getDisplayText(){return 'Barthes';}
  getIcon(){return 'network';}
  async onOpen(){this.render();}
  render(){renderPanel(this.contentEl,this.plugin.model||this.plugin.getModel(),this.plugin.actions());}
}
