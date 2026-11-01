// hx generated 261101 — Are.na v3 transport, with injected host networking.
import type { RemoteBlock, RemotePort } from "./types";

export type ArenaUser = { id: string; name: string; slug: string };
export type ArenaChannel = {id: string; title: string; slug: string; visibility: "public" | "closed" | "private"; userId: string; canAdd: boolean};
export class ArenaError extends Error {
  constructor(message: string, readonly status?: number, readonly retryAfterSeconds?: number) { super(message); this.name = "ArenaError"; }
}
type JsonRecord = Record<string, unknown>;
function record(value: unknown): JsonRecord { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ArenaError("Are.na returned an invalid response."); return value as JsonRecord; }
function id(value: unknown): string { const result = String(value); if (!/^[1-9]\d{0,18}$/.test(result)) throw new ArenaError("Are.na returned an invalid identity."); return result; }
function channel(value: unknown): ArenaChannel {
  const row = record(value), owner = record(row.owner), can = row.can ? record(row.can) : {};
  if (row.type !== "Channel" || typeof row.slug !== "string" || typeof row.title !== "string" || !["public","closed","private"].includes(String(row.visibility))) throw new ArenaError("Are.na returned an invalid channel.");
  return {id:id(row.id),title:row.title,slug:row.slug,visibility:row.visibility as ArenaChannel["visibility"],userId:owner.type === "User" ? id(owner.id) : "",canAdd:can.add_to === true};
}
function block(value: unknown): RemoteBlock {
  const row = record(value), content = record(row.content);
  if (row.type !== "Text" || typeof content.markdown !== "string" || content.markdown.length > 1_000_000) throw new ArenaError("This Are.na block is not a supported text note.");
  return {id:id(row.id),title:typeof row.title === "string" ? row.title : "",content:content.markdown,metadata:row.metadata ? record(row.metadata) as RemoteBlock["metadata"] : {},updatedAt:typeof row.updated_at === "string" ? row.updated_at : undefined};
}

export class ArenaClient implements RemotePort {
  private user?: ArenaUser;
  constructor(private readonly token: string, private readonly fetcher: typeof fetch = fetch) {}
  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    if (!this.token) throw new ArenaError("Connect your Are.na account first.");
    let response: Response;
    try {
      response = await this.fetcher(`https://api.are.na/v3${path}`,{...init,headers:{Authorization:`Bearer ${this.token}`,Accept:"application/json",...(init.body ? {"Content-Type":"application/json"} : {})},signal:AbortSignal.timeout(20_000),cache:"no-store",redirect:"error"});
    } catch { throw new ArenaError("Are.na could not be reached. Your notes and pending work are preserved."); }
    if (!response.ok) {
      const rawWait = response.headers.get("retry-after"), wait = rawWait && /^\d+$/.test(rawWait) ? Math.min(3600,Math.max(1,Number(rawWait))) : undefined;
      throw new ArenaError(response.status === 401 ? "Your Are.na connection has expired or was revoked. Connect again." : response.status === 403 ? "Are.na denied this operation. Publishing needs write access and ownership of the block." : response.status === 429 ? "Are.na is limiting requests. Wait before trying again." : response.status === 404 ? "This Are.na item is unavailable." : `Are.na could not complete the request (HTTP ${response.status}).`,response.status,wait);
    }
    if (Number(response.headers.get("content-length") || 0) > 8_000_000) throw new ArenaError("The Are.na response is too large for this sync pass.");
    const text = await response.text();
    if (text.length > 8_000_000) throw new ArenaError("The Are.na response is too large for this sync pass.");
    try { return JSON.parse(text); } catch { throw new ArenaError("Are.na returned an unreadable response."); }
  }
  async getCurrentUser(): Promise<ArenaUser> {
    const row = record(await this.request("/me"));
    if (typeof row.name !== "string" || typeof row.slug !== "string") throw new ArenaError("Are.na returned an invalid account.");
    this.user = {id:id(row.id),name:row.name,slug:row.slug}; return this.user;
  }
  async getChannel(channelId: string): Promise<ArenaChannel> {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,150}$/.test(channelId)) throw new ArenaError("Enter an Are.na channel ID or slug.");
    return channel(await this.request(`/channels/${encodeURIComponent(channelId)}`));
  }
  async createChannel(title: string): Promise<ArenaChannel> {
    if (!title.trim()) throw new ArenaError("Give the net a name.");
    return channel(await this.request("/channels",{method:"POST",body:JSON.stringify({title:title.trim(),visibility:"closed"})}));
  }
  private async pages(path: string, maxPages: number): Promise<unknown[]> {
    const data: unknown[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const payload = record(await this.request(`${path}${path.includes("?") ? "&" : "?"}page=${page}&per=100`));
      const meta = record(payload.meta);
      if (!Array.isArray(payload.data) || payload.data.length > 100 || meta.current_page !== page || typeof meta.has_more_pages !== "boolean" || (meta.has_more_pages && meta.next_page !== page + 1) || (!meta.has_more_pages && meta.next_page !== null)) throw new ArenaError("Are.na returned inconsistent pagination; the sync was stopped.");
      data.push(...payload.data);
      if (!meta.has_more_pages) return data;
    }
    throw new ArenaError(`This channel exceeds the current sync limit of ${maxPages * 100} items. Nothing has been published.`);
  }
  async listOwnChannels(): Promise<ArenaChannel[]> {
    const user = this.user ?? await this.getCurrentUser();
    return (await this.pages(`/users/${user.id}/contents?type=Channel&sort=updated_at_desc`,10)).map(channel).filter(item => item.userId === user.id);
  }
  async listBlocks(channelId: string): Promise<RemoteBlock[]> {
    id(channelId);
    const net = await this.getChannel(channelId);
    const user = this.user ?? await this.getCurrentUser();
    if (net.userId !== user.id || net.visibility === "private") throw new ArenaError("Choose a publicly readable channel owned by your connected account.");
    const rows = await this.pages(`/channels/${channelId}/contents?sort=position_asc`,20);
    const blocks: RemoteBlock[] = [], seen = new Set<string>();
    for (const value of rows) {
      const row = record(value);
      if (row.type !== "Text") continue;
      const item = block(row);
      if (seen.has(item.id)) throw new ArenaError("The channel changed during pagination. Review again before syncing.");
      seen.add(item.id); blocks.push(item);
    }
    return blocks;
  }
  async getBlock(blockId: string): Promise<RemoteBlock> { id(blockId); return block(await this.request(`/blocks/${blockId}`)); }
  async createBlock(channelId: string, data: {title: string; content: string; metadata: Record<string,string>}): Promise<RemoteBlock> {
    id(channelId);
    return block(await this.request("/blocks",{method:"POST",body:JSON.stringify({value:data.content,title:data.title,metadata:data.metadata,channels:[{id:channelId}]})}));
  }
  async updateBlock(blockId: string, data: {title: string; content: string}): Promise<RemoteBlock> {
    id(blockId); return block(await this.request(`/blocks/${blockId}`,{method:"PUT",body:JSON.stringify(data)}));
  }
}
