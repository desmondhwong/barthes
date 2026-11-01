// hx generated 261101 — Obsidian publishing panel; DOM-only for native use and browser verification.
import type { NetMapping, SyncPlan, SyncEntry } from '../sync/types';

export type PanelModel = {
  connected: boolean;
  accountName?: string;
  busy?: boolean;
  message?: string;
  error?: string;
  folders: string[];
  channels: { id: string; title: string; slug?: string }[];
  nets: (NetMapping & { status?: string })[];
  plan?: SyncPlan | null;
  publisherDevice: boolean;
  conflictsCount?: number;
};
type ActionResult = void | Promise<void>;
export type PanelActions = {
  connect(): ActionResult;
  disconnect(): ActionResult;
  refreshChannels(): ActionResult;
  addNet(input: { folder: string; channelId?: string; title: string }): ActionResult;
  review(netId: string): ActionResult;
  pause(netId: string, paused: boolean): ActionResult;
  setSource(netId: string, folder: string): ActionResult;
  autoSync(netId: string, enabled: boolean): ActionResult;
  openNet(netId: string): ActionResult;
  publish(plan: SyncPlan): ActionResult;
  pull(plan: SyncPlan): ActionResult;
  resolve(plan: SyncPlan, noteId: string, choice: 'local' | 'remote'): ActionResult;
  openNote(path: string): ActionResult;
  setPublisherDevice(enabled: boolean): ActionResult;
  exportState(): ActionResult;
  importState(file: File): ActionResult;
};

type Draft = { folder: string; destination: string; title: string; details: Set<string>; repairs: Record<string, string>; pendingFocus?: string };
const drafts = new WeakMap<HTMLElement, Draft>();
const actionName: Record<SyncEntry['action'], string> = {
  create: 'New note', push: 'Local edit', pull: 'Are.na edit', conflict: 'Both edited',
  unchanged: 'Unchanged', missing: 'Needs attention',
};

/** No source or remote text is interpreted as HTML. Render can be called after any model change. */
export function renderPanel(host: HTMLElement, model: PanelModel, actions: PanelActions): void {
  const doc = host.ownerDocument;
  const active = host.contains(doc.activeElement) ? doc.activeElement as HTMLElement : null;
  const focusKey = active?.dataset.barthesFocus;
  const activeInput = active?.tagName === 'INPUT' ? active as HTMLInputElement : null;
  const selection = activeInput?.type === 'text'
    ? [activeInput.selectionStart, activeInput.selectionEnd] as const : null;
  const scrollTop = host.scrollTop;
  const draft = drafts.get(host) ?? { folder: '__choose__', destination: 'new', title: '', details: new Set<string>(), repairs: {} };
  const restoreFocus = focusKey || draft.pendingFocus;
  if (model.busy && focusKey) draft.pendingFocus = focusKey;
  if (!model.busy) draft.pendingFocus = undefined;
  drafts.set(host, draft);
  for (const el of host.querySelectorAll<HTMLDetailsElement>('details[data-detail]')) {
    if (el.open) draft.details.add(el.dataset.detail!); else draft.details.delete(el.dataset.detail!);
  }
  host.replaceChildren();
  host.classList.add('barthes-publisher');
  host.setAttribute('aria-busy', String(!!model.busy));

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, text?: string, className?: string): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    parent.append(node);
    return node;
  }
  const header = el('header', host, undefined, 'barthes-panel-header');
  el('h2', header, 'Barthes');
  el('p', header, model.connected ? `Connected to Are.na${model.accountName ? ` as ${model.accountName}` : ''}` : 'Publish selected notes to Are.na and read them in Barthes.', 'barthes-muted');
  const feedback = el('p', host, model.error || model.message || '', 'barthes-feedback');
  feedback.setAttribute('role', model.error ? 'alert' : 'status');
  feedback.setAttribute('aria-live', model.error ? 'assertive' : 'polite');
  feedback.hidden = !feedback.textContent;
  const report = (error: unknown) => {
    feedback.textContent = error instanceof Error ? error.message : 'The action could not finish. Try again.';
    feedback.hidden = false;
    feedback.setAttribute('role', 'alert');
  };
  function run(action: () => ActionResult) {
    try { Promise.resolve(action()).catch(report); } catch (error) { report(error); }
  }
  function button(parent: HTMLElement, label: string, key: string, action: () => ActionResult, disabled = false) {
    const node = el('button', parent, label);
    node.type = 'button';
    node.dataset.barthesFocus = key;
    node.disabled = !!model.busy || disabled;
    node.addEventListener('click', () => run(action));
    return node;
  }
  function detail(parent: HTMLElement, title: string, key: string) {
    const node = el('details', parent);
    node.dataset.detail = key;
    node.open = draft.details.has(key);
    const summary = el('summary', node, title);
    summary.dataset.barthesFocus = `details:${key}`;
    node.addEventListener('toggle', () => node.open ? draft.details.add(key) : draft.details.delete(key));
    return node;
  }
  function check(parent: HTMLElement, title: string, key: string, checked: boolean, onChange: (value: boolean) => ActionResult, disabled = false) {
    const label = el('label', parent, undefined, 'barthes-check');
    const input = el('input', label);
    input.type = 'checkbox'; input.checked = checked;
    input.disabled = !!model.busy || disabled;
    input.dataset.barthesFocus = key;
    input.addEventListener('change', () => run(() => onChange(input.checked)));
    el('span', label, title);
    return input;
  }
  function fieldLabel(parent: HTMLElement, title: string) {
    const label = el('label', parent, undefined, 'barthes-field');
    el('span', label, title);
    return label;
  }

  const accountActions = el('div', header, undefined, 'barthes-actions');
  if (!model.connected) button(accountActions, 'Connect Are.na', 'connect', actions.connect).classList.add('mod-cta');
  else button(accountActions, 'Disconnect', 'disconnect', actions.disconnect);

  const nets = el('section', host, undefined, 'barthes-nets');
  el('h3', nets, 'Your nets');
  if (!model.nets.length) el('p', nets, 'Choose a source folder and an Are.na channel to make your first net.', 'barthes-muted');
  for (const net of model.nets) {
    const row = el('article', nets, undefined, 'barthes-net');
    row.setAttribute('aria-label', net.title);
    const heading = el('div', row, undefined, 'barthes-net-heading');
    el('h4', heading, net.title);
    el('span', heading, net.sourceIssue ? 'Needs attention' : net.paused ? 'Paused' : net.status || (net.hasPublished ? 'Ready to review' : 'Not published'), 'barthes-net-status');
    el('p', row, net.folder ? `${net.folder}/ and subfolders` : 'Whole vault · Markdown notes', 'barthes-source');
    const controls = el('div', row, undefined, 'barthes-actions');
    button(controls, 'Review', `review:${net.id}`, () => actions.review(net.id), !model.connected || !!net.sourceIssue);
    button(controls, net.paused ? 'Resume' : 'Pause', `pause:${net.id}`, () => actions.pause(net.id, !net.paused), !!net.sourceIssue);
    button(controls, 'Open Barthes', `open:${net.id}`, () => actions.openNet(net.id));
    if (net.sourceIssue) {
      const issue = el('p', row, net.sourceIssue, 'barthes-feedback'); issue.setAttribute('role', 'status');
      if (net.pendingFolder) el('p', row, `Moved location: ${net.pendingFolder}/`, 'barthes-source');
      const repair = el('select', fieldLabel(row, 'Repair source'));
      repair.dataset.barthesFocus = `repair-folder:${net.id}`; repair.disabled = !!model.busy;
      const choose = el('option', repair, 'Choose a source explicitly'); choose.value = '__choose__'; choose.disabled = true;
      const whole = el('option', repair, 'Whole vault'); whole.value = '';
      for (const path of [...new Set(model.folders)].filter(Boolean).sort()) { const option = el('option', repair, `${path}/`); option.value = path; }
      const previous = draft.repairs[net.id] ?? '__choose__';
      if (![...repair.options].some(option => option.value === previous)) { const missing = el('option', repair, `${previous}/ (unavailable)`); missing.value = previous; missing.disabled = true; }
      repair.value = previous;
      repair.addEventListener('change', () => { draft.repairs[net.id] = repair.value; });
      button(row, 'Save repaired source', `repair:${net.id}`, () => {
        if (repair.value === '__choose__' || (repair.value !== '' && !model.folders.includes(repair.value))) throw new Error('Choose an available source folder or explicitly select the whole vault.');
        return actions.setSource(net.id, repair.value);
      });
      el('p', row, 'Repair preserves note mappings and leaves the net paused for review.', 'barthes-muted');
    }
    check(row, 'Sync automatically after edits', `auto:${net.id}`, net.autoSync,
      value => actions.autoSync(net.id, value), !net.hasPublished || !model.publisherDevice || !!net.sourceIssue);
    if (!net.hasPublished) el('p', row, 'Automatic sync becomes available after the first reviewed publication.', 'barthes-muted');
    else if (!model.publisherDevice) el('p', row, 'Choose this device under Sync and backups to enable automatic publishing.', 'barthes-muted');
  }

  const add = detail(host, 'Add a net', 'add-net');
  if (!model.nets.length) add.open = true;
  const form = el('form', add, undefined, 'barthes-net-form');
  const folder = el('select', fieldLabel(form, 'Source'));
  folder.dataset.barthesFocus = 'source-folder'; folder.disabled = !!model.busy;
  const chooseOption = el('option', folder, 'Choose a folder or the whole vault'); chooseOption.value = '__choose__'; chooseOption.disabled = true;
  const rootOption = el('option', folder, 'Whole vault'); rootOption.value = '';
  for (const path of [...new Set(model.folders)].filter(Boolean).sort()) {
    const option = el('option', folder, `${path}/`); option.value = path;
  }
  if (![...folder.options].some(option => option.value === draft.folder)) {
    const missing = el('option', folder, `${draft.folder}/ (unavailable)`); missing.value = draft.folder; missing.disabled = true;
  }
  folder.value = draft.folder;
  folder.addEventListener('change', () => { draft.folder = folder.value; });
  el('p', form, 'Only Markdown notes in this source are included. Links never add outside notes; attachments and embeds need review.', 'barthes-muted');
  const destination = el('select', fieldLabel(form, 'Are.na channel'));
  destination.dataset.barthesFocus = 'destination'; destination.disabled = !!model.busy || !model.connected;
  const newOption = el('option', destination, 'Create a new public channel'); newOption.value = 'new';
  for (const channel of model.channels) {
    const option = el('option', destination, channel.title); option.value = channel.id;
  }
  if (![...destination.options].some(option => option.value === draft.destination)) {
    const missing = el('option', destination, 'Previously selected channel (unavailable)'); missing.value = draft.destination; missing.disabled = true;
  }
  destination.value = draft.destination;
  destination.addEventListener('change', () => {
    draft.destination = destination.value;
    name.required = destination.value === 'new';
    name.placeholder = destination.value === 'new' ? 'Name your net' : 'Use the channel name';
  });
  const name = el('input', fieldLabel(form, 'Net name'));
  name.type = 'text'; name.maxLength = 200; name.value = draft.title;
  name.required = destination.value === 'new'; name.disabled = !!model.busy;
  name.placeholder = destination.value === 'new' ? 'Name your net' : 'Use the channel name';
  name.dataset.barthesFocus = 'net-name';
  name.addEventListener('input', () => { draft.title = name.value; });
  const addActions = el('div', form, undefined, 'barthes-actions');
  const submit = el('button', addActions, 'Add net'); submit.type = 'submit';
  submit.disabled = !!model.busy || !model.connected; submit.dataset.barthesFocus = 'add-net';
  button(addActions, 'Refresh channels', 'refresh-channels', actions.refreshChannels, !model.connected);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (folder.value === '__choose__' || (folder.value !== '' && !model.folders.includes(folder.value))) {
      report(new Error('Choose an available source folder or explicitly select the whole vault.')); folder.focus(); return;
    }
    const channel = model.channels.find(item => item.id === destination.value);
    if (destination.value !== 'new' && !channel) {
      report(new Error('Choose an available channel or create a new one.')); destination.focus(); return;
    }
    const title = name.value.trim() || channel?.title || '';
    if (!title) { report(new Error('Enter a name for this net.')); name.focus(); return; }
    run(() => actions.addNet({ folder: folder.value, title, ...(channel ? { channelId: channel.id } : {}) }));
  });
  el('p', add, 'A public channel is readable by anyone. Adding a net does not publish its notes; review them first.', 'barthes-muted');

  const plan = model.plan;
  if (plan) {
    const net = model.nets.find(item => item.id === plan.netId);
    const review = el('section', host, undefined, 'barthes-review');
    const heading = el('div', review, undefined, 'barthes-net-heading');
    el('h3', heading, `Review${net ? ` · ${net.title}` : ''}`);
    button(heading, 'Refresh review', 'refresh-review', () => actions.review(plan.netId), !model.connected);
    const changed = plan.entries.filter(entry => entry.action !== 'unchanged').length;
    el('p', review, `${plan.entries.length} ${plan.entries.length === 1 ? 'note' : 'notes'} · ${changed} ${changed === 1 ? 'change' : 'changes'}`, 'barthes-muted');
    if (plan.blockers.length) {
      const list = el('ul', review, undefined, 'barthes-issues'); list.setAttribute('aria-label', 'Publication blockers');
      for (const blocker of plan.blockers) el('li', list, blocker);
    }
    if (!plan.entries.length) el('p', review, 'No Markdown notes are included in this source.');
    for (const entry of plan.entries) {
      const row = detail(review, `${entry.path} — ${actionName[entry.action]}`, `entry:${entry.noteId}`);
      row.classList.add('barthes-change');
      if (entry.issues.length) {
        const list = el('ul', row, undefined, 'barthes-issues');
        for (const issue of entry.issues) el('li', list, issue.message);
      }
      const versions = el('div', row, undefined, 'barthes-versions');
      const local = el('section', versions); el('h4', local, 'In Obsidian');
      el('pre', local, entry.local ?? 'Note is outside the selected source or missing.');
      const remote = el('section', versions); el('h4', remote, 'On Are.na');
      el('pre', remote, entry.remote?.content ?? 'Not yet published.');
      const rowActions = el('div', row, undefined, 'barthes-actions');
      button(rowActions, 'Open note', `note:${entry.noteId}`, () => actions.openNote(entry.path), entry.local === null);
      if (entry.action === 'conflict') {
        el('p', row, 'Both versions are retained before you choose which one to use.', 'barthes-muted');
        button(rowActions, 'Keep Obsidian version', `local:${entry.noteId}`, () => actions.resolve(plan, entry.noteId, 'local'), !model.connected || !!net?.paused);
        button(rowActions, 'Use Are.na version', `remote:${entry.noteId}`, () => actions.resolve(plan, entry.noteId, 'remote'), !model.connected || !!net?.paused);
      }
    }
    const reviewActions = el('div', review, undefined, 'barthes-actions barthes-review-actions');
    const blocked = !model.connected || !!net?.paused || !!plan.blockers.length;
    const toPush = plan.entries.some(entry => entry.action === 'create' || entry.action === 'push');
    const toPull = plan.entries.some(entry => entry.action === 'pull');
    button(reviewActions, 'Publish reviewed changes', 'publish', () => actions.publish(plan), blocked || !toPush).classList.add('mod-cta');
    button(reviewActions, 'Pull Are.na changes', 'pull', () => actions.pull(plan), blocked || !toPull);
    if (net?.paused) el('p', review, 'Resume this net to publish or pull changes.', 'barthes-muted');
  }

  const options = detail(host, 'Sync and backups', 'options');
  check(options, 'Use this device for automatic publishing', 'publisher-device', model.publisherDevice, actions.setPublisherDevice);
  el('p', options, 'Choose one publishing device for a synced vault. Automatic sync runs only while this vault is open and preserves conflicts for review.', 'barthes-muted');
  const backupActions = el('div', options, undefined, 'barthes-actions');
  button(backupActions, 'Export sync state', 'export', actions.exportState);
  const file = el('input', options); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
  file.addEventListener('change', () => { const selected = file.files?.[0]; if (selected) run(() => actions.importState(selected)); file.value = ''; });
  button(backupActions, 'Import sync state', 'import', () => file.click());
  el('p', options, 'Backups include note mappings, saved revisions and conflict copies. They contain no access token. Import is validated before replacing state.', 'barthes-muted');
  if (model.conflictsCount) el('p', options, `${model.conflictsCount} saved ${model.conflictsCount === 1 ? 'conflict copy' : 'conflict copies'} included in export.`, 'barthes-muted');

  if (restoreFocus) {
    const replacement = [...host.querySelectorAll<HTMLElement>('[data-barthes-focus]')]
      .find(node => node.dataset.barthesFocus === restoreFocus);
    if (replacement && !('disabled' in replacement && replacement.disabled)) {
      replacement.focus({ preventScroll: true });
      if (selection && replacement.tagName === 'INPUT' && (replacement as HTMLInputElement).type === 'text') (replacement as HTMLInputElement).setSelectionRange(selection[0], selection[1]);
    }
  }
  host.scrollTop = scrollTop;
}
