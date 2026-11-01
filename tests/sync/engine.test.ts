// hx generated 261101 — user-work and interruption invariants.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSyncState, SyncEngine, validateSyncState } from "../../packages/sync/engine";
import { publishMarkdown, pullMarkdown } from "../../packages/sync/links";
import type { RemoteBlock, RemotePort, SyncState, VaultPort } from "../../packages/sync/types";

class MemoryRemote implements RemotePort {
  blocks = new Map<string,RemoteBlock>(); next = 1; createCalls = 0; updateCalls = 0;
  uncertain = false; failureBeforeCreate = false;
  async listBlocks() { return [...this.blocks.values()].map(block => structuredClone(block)); }
  async getBlock(id: string) { const block = this.blocks.get(id); if (!block) throw new Error("missing"); return structuredClone(block); }
  async createBlock(_channel: string, data: {title:string;content:string;metadata:Record<string,string>}) {
    this.createCalls++;
    if (this.failureBeforeCreate) throw new Error("offline");
    const block = {id:String(this.next++),...data}; this.blocks.set(block.id,block);
    if (this.uncertain) {this.uncertain=false; throw new Error("response lost");}
    return structuredClone(block);
  }
  async updateBlock(id: string,data:{title:string;content:string}) { this.updateCalls++; const block = {...this.blocks.get(id)!,...data}; this.blocks.set(id,block); return structuredClone(block); }
}
function fixture(input: Record<string,string>) {
  const files = new Map(Object.entries(input)), remote = new MemoryRemote(); let saved = createSyncState();
  const vault: VaultPort = {
    async listNotes() {return [...files].map(([path,content]) => ({path,content}));},
    async read(path) {return files.get(path) ?? null;},
    async write(path,content,expected) {assert.equal(files.get(path),expected,"atomic content check"); files.set(path,content);},
    resolveLink(source,target) {
      const variants = [target,`${target}.md`,`${source.slice(0,source.lastIndexOf("/")+1)}${target}`,`${source.slice(0,source.lastIndexOf("/")+1)}${target}.md`];
      for (const variant of variants) if (files.has(variant)) return variant;
      return [...files.keys()].find(path => path.split("/").at(-1) === `${target}.md`) ?? null;
    },
  };
  const state = createSyncState();
  const engine = new SyncEngine({state,vault,remote,persist:async next => {saved=structuredClone(next);}});
  return {files,remote,vault,state,engine,saved:()=>saved};
}

test("publishes a cyclic two-note net, persists identities, and performs no duplicate writes",async () => {
  const f = fixture({"net/A.md":"Hello [[B|Bee]].", "net/B.md":"Return [[A]].", "private.md":"Secret"});
  const net = await f.engine.addNet({title:"Net",folder:"net",channelId:"12"});
  const plan = await f.engine.plan(net.id);
  assert.deepEqual(plan.entries.map(entry=>entry.action),["create","create"]); assert.equal(plan.blockers.length,0);
  const result = await f.engine.publish(plan);
  assert.equal(result.created,2); assert.equal(result.pushed,2);
  assert.equal(f.remote.blocks.get("1")?.content,"Hello [Bee](https://www.are.na/block/2).");
  assert.equal(f.remote.blocks.get("2")?.content,"Return [A](https://www.are.na/block/1).");
  assert.equal(f.remote.createCalls,2); assert.equal(f.saved().notes.length,2);
  assert.ok(f.saved().nets[0].hasPublished);
  assert.equal(f.files.get("net/A.md"),"Hello [[B|Bee]].");
  const repeat = await f.engine.plan(net.id); assert.ok(repeat.entries.every(entry => entry.action === "unchanged"));
  await f.engine.publish(repeat); assert.equal(f.remote.createCalls,2); assert.equal(f.remote.updateCalls,2);
});

test("folder scope, attachments and embeds block publication without changing files or remote",async () => {
  const f = fixture({"net/A.md":"[[private]] ![[B]] ![image](a.png)","net/B.md":"B","private.md":"Secret","net/a.png":"binary"});
  const net=await f.engine.addNet({title:"Net",folder:"net",channelId:"12"});
  const plan=await f.engine.plan(net.id);
  assert.deepEqual(plan.entries[0].issues.map(issue=>issue.kind),["outside","embed","attachment"]);
  await assert.rejects(f.engine.publish(plan),/issues/); assert.equal(f.remote.createCalls,0); assert.equal(f.state.notes.length,2);
});

test("multiple separate nets and whole-vault overlap rules",async () => {
  const f = fixture({"a/A.md":"A","b/B.md":"B",".obsidian/private.md":"secret"});
  const a=await f.engine.addNet({title:"A",folder:"a",channelId:"1"});
  const b=await f.engine.addNet({title:"B",folder:"b",channelId:"2"});
  await assert.rejects(f.engine.addNet({title:"Root",folder:"",channelId:"3"}),/overlaps/);
  await assert.rejects(f.engine.addNet({title:"Child",folder:"a/child",channelId:"3"}),/overlaps/);
  await assert.rejects(f.engine.addNet({title:"Hidden",folder:".obsidian",channelId:"3"}),/hidden/);
  await assert.rejects(f.engine.addNet({title:"Traversal",folder:"a/../b",channelId:"3"}),/hidden/);
  assert.equal((await f.engine.plan(a.id)).entries.length,1); assert.equal((await f.engine.plan(b.id)).entries.length,1);
  const whole=fixture({"A.md":"A",".obsidian/private.md":"secret"}); const root=await whole.engine.addNet({title:"Whole",folder:"",channelId:"3"});
  assert.equal((await whole.engine.plan(root.id)).entries.length,1);
});

test("lost create response is recovered from remote metadata before any retry",async () => {
  const f = fixture({"net/A.md":"A"}); const net=await f.engine.addNet({title:"Net",folder:"net",channelId:"1"});
  f.remote.uncertain=true;
  await assert.rejects(f.engine.publish(await f.engine.plan(net.id)),/response lost/);
  assert.equal(f.saved().notes[0].pendingCreate,true); assert.equal(f.saved().notes[0].blockId,undefined);
  const restored = new SyncEngine({state:f.saved(),vault:f.vault,remote:f.remote,persist:async()=>{}});
  const retry=await restored.plan(net.id); assert.equal(retry.blockers.length,0); assert.equal(retry.entries[0].action,"push");
  await restored.publish(retry); assert.equal(f.remote.createCalls,1); assert.equal(f.remote.blocks.get("1")?.content,"A");
});

test("uncertain creation with no marker is a durable blocker, never a blind retry",async () => {
  const f=fixture({"net/A.md":"A"}); const net=await f.engine.addNet({title:"Net",folder:"net",channelId:"1"});
  f.remote.failureBeforeCreate=true;
  await assert.rejects(f.engine.publish(await f.engine.plan(net.id)),/offline/);
  f.remote.failureBeforeCreate=false;
  const plan=await f.engine.plan(net.id); assert.equal(plan.entries[0].issues[0].kind,"uncertain");
  await assert.rejects(f.engine.publish(plan),/issues/); assert.equal(f.remote.createCalls,1);
});

test("an explicitly rate-limited create can be retried after waiting",async()=>{
  const f=fixture({"net/A.md":"A"}); const net=await f.engine.addNet({title:"Net",folder:"net",channelId:"1"});
  const create=f.remote.createBlock.bind(f.remote);f.remote.createBlock=async()=>{throw Object.assign(new Error("wait"),{status:429});};
  await assert.rejects(f.engine.publish(await f.engine.plan(net.id)),/wait/);assert.equal(f.saved().notes[0].pendingCreate,false);
  f.remote.createBlock=create;await f.engine.publish(await f.engine.plan(net.id));assert.equal(f.remote.blocks.size,1);
});

test("altered mappings cannot overwrite an unrelated block in the selected channel",async()=>{
  const f=fixture({"net/A.md":"A"}); const net=await f.engine.addNet({title:"Net",folder:"net",channelId:"1"});
  await f.engine.publish(await f.engine.plan(net.id));f.remote.blocks.get("1")!.metadata={barthes_note_id:"another-note",barthes_net_id:net.id};
  f.files.set("net/A.md","Changed");const plan=await f.engine.plan(net.id);assert.equal(plan.entries[0].issues[0].kind,"uncertain");
  await assert.rejects(f.engine.publish(plan),/issues/);assert.equal(f.remote.blocks.get("1")!.content,"A");
});

test("a local edit after review cancels publication before remote writes",async () => {
  const f=fixture({"net/A.md":"A"}); const net=await f.engine.addNet({title:"Net",folder:"net",channelId:"1"});
  const plan=await f.engine.plan(net.id); f.files.set("net/A.md","Edited");
  await assert.rejects(f.engine.publish(plan),/changed after review/); assert.equal(f.remote.createCalls,0);
});

test("three-way pull preserves frontmatter and rewrites known remote links",async () => {
  const f=fixture({"net/A.md":"---\nprivate: yes\n---\nOriginal [[B]].","net/B.md":"B"}); const net=await f.engine.addNet({title:"Net",folder:"net",channelId:"1"});
  await f.engine.publish(await f.engine.plan(net.id));
  assert.ok(!f.remote.blocks.get("1")!.content.includes("private"));
  f.remote.blocks.get("1")!.content="Changed [B](https://www.are.na/block/2).";
  const plan=await f.engine.plan(net.id); assert.equal(plan.entries[0].action,"pull");
  await f.engine.pull(plan); assert.equal(f.files.get("net/A.md"),"---\nprivate: yes\n---\nChanged [[net/B|B]].");
  assert.ok((await f.engine.plan(net.id)).entries.every(entry=>entry.action==="unchanged"));
});

test("simultaneous edits preserve both versions and require an explicit resolution",async () => {
  const f=fixture({"net/A.md":"Original"}); const net=await f.engine.addNet({title:"Net",folder:"net",channelId:"1"});
  await f.engine.publish(await f.engine.plan(net.id)); f.files.set("net/A.md","Local change"); f.remote.blocks.get("1")!.content="Remote change";
  const plan=await f.engine.plan(net.id); assert.equal(plan.entries[0].action,"conflict");
  await assert.rejects(f.engine.publish(plan),/conflicting/); assert.equal(f.files.get("net/A.md"),"Local change");
  await f.engine.resolve(plan,plan.entries[0].noteId,"remote");
  assert.equal(f.files.get("net/A.md"),"Remote change"); assert.equal(f.saved().conflicts.length,1);
  assert.equal(f.saved().conflicts[0].local,"Local change"); assert.equal(f.saved().conflicts[0].remote,"Remote change");
});

test("keeping local resolves a conflict after preserving remote text",async () => {
  const f=fixture({"net/A.md":"Original"}); const net=await f.engine.addNet({title:"Net",folder:"net",channelId:"1"});
  await f.engine.publish(await f.engine.plan(net.id)); f.files.set("net/A.md","Local"); f.remote.blocks.get("1")!.content="Remote";
  const plan=await f.engine.plan(net.id); await f.engine.resolve(plan,plan.entries[0].noteId,"local");
  assert.equal(f.remote.blocks.get("1")!.content,"Local"); assert.equal(f.saved().conflicts[0].remote,"Remote");
});

test("remote changes after a pull review cannot overwrite local work",async () => {
  const f=fixture({"net/A.md":"A"}); const net=await f.engine.addNet({title:"Net",folder:"net",channelId:"1"});
  await f.engine.publish(await f.engine.plan(net.id)); f.remote.blocks.get("1")!.content="Remote";
  const plan=await f.engine.plan(net.id); f.remote.blocks.get("1")!.content="Remote again";
  await assert.rejects(f.engine.pull(plan),/Are.na changed/); assert.equal(f.files.get("net/A.md"),"A");
});

test("a disconnected block or private channel after review is not mutated",async()=>{
  const f=fixture({"net/A.md":"A"}); const net=await f.engine.addNet({title:"Net",folder:"net",channelId:"1"});
  await f.engine.publish(await f.engine.plan(net.id));f.files.set("net/A.md","New");const plan=await f.engine.plan(net.id);
  f.remote.listBlocks=async()=>[];await assert.rejects(f.engine.publish(plan),/left its channel/);assert.equal(f.remote.blocks.get("1")!.content,"A");
  f.remote.listBlocks=async()=>{throw new Error("channel is private");};await assert.rejects(f.engine.publish(plan),/private/);assert.equal(f.remote.blocks.get("1")!.content,"A");
});

test("frontmatter-only notes never publish their local metadata",async()=>{
  const f=fixture({"net/A.md":"---\nprivate: secret\n---"});const net=await f.engine.addNet({title:"Net",folder:"net",channelId:"1"});
  await f.engine.publish(await f.engine.plan(net.id));assert.equal(f.remote.blocks.get("1")!.content,"");assert.equal(f.files.get("net/A.md"),"---\nprivate: secret\n---");
});

test("rename retains IDs and moving out preserves remote with visible attention",async () => {
  const f=fixture({"net/A.md":"A"}); const net=await f.engine.addNet({title:"Net",folder:"net",channelId:"1"});
  await f.engine.publish(await f.engine.plan(net.id)); const before={...f.state.notes[0]};
  f.files.set("net/Renamed.md",f.files.get("net/A.md")!); f.files.delete("net/A.md"); await f.engine.rename("net/A.md","net/Renamed.md");
  const plan=await f.engine.plan(net.id); assert.equal(plan.entries[0].action,"push"); await f.engine.publish(plan);
  assert.equal(f.state.notes[0].id,before.id); assert.equal(f.state.notes[0].blockId,before.blockId); assert.equal(f.remote.blocks.get("1")!.title,"Renamed");
  f.files.set("outside.md","A"); f.files.delete("net/Renamed.md"); await f.engine.rename("net/Renamed.md","outside.md");
  const outside=await f.engine.plan(net.id); assert.equal(outside.entries[0].action,"missing"); assert.equal(outside.entries[0].issues[0].kind,"removed"); assert.equal(f.remote.blocks.size,1);
});

test("pause and automatic publishing remain explicit",async () => {
  const f=fixture({"A.md":"A"}); const net=await f.engine.addNet({title:"Net",folder:"",channelId:"1"});
  await assert.rejects(f.engine.setNetOptions(net.id,{autoSync:true}),/publish this net once/);
  await f.engine.setNetOptions(net.id,{paused:true}); await assert.rejects(f.engine.publish(await f.engine.plan(net.id)),/paused/);
  await f.engine.setNetOptions(net.id,{paused:false}); await f.engine.publish(await f.engine.plan(net.id));
  await f.engine.setNetOptions(net.id,{autoSync:true}); assert.equal(f.state.nets[0].autoSync,true);
});

test("state import rejects conflicting identities and unsupported versions",async () => {
  const f=fixture({"A.md":"A"}); const net=await f.engine.addNet({title:"Net",folder:"",channelId:"1"}); await f.engine.plan(net.id);
  assert.deepEqual(validateSyncState(f.state),f.state);
  const wrong=structuredClone(f.state); (wrong as unknown as {version:number}).version=2; assert.throws(()=>validateSyncState(wrong),/Unsupported/);
  const duplicate=structuredClone(f.state); duplicate.notes.push({...duplicate.notes[0]}); assert.throws(()=>validateSyncState(duplicate),/Invalid note/);
  const unsafe=structuredClone(f.state);unsafe.vaultId="invalid/secret";assert.throws(()=>validateSyncState(unsafe),/Unsupported/);
  const broken=structuredClone(f.state);broken.conflicts.push({id:"archive",noteId:broken.notes[0].id,path:"A.md",savedAt:"invalid-date",local:"a",remote:"b",remoteTitle:"A",resolution:"local"});assert.throws(()=>validateSyncState(broken),/Invalid conflict/);
});

test("moving a selected folder into another net pauses safely and survives restart",async()=>{
  const f=fixture({"a/A.md":"A","b/B.md":"B"});const a=await f.engine.addNet({title:"A",folder:"a",channelId:"1"});const b=await f.engine.addNet({title:"B",folder:"b",channelId:"2"});
  await f.engine.plan(a.id);await f.engine.plan(b.id);const identity=f.state.notes[0].id;
  f.files.set("b/a/A.md","A");f.files.delete("a/A.md");await f.engine.rename("a","b/a");
  assert.equal(f.state.notes.find(note=>note.id===identity)!.path,"b/a/A.md");
  assert.equal(a.folder,"a");assert.equal(a.pendingFolder,"b/a");assert.ok(a.sourceIssue);assert.ok(a.paused && b.paused);
  assert.doesNotThrow(()=>validateSyncState(f.saved()));await assert.rejects(f.engine.plan(a.id),/overlaps/);
  await assert.rejects(f.engine.setNetOptions(a.id,{paused:false}),/overlaps/);
  f.files.set("a/A.md","A");f.files.delete("b/a/A.md");await f.engine.rename("b/a","a");
  assert.equal(a.folder,"a");assert.equal(a.sourceIssue,undefined);assert.equal(b.sourceIssue,undefined);assert.equal(a.paused,true);
  assert.doesNotThrow(()=>validateSyncState(f.saved()));await f.engine.setNetOptions(a.id,{paused:false});assert.equal((await f.engine.plan(a.id)).entries[0].noteId,identity);
});

test("link conversion preserves code, unicode and authored labels while exposing unsupported forms",() => {
  const notes=[{id:"b",netId:"n",path:"net/B.md",blockId:"42"}];
  const vault={resolveLink:()=>"net/B.md"};
  const input="🙂 [[B|Bee]] and [plain](B.md).\n`[[B]]`\n```md\n[[B]]\n```\n\\[[B]]";
  const result=publishMarkdown(input,"net/A.md",notes,vault);
  assert.equal(result.issues.length,0);
  assert.equal(result.content,"🙂 [Bee](https://www.are.na/block/42) and [plain](https://www.are.na/block/42).\n`[[B]]`\n```md\n[[B]]\n```\n\\[[B]]");
  assert.equal(publishMarkdown("[name][ref]\n[ref]: B.md","net/A.md",notes,vault).issues[0].kind,"unsupported");
  assert.equal(publishMarkdown("[[B#^block]]","net/A.md",notes,vault).issues[0].kind,"unsupported");
  assert.equal(pullMarkdown("[Bee](https://www.are.na/block/42)",notes),"[[net/B|Bee]]");
  const headings=[{...notes[0],baseLocal:"# An _important_ heading\n\nBody"}];
  assert.equal(publishMarkdown("[[B#An _important_ heading]]","net/A.md",headings,vault).content,"[B#An _important_ heading](https://www.are.na/block/42#an-important-heading)");
  assert.equal(pullMarkdown("[Section](https://www.are.na/block/42#an-important-heading)",headings),"[[net/B#An _important_ heading|Section]]");
  assert.equal(pullMarkdown("[Section](https://www.are.na/block/42#missing)",headings),"[Section](https://www.are.na/block/42#missing)");
});
