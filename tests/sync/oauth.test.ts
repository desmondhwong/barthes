// hx generated 261101 — authorization binding and token boundary checks.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createAuthorization,exchangeAuthorization} from "../../packages/sync/oauth";

test("OAuth creates unpredictable S256 transactions with write scope and no secret",async()=>{
  const a=await createAuthorization("client","obsidian://barthes-auth"),b=await createAuthorization("client","obsidian://barthes-auth");
  const url=new URL(a.url);
  assert.equal(url.origin,"https://www.are.na"); assert.equal(url.searchParams.get("scope"),"write"); assert.equal(url.searchParams.get("code_challenge_method"),"S256");
  assert.notEqual(a.pending.state,b.pending.state); assert.notEqual(a.pending.codeVerifier,b.pending.codeVerifier);
  assert.match(a.pending.codeVerifier,/^[A-Za-z0-9_-]{64}$/); assert.equal(url.searchParams.has("client_secret"),false);
});
test("callback validation rejects wrong vault, stale state, cancellation and missing code before networking",async()=>{
  const {pending}=await createAuthorization("client","obsidian://barthes-auth"); let requests=0;
  const fetcher=(async()=>{requests++; return new Response();}) as typeof fetch;
  await assert.rejects(exchangeAuthorization({state:"wrong",code:"code"},pending,fetcher),/does not match/);
  await assert.rejects(exchangeAuthorization({state:pending.state,code:"code"},{...pending,createdAt:Date.now()-700_000},fetcher),/expired/);
  await assert.rejects(exchangeAuthorization({state:pending.state,error:"access_denied"},pending,fetcher),/not completed/);
  await assert.rejects(exchangeAuthorization({state:pending.state},pending,fetcher),/valid sign-in/);
  assert.equal(requests,0);
});
test("token exchange sends PKCE but no secret and requires actual write grant",async()=>{
  const {pending}=await createAuthorization("client","obsidian://barthes-auth");
  const fetcher=(async(url,options)=>{
    assert.equal(url,"https://api.are.na/v3/oauth/token"); const body=JSON.parse(String(options?.body));
    assert.equal(body.code_verifier,pending.codeVerifier); assert.equal(body.client_secret,undefined); assert.equal(body.redirect_uri,"obsidian://barthes-auth");
    return Response.json({access_token:"test-token",token_type:"Bearer",scope:"write"});
  }) as typeof fetch;
  assert.equal(await exchangeAuthorization({state:pending.state,code:"code"},pending,fetcher),"test-token");
  await assert.rejects(exchangeAuthorization({state:pending.state,code:"code"},pending,(async()=>Response.json({access_token:"read-token",token_type:"Bearer",scope:"read"})) as typeof fetch),/write access/);
});
