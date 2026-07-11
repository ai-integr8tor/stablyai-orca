# Side Quests: viability and delivery plan

## Outcome

Side Quests are viable on Orca's existing terminal-group and native-chat foundations. The delivered
vertical slice opens a durable provider-owned Codex conversation beside the source terminal,
optionally carries selected terminal output into the native composer as quoted context, and leaves
the original process running and interactive.

Local Codex Side Quests use one warm `codex app-server` process and do not create a hidden PTY.
Claude and SSH worktrees retain the read-only terminal-backed compatibility path. Runtime-owned web,
paired, and headless worktrees need a host API improvement before they can bind context safely.

## User flow

1. Select terminal output and choose **Add Selection to Side Quest** from the floating action, or
   right-click the terminal and choose the same action.
2. To start without context, right-click and choose **New Side Quest**.
3. Orca creates a split to the right and starts a durable, read-only Codex provider thread for local
   worktrees. Compatibility environments launch the matching/default terminal agent.
4. The new pane opens directly in native chat and is labeled **Side Quest**.
5. Selected output appears as a removable quote card. The user adds a question and sends both as one
   bounded prompt with an explicit untrusted-context boundary.
6. The original terminal continues without receiving input, focus, or an interrupt.

## Architecture

| Concern             | Existing Orca primitive                             | Side Quest behavior                                                               |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Side-by-side layout | terminal split groups                               | create an empty right split beside the source group                               |
| Independent agent   | Codex app-server manager                            | reuse one warm process and create a provider-owned thread per Side Quest          |
| Agent choice        | detected leaf, launched tab, default-agent settings | prefer the detected source agent, then launch metadata, then default              |
| Chat surface        | experimental native chat                            | force the created unified terminal tab to chat mode                               |
| Context             | bounded session transcript cleaner                  | strip terminal control data and cap context at the existing transcript budget     |
| Prompt safety       | native chat send path                               | fence output as untrusted quoted text and append the user's question              |
| Pending handoff     | bounded renderer cache keyed by terminal tab ID     | seed before chat's first render and clear after send/removal                      |
| Durability          | terminal-tab workspace state                        | persist only the Side Quest/provider thread reference; the provider owns messages |
| Live updates        | preload IPC subscription                            | stream agent deltas, completed items, turn completion, errors, and interrupts     |

Codex app-server threads use `sandbox: read-only` and `approvalPolicy: never`. Inherited MCP servers
and apps are disabled for these research conversations, avoiding both unwanted capabilities and the
startup delay that motivated the direct provider transport. Claude launches with
`--permission-mode plan` on the compatibility path. Terminal fallbacks intentionally bypass
configured command overrides because an override can embed unrestricted flags that would defeat
the shared-worktree guarantee.

## Platform viability

| Environment                                 | Status                        | Notes                                                                                     |
| ------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| macOS, Linux, Windows local worktrees       | Supported                     | cross-platform process spawning plus the existing split/chat UI                           |
| WSL worktrees                               | Supported by provider manager | converts renderer UNC paths to the selected distro's Linux path                           |
| Ordinary SSH worktrees                      | Compatibility path            | existing terminal launch routing keeps process creation on the SSH target                 |
| Runtime-owned web/paired/headless worktrees | Blocked on host API           | renderer receives no created tab ID, so context cannot be bound to a specific chat safely |

The runtime fix should make host terminal creation awaitable and return the created terminal and
unified-tab identities. The same transaction should accept the target group, initial view mode,
label, and pending Side Quest context. Until then the UI reports this limitation and avoids creating
an orphan local split.

Local provider creation is asynchronous after tab allocation, so the composer remains draftable
while the provider thread starts. The vertical slice rolls back tab-registration and split-creation
failures, surfaces provider startup errors inline, and treats an app-server thread as an empty
conversation until its first user turn materializes it.

## Delivery phases

### Phase 1 — vertical slice

- Selection floating action and terminal context-menu entry.
- No-selection context-menu entry.
- Right split, independent read-only provider thread, native chat mode, and Side Quest label.
- Bounded removable quote card and safe first-question composition.
- Unit coverage for agent choice, launch rollback, context fencing, composer handoff, and UI actions.

### Phase 2 — durable product model (partially delivered)

- Persist a `sideQuest` provider-thread reference rather than relying on terminal labels.
- Reuse one warm Codex app-server and resume durable threads after process/app restart.
- Persist unsent quoted context across app restarts.
- Add Side Quest history, rename, close/archive, and source-conversation metadata.
- Add `@side-quest` mention/search so a main conversation can import a bounded summary or selected
  messages without coupling the two live sessions.

### Phase 3 — runtime parity and polish

- Extend the runtime host create-tab API and enable web/paired/headless worktrees.
- Add an awaited agent-readiness result so late local/SSH startup failures can close the tab and
  collapse its split automatically.
- Include keyboard access and command-palette launch.
- Introduce telemetry for launch, first question, context removal, and return-to-main-thread behavior.
- Run interaction QA on macOS, Linux, Windows, local SSH, and high-latency SSH.

## Acceptance criteria

- Launching never writes to or interrupts the source terminal.
- The Side Quest agent runs in the same worktree and execution environment as the source.
- The created surface is native chat, not the TUI, when experimental native chat is enabled.
- Selected output is visibly quoted, removable, bounded, cleaned of terminal escape data, and treated
  as untrusted input.
- Slash commands remain valid and do not accidentally consume pending quote context.
- A failed launch collapses the empty split and shows a user-facing error.
- Platform-specific behavior stays behind existing runtime checks.
