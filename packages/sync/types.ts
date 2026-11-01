// hx generated 261101 — portable Barthes synchronization contracts.
export type LocalNote = { path: string; content: string };
export type RemoteBlock = {
  id: string; title: string; content: string;
  metadata?: Record<string, string | number | boolean | null>;
  updatedAt?: string;
};
export type NetMapping = {
  id: string; title: string; folder: string; channelId: string; channelSlug?: string;
  paused: boolean; autoSync: boolean; hasPublished: boolean;
  sourceIssue?: string; pendingFolder?: string;
};
export type NoteMapping = {
  id: string; netId: string; path: string; blockId?: string;
  baseLocal?: string; baseRemote?: string; baseLocalTitle?: string; baseRemoteTitle?: string;
  pendingCreate?: boolean;
};
export type ConflictCopy = {
  id: string; noteId: string; path: string; savedAt: string;
  local: string; remote: string; remoteTitle: string; resolution: "local" | "remote";
};
export type SyncState = {
  version: 1; vaultId: string; nets: NetMapping[]; notes: NoteMapping[]; conflicts: ConflictCopy[];
};
export interface VaultPort {
  listNotes(): Promise<LocalNote[]>;
  read(path: string): Promise<string | null>;
  /** Must atomically refuse replacement when the current text differs. */
  write(path: string, content: string, expectedContent: string): Promise<void>;
  resolveLink(sourcePath: string, target: string): string | null;
}
export interface RemotePort {
  /** A complete channel listing is required; never return a silently partial list. */
  listBlocks(channelId: string): Promise<RemoteBlock[]>;
  getBlock(id: string): Promise<RemoteBlock>;
  createBlock(channelId: string, data: {title: string; content: string; metadata: Record<string, string>}): Promise<RemoteBlock>;
  updateBlock(id: string, data: {title: string; content: string}): Promise<RemoteBlock>;
}
export type SyncIssue = { kind: "attachment" | "embed" | "outside" | "unresolved" | "unsupported" | "uncertain" | "removed"; message: string; target?: string };
export type SyncAction = "create" | "push" | "pull" | "conflict" | "unchanged" | "missing";
export type SyncEntry = {
  noteId: string; path: string; title: string; action: SyncAction;
  local: string | null; remote: RemoteBlock | null; issues: SyncIssue[];
};
export type SyncPlan = {
  netId: string; createdAt: string; entries: SyncEntry[]; blockers: string[];
};
export type SyncResult = { created: number; pushed: number; pulled: number; unchanged: number };
