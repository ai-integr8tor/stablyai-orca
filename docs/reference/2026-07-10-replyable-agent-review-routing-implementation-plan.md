# Replyable Agent Review Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` and execute this plan one checkbox at a time.

**Goal:** Ensure prompts that require an agent review, verdict, or answer to return use Orca's reply-capable orchestration transport instead of one-way raw terminal input.

**Architecture:** Keep the public CLI/RPC protocol unchanged. Clarify the transport-selection contract in both public skills, then extend the existing generic push-on-idle path so it resolves renderer leaf handles and synthetic background-PTY handles. True ownership transfer uses `terminal send`; one blocking answer uses `orchestration ask`; asynchronous dialogue uses `orchestration send` plus `reply`.

**Tech Stack:** TypeScript, Markdown skill guidance, Node.js, Vitest, pnpm.

## Global Constraints

- Work only in this worktree and do not rebase or replace the existing design commit.
- Modify only the six implementation files named in this plan plus the committed plan/design documentation.
- Follow red-green TDD: write guidance assertions first, run them, and observe failure before editing either skill.
- Do not add a CLI command, flag, RPC method, UI, or provider-specific runtime branch.
- Keep the rule compatible with every supported agent and with local, SSH, macOS, Linux, and Windows execution.
- Preserve the existing full-handoff lifecycle prohibition when no response is expected.
- Do not add lint suppressions or vague new modules.

---

## Task 1: Add failing routing-contract tests

**Files:**

- Modify: `config/scripts/orca-cli-skill-guidance.test.mjs`
- Modify: `config/scripts/orchestration-skill-guidance.test.mjs`
- Test: `config/scripts/orca-cli-skill-guidance.test.mjs`
- Test: `config/scripts/orchestration-skill-guidance.test.mjs`

- [ ] In each guidance suite, add a focused test for the three transport lanes. Scope assertions to the relevant `Full Handoffs`, `Terminal rules`, or new reply-routing section rather than merely searching unrelated command examples.
- [ ] Require both skills to state all of these contracts with unambiguous wording:

```text
No response expected -> terminal send, then stop monitoring.
One blocking review, verdict, or answer -> orchestration ask to a concrete terminal handle.
Asynchronous or multi-message exchange -> orchestration send, then orchestration reply.
The required return path overrides handoff wording.
An ask timeout must not trigger an automatic resend or silently fall back to terminal send.
```

- [ ] Require the orchestration guidance to show the concrete command shapes:

```bash
orca orchestration ask --to <concrete-handle> --question <text> --timeout-ms <n> --json
orca orchestration send --to <concrete-handle> --subject <text> --body <text> --json
orca orchestration reply --id <msg_id> --body <text> --json
```

- [ ] Require an explicit statement that `ask` rejects group addresses and therefore needs a concrete terminal handle.
- [ ] Preserve existing assertions that a true full handoff creates no task/dispatch lifecycle and is not monitored.
- [ ] Run the two focused suites before editing the skills:

```bash
pnpm exec vitest run --config config/vitest.config.ts \
  config/scripts/orca-cli-skill-guidance.test.mjs \
  config/scripts/orchestration-skill-guidance.test.mjs
```

Expected: the new routing assertions fail because the current skills do not spell out the review/verdict override or timeout rule.

## Task 2: Document one consistent replyable-routing contract

**Files:**

- Modify: `skills/orca-cli/SKILL.md`
- Modify: `skills/orchestration/SKILL.md`

- [ ] Add a short, concrete transport-selection block to `skills/orca-cli/SKILL.md` near `Full Handoffs` or `Terminal rules`:

```markdown
Choose the transport from the required return path:

- If ownership transfers and no response is expected, use `orca terminal send ...` and stop monitoring.
- If one blocking review, verdict, or answer must return, use `orca orchestration ask --to <concrete-handle> ...`; `ask` does not accept group addresses.
- If the exchange may be asynchronous or require multiple messages, use `orca orchestration send ...` and have the recipient answer with `orca orchestration reply ...`.

The required return path overrides words such as "handoff." If `ask` times out, do not resend automatically: the original `decision_gate` remains persisted and may still be answered. Reconcile its delivery state before retrying; because `ask` has no idempotency key, surface the timeout without resubmitting when delivery cannot be determined. Never fall back to raw `terminal send`.
```

- [ ] Add the equivalent authoritative routing rule to `skills/orchestration/SKILL.md` near `Messaging`/`Full Handoffs`, with the three full command shapes from Task 1.
- [ ] State why the distinction exists in one short sentence: raw `terminal send` is terminal input and does not carry a structured sender, message ID, thread, or reply route.
- [ ] Keep true one-way handoff examples and their no-task/no-monitor guarantees unchanged.
- [ ] Run the focused suites and require all tests to pass.

## Task 3: Verify scope and commit the guidance fix

**Files:**

- Verify: `skills/orca-cli/SKILL.md`
- Verify: `skills/orchestration/SKILL.md`
- Verify: `config/scripts/orca-cli-skill-guidance.test.mjs`
- Verify: `config/scripts/orchestration-skill-guidance.test.mjs`

- [ ] Run Markdown/test-file formatting checks without rewriting unrelated files:

```bash
pnpm exec oxfmt --check \
  config/scripts/orca-cli-skill-guidance.test.mjs \
  config/scripts/orchestration-skill-guidance.test.mjs
git diff --check
```

- [ ] Run the focused suites again from a clean command invocation.
- [ ] Confirm `git status --short` lists no files outside the four-file implementation scope.
- [ ] Review both skills side by side to ensure the lane names, `ask` handle requirement, timeout behavior, and true-handoff rule do not conflict.
- [ ] Commit the implementation:

```bash
git add \
  skills/orca-cli/SKILL.md \
  skills/orchestration/SKILL.md \
  config/scripts/orca-cli-skill-guidance.test.mjs \
  config/scripts/orchestration-skill-guidance.test.mjs
git commit -m "docs: route replyable agent requests through orchestration"
```

- [ ] Send exactly one `worker_done` message using the live Orca dispatch preamble, including the commit hash, test results, and the four modified paths.

---

## Live-validation addendum: Deliver messages to background PTYs

The guidance implementation above remains required, but a live `ask` smoke found
that a synthetic background-PTY handle stores the decision gate without pushing
it into the idle agent. Manual `orchestration check` followed by `reply` returned
`GROK_REPLY_OK`, proving persistence and reply routing are sound and isolating
the gap to automatic delivery.

## Task 4: Add failing background-PTY delivery regressions

**Files:**

- Modify: `src/main/runtime/orca-runtime.test.ts`
- Test: `src/main/runtime/orca-runtime.test.ts`

- [ ] Add `delivers pending orchestration messages to an already-idle background PTY` using a runtime-created background terminal, an in-memory orchestration store, and a recording PTY controller.
- [ ] Drive the PTY to idle with a recognized Grok idle title, insert a message to the returned synthetic handle, call `deliverPendingMessagesForHandle`, and assert the formatted subject plus the delayed Enter are written and `delivered_at` becomes non-null while `read` remains `0`.
- [ ] Add `delivers queued orchestration messages when a background PTY becomes idle`: set a recognized Grok working title, insert and attempt delivery (expect no write), then emit a recognized idle title and expect one injection plus one delayed Enter.
- [ ] Add or extend a safety regression proving a background Cursor Agent message is injected but not auto-submitted.
- [ ] Run only the new tests before implementation:

```bash
pnpm exec vitest run --config config/vitest.config.ts \
  src/main/runtime/orca-runtime.test.ts \
  -t "background PTY.*orchestration|orchestration.*background PTY"
```

Expected: the new delivery assertions fail because
`deliverPendingMessagesForHandle` resolves only live renderer leaves and the
background PTY idle transition does not invoke delivery.

## Task 5: Extend the generic push-on-idle target path

**Files:**

- Modify: `src/main/runtime/orca-runtime.ts`

- [ ] Refactor the existing delivery body into one private target-level path that preserves payload formatting, split Enter timing, `delivered_at`/`read` separation, active-coordinator protection, and Cursor Agent no-auto-submit behavior.
- [ ] Keep the existing renderer-leaf wrapper and add a synthetic background-PTY wrapper using `pty.connected`, `pty.ptyId`, its retained titles/status, and the existing `handleByPtyId` identity. Do not mint an unrelated recipient handle during delivery.
- [ ] In `deliverPendingMessagesForHandle`, resolve a live synthetic PTY before falling back to the live renderer leaf, and push immediately only when the retained status is `idle`.
- [ ] On a background PTY status transition to `idle`, invoke its delivery wrapper after resolving TUI-idle waiters so messages queued while working are not stranded.
- [ ] Do not add a Grok branch. Grok titles only reproduce the generic retained-PTY path.
- [ ] Run the Task 4 command and require all new regressions to pass.

## Task 6: Verify the combined guidance and runtime fix

**Files:**

- Verify: `src/main/runtime/orca-runtime.ts`
- Verify: `src/main/runtime/orca-runtime.test.ts`
- Verify: `skills/orca-cli/SKILL.md`
- Verify: `skills/orchestration/SKILL.md`
- Verify: `config/scripts/orca-cli-skill-guidance.test.mjs`
- Verify: `config/scripts/orchestration-skill-guidance.test.mjs`

- [ ] Run the complete affected suites:

```bash
pnpm exec vitest run --config config/vitest.config.ts \
  src/main/runtime/orca-runtime.test.ts \
  src/main/runtime/rpc/methods/orchestration.test.ts \
  src/main/runtime/orchestration/formatter.test.ts \
  config/scripts/orca-cli-skill-guidance.test.mjs \
  config/scripts/orchestration-skill-guidance.test.mjs
```

- [ ] Run non-writing format, type, max-lines, and whitespace gates:

```bash
pnpm exec oxfmt --check \
  src/main/runtime/orca-runtime.ts \
  src/main/runtime/orca-runtime.test.ts \
  config/scripts/orca-cli-skill-guidance.test.mjs \
  config/scripts/orchestration-skill-guidance.test.mjs
pnpm typecheck:node
pnpm check:max-lines-ratchet
git diff --check
```

- [ ] Confirm no files outside the six-file implementation scope changed.
- [ ] Commit only the runtime follow-up files:

```bash
git add src/main/runtime/orca-runtime.ts src/main/runtime/orca-runtime.test.ts
git commit -m "fix: deliver orchestration messages to background PTYs"
```

- [ ] Send exactly one `worker_done` for the new live dispatch with the runtime commit hash, red/green evidence, full-suite results, and the two runtime paths.
