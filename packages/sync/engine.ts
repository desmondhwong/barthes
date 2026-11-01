// hx generated 261101 — reviewed, scoped synchronization; no implicit deletions.
import { normalizedPath, publishMarkdown, pullMarkdown, titleFromPath, withinFolder } from "./links";
import type { NetMapping, NoteMapping, RemoteBlock, RemotePort, SyncEntry, SyncPlan, SyncResult, SyncState, VaultPort } from "./types";

export function createSyncState(): SyncState {
  return {version:1, vaultId:crypto.randomUUID(), nets:[], notes:[], conflicts:[]};
}
export function validateSyncState(value: unknown): SyncState {
  if (!value || typeof value !== "object") throw new Error("Invalid Barthes state.");
  const state = value as SyncState;
  if (state.version !== 1 || !safeIdentity(state.vaultId) || !Array.isArray(state.nets) || !Array.isArray(state.notes) || !Array.isArray(state.conflicts)) throw new Error("Unsupported Barthes state.");
  const netIds = new Set<string>(), paths = new Set<string>(), noteIds = new Set<string>(), blockIds = new Set<string>();
  for (const net of state.nets) {
    if (!net || !safeIdentity(net.id) || netIds.has(net.id) || typeof net.title !== "string" || typeof net.folder !== "string" || normalizedPath(net.folder) !== net.folder || typeof net.channelId !== "string" || !/^[1-9]\d*$/.test(net.channelId) || typeof net.paused !== "boolean" || typeof net.autoSync !== "boolean" || typeof net.hasPublished !== "boolean") throw new Error("Invalid net mapping.");
    if ((net.sourceIssue !== undefined && (typeof net.sourceIssue !== "string" || !net.paused)) || (net.pendingFolder !== undefined && (typeof net.pendingFolder !== "string" || normalizedPath(net.pendingFolder) !== net.pendingFolder || !net.sourceIssue)) || (net.channelSlug !== undefined && typeof net.channelSlug !== "string")) throw new Error("Invalid source repair state.");
    netIds.add(net.id);
  }
  for (let i = 0; i < state.nets.length; i++) for (let j = i + 1; j < state.nets.length; j++) {
    if (overlap(state.nets[i].folder, state.nets[j].folder) || state.nets[i].channelId === state.nets[j].channelId) throw new Error("Net selections or destinations overlap.");
  }
  for (const note of state.notes) {
    if (!note || !safeIdentity(note.id) || noteIds.has(note.id) || !netIds.has(note.netId) || typeof note.path !== "string" || normalizedPath(note.path) !== note.path || !/\.md$/i.test(note.path) || paths.has(note.path) || (note.blockId !== undefined && (typeof note.blockId !== "string" || !/^[1-9]\d*$/.test(note.blockId) || blockIds.has(note.blockId))) || (note.pendingCreate !== undefined && typeof note.pendingCreate !== "boolean")) throw new Error("Invalid note mapping.");
    for (const key of ["baseLocal", "baseRemote", "baseLocalTitle", "baseRemoteTitle"] as const) if (note[key] !== undefined && typeof note[key] !== "string") throw new Error("Invalid synchronization baseline.");
    const baselines = [note.baseLocal,note.baseRemote,note.baseLocalTitle,note.baseRemoteTitle].filter(item => item !== undefined).length;
    if (baselines !== 0 && baselines !== 4) throw new Error("Incomplete synchronization baseline.");
    paths.add(note.path); noteIds.add(note.id); if (note.blockId) blockIds.add(note.blockId);
  }
  const conflictIds = new Set<string>();
  for (const copy of state.conflicts) {
    if (!copy || !safeIdentity(copy.id) || conflictIds.has(copy.id) || !noteIds.has(copy.noteId) || typeof copy.path !== "string" || normalizedPath(copy.path) !== copy.path || !/\.md$/i.test(copy.path) || typeof copy.savedAt !== "string" || !Number.isFinite(Date.parse(copy.savedAt)) || typeof copy.local !== "string" || typeof copy.remote !== "string" || typeof copy.remoteTitle !== "string" || !["local","remote"].includes(copy.resolution)) throw new Error("Invalid conflict archive.");
    conflictIds.add(copy.id);
  }
  return structuredClone(state);
}
function safeIdentity(value: unknown): value is string { return typeof value === "string" && value.length <= 128 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value); }
function overlap(a: string, b: string): boolean { return a === b || !a || !b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`); }
function sameRemote(a: RemoteBlock, b: RemoteBlock): boolean { return a.id === b.id && a.content === b.content && a.title === b.title; }
const FRONTMATTER = /^\uFEFF?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/;
function visibleBody(content: string): string { return content.replace(FRONTMATTER, ""); }

export class SyncEngine {
  readonly state: SyncState;
  private readonly vault: VaultPort;
  private readonly remote: RemotePort;
  private readonly persist: (state: SyncState) => Promise<void>;
  private busy = false;
  constructor(options: {state: SyncState; vault: VaultPort; remote: RemotePort; persist: (state: SyncState) => Promise<void>}) {
    this.state = options.state; validateSyncState(this.state);
    this.vault = options.vault; this.remote = options.remote; this.persist = options.persist;
  }
  private async save() { await this.persist(structuredClone(this.state)); }
  private net(id: string) { const net = this.state.nets.find(item => item.id === id); if (!net) throw new Error("This net is no longer configured."); return net; }
  private notes(netId: string) { return this.state.notes.filter(note => note.netId === netId); }
  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error("A Barthes operation is already running.");
    this.busy = true; try { return await operation(); } finally { this.busy = false; }
  }
  async addNet(input: {title: string; folder: string; channelId: string; channelSlug?: string}): Promise<NetMapping> {
    return this.exclusive(async () => {
      const folder = normalizedPath(input.folder), title = input.title.trim();
      if (!title || !/^[1-9]\d*$/.test(input.channelId)) throw new Error("Choose a named net and a valid Are.na channel.");
      if (this.state.nets.some(net => overlap(folder, net.folder))) throw new Error("This folder overlaps another net. Choose separate folders.");
      if (this.state.nets.some(net => net.channelId === input.channelId)) throw new Error("This channel already belongs to another net in this vault.");
      const net: NetMapping = {id:crypto.randomUUID(), title, folder, channelId:input.channelId, ...(input.channelSlug ? {channelSlug:input.channelSlug} : {}), paused:false, autoSync:false, hasPublished:false};
      this.state.nets.push(net); await this.save(); return net;
    });
  }
  async setNetOptions(netId: string, options: {paused?: boolean; autoSync?: boolean}): Promise<void> {
    return this.exclusive(async () => {
      const net = this.net(netId);
      if (net.sourceIssue && (options.paused === false || options.autoSync)) throw new Error(net.sourceIssue);
      if (options.autoSync && !net.hasPublished) throw new Error("Review and publish this net once before enabling automatic updates.");
      Object.assign(net, options); await this.save();
    });
  }
  async setNetFolder(netId: string, folder: string): Promise<void> {
    return this.exclusive(async () => {
      const net = this.net(netId), next = normalizedPath(folder);
      if (this.state.nets.some(other => other.id !== netId && overlap(next,other.pendingFolder ?? other.folder))) throw new Error("This folder overlaps another net. Choose separate folders.");
      net.folder = next; delete net.pendingFolder; delete net.sourceIssue;
      // A repaired selection does not automatically resume publishing.
      for (const other of this.state.nets) if (other.sourceIssue && !other.pendingFolder && !this.state.nets.some(candidate => candidate.id !== other.id && overlap(other.folder,candidate.pendingFolder ?? candidate.folder))) delete other.sourceIssue;
      await this.save();
    });
  }
  /** Called by the host's rename event. Folder moves update every retained identity. */
  async rename(oldPath: string, newPath: string): Promise<void> {
    return this.exclusive(async () => {
      const destination = normalizedPath(newPath);
      const changes = this.state.notes.filter(note => note.path === oldPath || note.path.startsWith(`${oldPath}/`));
      for (const note of changes) {
        const next = destination + note.path.slice(oldPath.length);
        if (this.state.notes.some(other => other !== note && other.path === next)) throw new Error("The renamed path already has a Barthes identity.");
      }
      for (const note of changes) note.path = destination + note.path.slice(oldPath.length);
      // A selected folder follows its rename unless doing so would overlap another
      // selection. Preserve actual note paths, pause both nets, and retain the last
      // valid selections so a restart can still open and repair this state.
      const candidates = this.state.nets.map(net => {
        const source = net.pendingFolder ?? net.folder;
        return {net,folder:source === oldPath || source.startsWith(`${oldPath}/`) ? destination + source.slice(oldPath.length) : source};
      });
      for (const candidate of candidates) {
        const conflict = candidates.find(other => other !== candidate && overlap(candidate.folder,other.folder));
        if (conflict) {
          candidate.net.paused = true;
          candidate.net.sourceIssue = `The moved source overlaps ${conflict.net.title}. Move it to a separate folder or repair the source selection before resuming.`;
          if (candidate.folder !== candidate.net.folder) candidate.net.pendingFolder = candidate.folder;
        } else {
          candidate.net.folder = candidate.folder; delete candidate.net.pendingFolder; delete candidate.net.sourceIssue;
        }
      }
      await this.save();
    });
  }
  async plan(netId: string): Promise<SyncPlan> {
    return this.exclusive(async () => {
      const net = this.net(netId);
      if (net.sourceIssue) throw new Error(net.sourceIssue);
      const all = await this.vault.listNotes();
      const local = new Map(all.filter(note => withinFolder(note.path, net.folder) && /\.md$/i.test(note.path)).map(note => [note.path,note]));
      for (const note of local.values()) {
        normalizedPath(note.path);
        if (!this.state.notes.some(item => item.path === note.path)) this.state.notes.push({id:crypto.randomUUID(),netId,path:note.path});
      }
      await this.save(); // New note IDs survive an interrupted first publication.
      const remote = await this.remote.listBlocks(net.channelId), byId = new Map(remote.map(block => [block.id,block]));
      const entries: SyncEntry[] = [];
      for (const mapping of this.notes(netId)) {
        const source = local.get(mapping.path);
        const entry: SyncEntry = {noteId:mapping.id,path:mapping.path,title:titleFromPath(mapping.path),action:"unchanged",local:source?.content ?? null,remote:mapping.blockId ? byId.get(mapping.blockId) ?? null : null,issues:[]};
        if (mapping.pendingCreate && !mapping.blockId) {
          const found = remote.filter(block => block.metadata?.barthes_note_id === mapping.id && block.metadata?.barthes_net_id === net.id);
          if (found.length === 1) { mapping.blockId = found[0].id; mapping.pendingCreate = false; entry.remote = found[0]; await this.save(); }
          else entry.issues.push({kind:"uncertain",message:found.length > 1 ? "Several remote blocks claim this note identity. Resolve the duplicate before continuing." : "The previous create request has an uncertain outcome. Check Are.na before retrying; Barthes will not create a duplicate automatically."});
        }
        if (entry.remote && (entry.remote.metadata?.barthes_note_id !== mapping.id || entry.remote.metadata?.barthes_net_id !== net.id)) {
          entry.issues.push({kind:"uncertain",message:"The remote block does not match this note's saved identity. Review the mapping before continuing."});
        }
        if (!source) {
          entry.action = "missing";
          if (mapping.blockId || mapping.pendingCreate) entry.issues.push({kind:"removed",message:"This note was removed or moved outside the selected folder. Its remote block is preserved."});
          entries.push(entry); continue;
        }
        const converted = publishMarkdown(visibleBody(source.content), source.path, this.notes(netId).filter(note => local.has(note.path)), this.vault, true);
        entry.issues.push(...converted.issues);
        if (!mapping.blockId) entry.action = "create";
        else if (!entry.remote) {
          entry.action = "missing";
          entry.issues.push({kind:"removed",message:"The mapped block is absent from this channel. Reconnect it on Are.na before syncing; the local note is preserved."});
        } else {
          const localChanged = source.content !== mapping.baseLocal || entry.title !== mapping.baseLocalTitle;
          const remoteChanged = entry.remote.content !== mapping.baseRemote || entry.remote.title !== mapping.baseRemoteTitle;
          const desiredTitle = mapping.baseLocalTitle === entry.title ? entry.remote.title : entry.title;
          const noUnassigned = !this.notes(netId).some(note => local.has(note.path) && !note.blockId);
          if (noUnassigned && converted.content === entry.remote.content && desiredTitle === entry.remote.title && !entry.issues.length) {
            // Also recovers a successful PUT whose acknowledgement was lost.
            this.baseline(mapping, source.content, entry.title, entry.remote); entry.action = "unchanged";
          } else if (mapping.baseRemote === undefined) entry.action = "push"; // Persisted new block awaits the second pass.
          else entry.action = localChanged && remoteChanged ? "conflict" : localChanged ? "push" : remoteChanged ? "pull" : "unchanged";
        }
        entries.push(entry);
      }
      await this.save();
      return {netId,createdAt:new Date().toISOString(),entries,blockers:entries.flatMap(entry => entry.issues.map(issue => `${entry.path}: ${issue.message}`))};
    });
  }
  private baseline(mapping: NoteMapping, local: string, title: string, remote: RemoteBlock) {
    mapping.baseLocal = local; mapping.baseLocalTitle = title; mapping.baseRemote = remote.content; mapping.baseRemoteTitle = remote.title; mapping.pendingCreate = false;
  }
  private async fresh(plan: SyncPlan, entries = plan.entries): Promise<void> {
    const net = this.net(plan.netId);
    if (net.sourceIssue) throw new Error(net.sourceIssue);
    if (net.paused) throw new Error("This net is paused. Resume it before synchronizing.");
    // Revalidate ownership, public visibility, and channel membership at commit.
    const currentMembers = new Set((await this.remote.listBlocks(net.channelId)).map(block => block.id));
    for (const entry of entries) {
      if (entry.issues.length) throw new Error(`Resolve the publication issues for ${entry.path} before synchronizing.`);
      if (await this.vault.read(entry.path) !== entry.local) throw new Error(`The note changed after review: ${entry.path}. Review again.`);
      const mapping = this.state.notes.find(note => note.id === entry.noteId && note.netId === plan.netId);
      if (!mapping || mapping.path !== entry.path || !withinFolder(mapping.path, net.folder)) throw new Error("The source selection changed after review. Review again.");
      if (entry.remote) {
        if (!currentMembers.has(entry.remote.id)) throw new Error(`The block left its channel after review: ${entry.path}. Review again.`);
        const current = await this.remote.getBlock(entry.remote.id);
        if (current.metadata?.barthes_note_id !== mapping.id || current.metadata?.barthes_net_id !== net.id) throw new Error(`The remote identity changed after review: ${entry.path}. Review again.`);
        if (!sameRemote(entry.remote,current)) throw new Error(`Are.na changed after review: ${entry.path}. Review again.`);
      }
    }
  }
  async publish(plan: SyncPlan): Promise<SyncResult> {
    return this.exclusive(async () => {
      const net = this.net(plan.netId);
      if (plan.blockers.length) throw new Error("Resolve the publication issues before publishing.");
      if (plan.entries.some(entry => entry.action === "conflict")) throw new Error("Resolve the conflicting edits before publishing.");
      const selected = plan.entries.filter(entry => entry.local !== null && entry.action !== "missing");
      await this.fresh(plan,selected);
      const result: SyncResult = {created:0,pushed:0,pulled:0,unchanged:0};
      // Reserve every remote identity before translating inter-note links.
      for (const entry of selected.filter(item => item.action === "create")) {
        const mapping = this.state.notes.find(note => note.id === entry.noteId)!;
        if (mapping.blockId || mapping.pendingCreate) throw new Error("A pending publication must be reviewed again.");
        mapping.pendingCreate = true; await this.save();
        let remote: RemoteBlock;
        try {
          remote = await this.remote.createBlock(net.channelId, {title:entry.title,content:`# ${entry.title}\n\nPublication in progress.`,metadata:{barthes_note_id:mapping.id,barthes_net_id:net.id}});
        } catch (error) {
          // An explicit rejected request can be retried. Network/5xx outcomes stay
          // uncertain until its identity marker is found in a complete listing.
          const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
          if (typeof status === "number" && [400,401,403,404,422,429].includes(status)) { mapping.pendingCreate = false; await this.save(); }
          throw error;
        }
        mapping.blockId = remote.id; mapping.pendingCreate = false; entry.remote = remote;
        await this.save(); result.created++;
      }
      const notes = this.notes(net.id).filter(note => selected.some(entry => entry.noteId === note.id));
      for (const entry of selected) {
        if (entry.action === "pull") continue; // Incoming edits have their own explicit action.
        const mapping = notes.find(note => note.id === entry.noteId)!;
        if (!mapping.blockId || !entry.remote || entry.local === null) throw new Error("The publication mapping is incomplete. Review again.");
        if (await this.vault.read(entry.path) !== entry.local) throw new Error(`The note changed while publishing: ${entry.path}. Review again.`);
        const current = await this.remote.getBlock(mapping.blockId);
        if (!sameRemote(entry.remote,current)) throw new Error(`Are.na changed while publishing: ${entry.path}. Review again.`);
        const converted = publishMarkdown(visibleBody(entry.local), entry.path, notes, this.vault);
        if (converted.issues.length) throw new Error(converted.issues[0].message);
        const title = mapping.baseLocalTitle === entry.title ? current.title : entry.title;
        if (current.content === converted.content && current.title === title) { this.baseline(mapping,entry.local,entry.title,current); result.unchanged++; }
        else {
          const updated = await this.remote.updateBlock(mapping.blockId,{title,content:converted.content});
          this.baseline(mapping,entry.local,entry.title,updated); result.pushed++;
        }
        await this.save();
      }
      net.hasPublished = true; await this.save(); return result;
    });
  }
  async pull(plan: SyncPlan): Promise<SyncResult> {
    return this.exclusive(async () => {
      const selected = plan.entries.filter(entry => entry.action === "pull" && entry.remote && entry.local !== null);
      await this.fresh(plan,selected);
      const result: SyncResult = {created:0,pushed:0,pulled:0,unchanged:0};
      for (const entry of selected) {
        const mapping = this.state.notes.find(note => note.id === entry.noteId)!;
        const incoming = this.localIncoming(entry.local!, entry.remote!.content, this.notes(plan.netId));
        await this.vault.write(entry.path,incoming,entry.local!);
        this.baseline(mapping,incoming,entry.title,entry.remote!); await this.save(); result.pulled++;
      }
      return result;
    });
  }
  private localIncoming(local: string, remote: string, notes: NoteMapping[]): string {
    // YAML remains local authoring metadata through a pull as well as a push.
    const frontmatter = FRONTMATTER.exec(local)?.[0] ?? "";
    return frontmatter + (frontmatter && !frontmatter.endsWith("\n") ? "\n" : "") + pullMarkdown(remote,notes);
  }
  async resolve(plan: SyncPlan, noteId: string, choice: "local" | "remote"): Promise<void> {
    return this.exclusive(async () => {
      const entry = plan.entries.find(item => item.noteId === noteId);
      if (!entry || entry.action !== "conflict" || !entry.remote || entry.local === null) throw new Error("Review the current conflicting versions first.");
      await this.fresh(plan,[entry]);
      const mapping = this.state.notes.find(note => note.id === noteId)!;
      this.state.conflicts.push({id:crypto.randomUUID(),noteId,path:entry.path,savedAt:new Date().toISOString(),local:entry.local,remote:entry.remote.content,remoteTitle:entry.remote.title,resolution:choice});
      await this.save(); // Preserve both versions durably before choosing either side.
      if (choice === "remote") {
        const incoming = this.localIncoming(entry.local,entry.remote.content,this.notes(plan.netId));
        await this.vault.write(entry.path,incoming,entry.local); this.baseline(mapping,incoming,entry.title,entry.remote);
      } else {
        const notes = this.notes(plan.netId).filter(note => withinFolder(note.path,this.net(plan.netId).folder));
        const converted = publishMarkdown(visibleBody(entry.local),entry.path,notes,this.vault);
        if (converted.issues.length) throw new Error(converted.issues[0].message);
        const updated = await this.remote.updateBlock(mapping.blockId!,{title:entry.title,content:converted.content});
        this.baseline(mapping,entry.local,entry.title,updated);
      }
      await this.save();
    });
  }
}
