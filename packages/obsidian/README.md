> hx generated 261101-162259-002 current — Barthes desktop Obsidian plugin 0.2.0; live account connection and publication observed in the designated test vault on 2026-11-01.

# Barthes for Obsidian

Publish selected Markdown notes to Are.na and explore their authored links in the Barthes reader. One vault can contain several nets, each mapped to its own source folder and channel. The plugin requires **desktop Obsidian 1.11.4 or later**. It uses Obsidian's vault APIs and SecretStorage; ordinary use requires neither MCP nor Codex.

**Current status.** The application and plugin implementation have local automated coverage, including 28 sync tests and six plugin controller tests. The existing application regression suite and 11 local reader browser journeys also pass. The user completed Are.na authorization in the installed plugin, published a three-note net and verified subsequent note updates on Are.na. The connected state and remote mappings have been inspected. Live pull/conflict round trips and multiple-vault operation remain unverified. Earlier automatic-review rejection of agent-submitted consent is retained in the development record; it does not describe the user's later successful connection.

**Build and install for development.** Run these commands from the repository root with Node 22.x:

```sh
npm ci
npm run typecheck
npm test
npm run build:obsidian
node tools/install-obsidian.mjs /absolute/path/to/development-vault
```

Open the destination folder as an Obsidian vault first, so its `.obsidian` directory exists. The build writes `main.js`, `manifest.json` and `styles.css` to `packages/obsidian/dist`. The installer copies and verifies those three files under `<vault>/.obsidian/plugins/barthes`; it preserves `data.json` and does not enable the plugin. In that vault, open **Settings → Community plugins**, permit community plugins if necessary, then enable **Barthes**. For later development builds, disable Barthes, repeat the build and install commands, and enable it again. The maintained source is `packages/obsidian`; installed files and `dist` are generated copies.

**First publication.** Use the Barthes ribbon icon or the command palette action **Barthes: Open publishing**:

1. Select **Connect Are.na**. Complete the browser authorization and allow the `obsidian://barthes-auth` callback to return to Obsidian.
2. Under **Add a net**, select an existing source folder. Its descendants are included. **Whole vault** is a separate, explicit choice; hidden/configuration paths remain excluded.
3. Choose a channel owned by the connected account, or select **Create a new public channel** and enter a net name. A new channel uses Are.na's `closed` visibility: anyone can read it, while its owner and collaborators control additions. Private channels are not publishing destinations in this version.
4. Select **Add net**, then **Review**. Adding a net may create its empty Are.na channel; it does not upload the notes. Expand each change to compare the Obsidian and Are.na versions and inspect any blockers.
5. Select **Publish reviewed changes**. Local or remote edits after review require another review. **Open Barthes** opens the net at `/n/<channel-id>` on the configured reader host.

Two nets in one vault must use separate, nonoverlapping source folders and different channels. A parent folder and one of its children cannot be independent selections. Whole-vault selection therefore occupies that vault's entire publishing scope. Separate vaults may each run the plugin, with their own settings and account connection; no MCP server is needed per net.

**What is published.** The source consists of Markdown notes in the selected scope. Filenames supply note titles. YAML frontmatter is omitted from outbound content and retained locally during pulls; note files do not receive generated identity frontmatter. Supported wikilinks and inline Markdown links to selected notes become Are.na block URLs, which the reader resolves within the net. IDs are stored in plugin state and remote metadata, independently of titles and paths. Channel membership selects pages and creates no graph edge by itself.

Attachments and embedded notes/media, block references, reference-style Markdown links, HTML link/media forms, unresolved links and links to notes outside the selection produce visible blockers. An outside link never silently includes another note. The initial publishing format requires resolving those blockers before publication. Known heading links retain their reader fragments; a pulled fragment with no unambiguous known local heading retains its Are.na source URL.

**Changes and conflicts.** **Review** distinguishes new notes, local edits, Are.na edits, unchanged notes, missing items and simultaneous edits. **Pull Are.na changes** updates only existing mapped notes whose local version still matches the baseline. Newly created remote blocks are not imported into the vault. A remote title change does not rename a local file. When both versions changed, choose **Keep Obsidian version** or **Use Are.na version**; the plugin saves both versions in its local conflict archive before applying that choice.

Renaming a mapped note retains its remote identity. A selected folder rename follows that source when the result remains nonoverlapping. If a move would overlap another net, both nets pause, actual note paths and identities remain saved, and **Repair source** identifies the problem. Repairing the selection leaves the net paused for review. Moving a note outside its selection, deleting a local note, or removing its remote channel membership requires attention; the plugin performs no automatic remote deletion.

**Automatic updates and devices.** After the first reviewed publication, select **Use this device for automatic publishing** under **Sync and backups**, then enable **Sync automatically after edits** for the desired net. The plugin checks after local edits and periodically while that vault is open. New notes still require manual review. Conflicts, missing items and blockers stop automatic publication. Each net has **Pause/Resume**, and the command palette includes **Barthes: Pause all synchronization**.

The selected-device flag is a local coordination aid, not a distributed lease or lock. Keep one active publishing device per synced vault. Manual operations are also not safe for concurrent publishers on several devices. Local operations are serialized and note replacements check the expected text, but Are.na offers no documented compare-and-swap update. A remote change between the last GET and the PUT can still race with publication. This version does not claim conflict-free multiwriter synchronization.

**Interruption and service limits.** First publication creates marked blocks to obtain stable IDs, then writes their final bodies and links. This is not a transaction: a temporary “Publication in progress.” block can be visible, and a failed pass can leave some notes updated while others remain pending. Review again to resume. After an uncertain create response, the plugin looks for the saved identity marker in the complete channel listing; it refuses to blindly repeat an unresolved create. An explicitly rejected create can be retried after its rate limit or permission problem is resolved. Network and permission failures preserve local notes and saved mappings.

The sync client bounds a channel scan at **2,000 source items** and the account's channel picker at **1,000 channels**. Exceeding a bound stops the scan rather than treating a partial list as complete. These are implementation limits, not measured scalability guarantees. The web reader separately loads at most **240 source items** across ten requested pages, with five-minute content caching. A larger synced net can therefore exceed the current reader view limit.

**Account and credential handling.** The registered application uses public client ID `_AyviNSTkchdBaoVz5SnOcq9j8oPL7sA29VegMzKEvI` and redirect URI `obsidian://barthes-auth`. The client ID is a nonsecret identifier intended to ship with the plugin. Authorization uses S256 PKCE, state validation and a short-lived pending request, with Are.na's `write` scope for publishing. No client secret is bundled. The access token and pending authorization values are stored through Obsidian SecretStorage, separately from plugin `data.json`; the token is sent only to `https://api.are.na`. **Disconnect** clears this plugin's local token and pending request. It does not claim to revoke the provider grant; manage that grant on Are.na. See [Are.na authentication](https://www.are.na/developers/explore/authentication/post-token) and [API scopes](https://www.are.na/developers/explore).

**Backups and recovery.** **Export sync state** downloads versioned JSON containing the vault/net/note identities, source and remote mappings, saved local and remote revisions, conflict copies and account ID/name. Treat this as private data: local baselines can contain unpublished material and YAML metadata even though those fields are omitted from publication. The export contains no access token or pending OAuth verifier and is not a complete backup of the vault, attachments or browser reading history.

**Import sync state** accepts a valid file into an empty Barthes setup, preserving an existing configured setup on refusal. Invalid, oversized or incompatible files do not replace current mappings. Imported nets are paused, automatic publishing is disabled, publisher-device selection is cleared, and authorization must be connected again. Restore the corresponding note files separately, then review the mappings before resuming. Conflict copies remain available in the exported JSON; this version does not provide a separate archive browser.

**Reader destination and delivery.** The default reader origin is the [Vercel branch Preview alias](https://barthes-git-feat-first-pass-desmondhwong.vercel.app), which requires Vercel sign-in. Its contents follow the deployed branch revision. Public-channel content on Are.na can be publicly readable even while that reader Preview is protected. Production promotion and DNS changes are separate work. Before public distribution, configure and verify the intended production reader origin. For development, the stored `readerOrigin` override accepts an HTTPS origin or HTTP on `localhost` / `127.0.0.1`; there is not yet an end-user origin setting. Preserve existing plugin data when changing that developer setting.
