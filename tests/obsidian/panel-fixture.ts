// hx generated 261101 — deterministic DOM harness; no remote service access.
import { renderPanel, type PanelActions, type PanelModel } from '../../packages/obsidian/panel';
const host = document.querySelector<HTMLElement>('#panel')!;
const calls: {action:string; payload:unknown}[] = [];
const model: PanelModel = {
  connected: true, accountName: 'Desmond', folders: ['net-a', 'net-a/nested', 'net-b'],
  channels: [{id:'10',title:'Reading notes'},{id:'20',title:'A channel with a longer title that must remain readable'}],
  publisherDevice: true, conflictsCount: 1,
  nets: [
    {id:'a',title:'Reading notes',folder:'net-a',channelId:'10',paused:false,autoSync:false,hasPublished:true,status:'Changes pending'},
    {id:'b',title:'A second net with a long title',folder:'net-b',channelId:'20',paused:true,autoSync:false,hasPublished:false},
  ],
  plan: {netId:'a',createdAt:'2026-11-01T21:00:00Z',blockers:[],entries:[
    {noteId:'a1',path:'net-a/First note.md',title:'First note',action:'push',local:'A local revision with a link to [[Second note]].',remote:{id:'11',title:'First note',content:'An earlier revision.'},issues:[]},
    {noteId:'a2',path:'net-a/Second note.md',title:'Second note',action:'conflict',local:'The local version.\n<script>window.untrustedRan = true</script>',remote:{id:'12',title:'Second note',content:'A remote edit.\n<img src=x onerror="window.untrustedRan=true">'},issues:[]},
    {noteId:'a3',path:'net-a/Third note.md',title:'Third note',action:'pull',local:'An unchanged local note.',remote:{id:'13',title:'Third note',content:'A new Are.na revision.'},issues:[]},
  ]},
};
const log = (action:string,payload:unknown = null) => { calls.push({action,payload}); };
const actions: PanelActions = {
  connect:()=>log('connect'),disconnect:()=>log('disconnect'),refreshChannels:()=>log('refreshChannels'),
  addNet:input=>log('addNet',input),review:net=>log('review',net),pause:(net,value)=>log('pause',{net,value}),
  setSource:(net,folder)=>log('setSource',{net,folder}),
  autoSync:(net,value)=>log('autoSync',{net,value}),openNet:net=>log('openNet',net),
  publish:plan=>log('publish',plan.netId),pull:plan=>log('pull',plan.netId),
  resolve:(plan,note,choice)=>log('resolve',{net:plan.netId,note,choice}),openNote:path=>log('openNote',path),
  setPublisherDevice:value=>log('publisherDevice',value),exportState:()=>log('exportState'),importState:file=>log('importState',file.name),
};
function render() { renderPanel(host,model,actions); }
Object.assign(window,{barthesFixture:{model,calls,render,actions}});
render();
