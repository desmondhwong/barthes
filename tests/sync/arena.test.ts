// hx generated 261101 — transport ownership, pagination and failure boundaries.
import {test} from "node:test";
import assert from "node:assert/strict";
import {ArenaClient,ArenaError} from "../../packages/sync/arena";
const user={id:2471,name:"Desmond",slug:"desmond-wong"};
const channel={id:12,type:"Channel",title:"Net",slug:"net",visibility:"closed",owner:{id:2471,type:"User"},can:{add_to:true}};
test("a disconnected client can be constructed but cannot send requests",async()=>{
  let calls=0;const arena=new ArenaClient("",(async()=>{calls++;return new Response();}) as typeof fetch);
  await assert.rejects(arena.getCurrentUser(),/Connect your Are.na/);assert.equal(calls,0);
});
function client(overrides: (path:string,init?:RequestInit)=>Response | undefined = ()=>undefined) {
  return new ArenaClient("test-token",(async(url,init)=>{
    assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer test-token");
    assert.equal(init?.redirect,"error");
    const path=new URL(String(url)).pathname; const alternate=overrides(path,init); if(alternate) return alternate;
    if(path.endsWith("/me"))return Response.json(user);
    if(path.endsWith("/channels/12"))return Response.json(channel);
    return Response.json({data:[{id:1,type:"Text",title:"A",content:{markdown:"A"},metadata:{barthes_note_id:"id"}}],meta:{current_page:1,has_more_pages:false,next_page:null}});
  }) as typeof fetch);
}
test("complete owned public-channel listing maps text and stable metadata",async()=>{
  const arena=client(); assert.deepEqual(await arena.getCurrentUser(),{...user,id:"2471"});
  assert.equal((await arena.getChannel("12")).visibility,"closed"); const blocks=await arena.listBlocks("12");
  assert.equal(blocks[0].id,"1");assert.equal(blocks[0].metadata?.barthes_note_id,"id");
});
test("private or foreign-owned channels cannot be used as publishing destinations",async()=>{
  await assert.rejects(client(path=>path.endsWith("channels/12") ? Response.json({...channel,visibility:"private"}):undefined).listBlocks("12"),/publicly readable/);
  await assert.rejects(client(path=>path.endsWith("channels/12") ? Response.json({...channel,owner:{id:99,type:"User"}}):undefined).listBlocks("12"),/owned/);
});
test("inconsistent pagination is refused instead of inferring remote deletion",async()=>{
  await assert.rejects(client(path=>path.endsWith("/contents")?Response.json({data:[],meta:{current_page:2,has_more_pages:false,next_page:null}}):undefined).listBlocks("12"),/inconsistent pagination/);
});
test("rate limits expose retry time without leaking service bodies",async()=>{
  try{await client(()=>new Response("secret provider detail",{status:429,headers:{"Retry-After":"30"}})).getCurrentUser(); assert.fail();}
  catch(error){assert.ok(error instanceof ArenaError);assert.equal(error.retryAfterSeconds,30);assert.doesNotMatch(error.message,/secret/);}
});
test("create and update use v3 schemas and preserve client metadata",async()=>{
  const arena=client((path,init)=>{
    if(path==="/v3/blocks") {const body=JSON.parse(String(init?.body));assert.equal(body.value,"Body");assert.deepEqual(body.channels,[{id:"12"}]);assert.equal(body.metadata.barthes_note_id,"id");return Response.json({id:1,type:"Text",title:"A",content:{markdown:"Body"}});}
    if(path==="/v3/blocks/1") {const body=JSON.parse(String(init?.body));assert.equal(init?.method,"PUT");assert.equal(body.content,"Update");return Response.json({id:1,type:"Text",title:"A",content:{markdown:"Update"}});}
  });
  await arena.createBlock("12",{title:"A",content:"Body",metadata:{barthes_note_id:"id"}});await arena.updateBlock("1",{title:"A",content:"Update"});
});
