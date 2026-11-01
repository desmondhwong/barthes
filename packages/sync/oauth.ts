// hx generated 261101 — Are.na public-client OAuth with S256 PKCE.
export type PendingAuthorization = {state: string; codeVerifier: string; clientId: string; redirectUri: string; createdAt: number};
function base64url(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,""); }
export async function createAuthorization(clientId: string, redirectUri: string): Promise<{url: string; pending: PendingAuthorization}> {
  if (!clientId || redirectUri !== "obsidian://barthes-auth") throw new Error("The Barthes OAuth application is not configured.");
  const codeVerifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const codeChallenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(codeVerifier))));
  const pending: PendingAuthorization = {state,codeVerifier,clientId,redirectUri,createdAt:Date.now()};
  const url = new URL("https://www.are.na/oauth/authorize");
  url.search = new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:"code",scope:"write",state,code_challenge:codeChallenge,code_challenge_method:"S256"}).toString();
  return {url:url.href,pending};
}
export async function exchangeAuthorization(callback: Record<string,string>, pending: PendingAuthorization, fetcher: typeof fetch = fetch): Promise<string> {
  if (!pending || pending.redirectUri !== "obsidian://barthes-auth" || !pending.state || callback.state !== pending.state) throw new Error("This sign-in does not match the request in this vault. Connect again.");
  if (!Number.isFinite(pending.createdAt) || Date.now() - pending.createdAt > 10 * 60_000 || Date.now() < pending.createdAt) throw new Error("This sign-in request expired. Connect again.");
  if (callback.error) throw new Error("Are.na authorization was not completed. Your notes are unchanged.");
  if (!callback.code || callback.code.length > 2048 || !/^[A-Za-z0-9._~-]{43,128}$/.test(pending.codeVerifier)) throw new Error("Are.na did not return a valid sign-in code. Connect again.");
  let response: Response;
  try {
    response = await fetcher("https://api.are.na/v3/oauth/token",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({grant_type:"authorization_code",client_id:pending.clientId,redirect_uri:pending.redirectUri,code:callback.code,code_verifier:pending.codeVerifier}),signal:AbortSignal.timeout(20_000),cache:"no-store",redirect:"error"});
  } catch { throw new Error("Are.na could not complete sign-in. Connect again when online."); }
  if (!response.ok) throw new Error("Are.na rejected the sign-in exchange. Connect again.");
  const payload = await response.json() as {access_token?: unknown; token_type?: unknown; scope?: unknown};
  if (!payload || typeof payload.access_token !== "string" || !payload.access_token || String(payload.token_type).toLowerCase() !== "bearer" || typeof payload.scope !== "string" || !payload.scope.split(/\s+/).includes("write")) throw new Error("Are.na did not grant the write access needed for publishing.");
  return payload.access_token;
}
