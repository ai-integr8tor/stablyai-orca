# Replyable Agent Review Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` and execute this plan one checkbox at a time.

**Goal:** Ensure prompts that require an agent review, verdict, or answer to return use Orca's reply-capable orchestration transport instead of one-way raw terminal input.

**Architecture:** Keep the existing CLI and runtime unchanged. Clarify the transport-selection contract in both public skills and enforce it with executable Markdown guidance tests: true ownership transfer uses `terminal send`; one blocking answer uses `orchestration ask`; asynchronous dialogue uses `orchestration send` plus `reply`.

**Tech Stack:** Markdown skill guidance, Node.js, Vitest, pnpm.

## Global Constraints

- Work only in this worktree and do not rebase or replace the existing design commit.
- Modify only the four implementation files named below plus this already-committed plan/design documentation.
- Follow red-green TDD: write guidance assertions first, run them, and observe failure before editing either skill.
- Do not add a CLI command, flag, RPC method, runtime branch, UI, or provider-specific wording.
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
An ask timeout must not silently fall back to terminal send.
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

The required return path overrides words such as "handoff." If `ask` times out, report or retry the orchestration failure; do not silently fall back to raw `terminal send`.
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
