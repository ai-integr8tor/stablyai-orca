# Replyable Agent Review Routing Design

## Problem

Orca exposes two distinct communication contracts:

- `terminal.send` injects one-off PTY input and carries no sender, message ID,
  thread, inbox, or reply tracking.
- orchestration messages persist sender and thread metadata and provide
  `ask`/`reply` flows.

Current agent guidance strongly classifies handoff wording as a full ownership
transfer. It does not state clearly enough that a review or verification request
which expects a verdict back is not a full handoff. Agents can therefore send the
request with `terminal.send`, finish the review in the recipient, and leave the
recipient without a return address.

## Goals

- Make expected-response semantics override incidental handoff wording.
- Route a single blocking review/verdict request through
  `orca orchestration ask` with a concrete terminal handle.
- Route asynchronous or multi-message review conversations through
  `orca orchestration send` plus `orca orchestration reply`.
- Preserve raw `terminal.send` for genuine one-way ownership transfers where the
  sender stops and does not wait for a response.
- Apply the rule to all supported agents and local/SSH environments.

## Non-Goals

- Add a new CLI verb, `terminal send --replyable`, or another message protocol.
- Change the existing `orchestration.ask`, `send`, or `reply` runtime behavior.
- Convert every full handoff into supervised task/dispatch lifecycle state.
- Add provider-specific Grok or Codex logic.
- Add UI controls.

## Routing Decision

The sender decides from the required outcome rather than the word “handoff”:

1. If ownership transfers and no response is expected, use `terminal.send` (or a
   worktree creation prompt), then stop monitoring.
2. If one answer, review, approval, or verdict must return before the sender can
   continue, use `orchestration ask` and wait for its result.
3. If the conversation is asynchronous or may need multiple replies, use
   `orchestration send`; the recipient answers with the injected
   `orchestration reply --id ...` command.
4. Task/dispatch lifecycle remains reserved for supervised work that needs task
   ownership, heartbeat, escalation, or `worker_done` authority.

## Data Flow

For the blocking review case:

1. The sender runs `orca orchestration ask --to <concrete-handle> --question ...`.
2. Orca records the sender from `ORCA_TERMINAL_HANDLE`, persists a decision-gate
   message, and injects it when the recipient can accept agent input.
3. The recipient sees the sender metadata and the exact
   `orca orchestration reply --id <message-id> --body ...` command.
4. Reply routing targets the original sender and retains the thread.
5. The sender's `ask` call returns the answer or a documented timeout.

The guidance must not recommend an agent-name group for `ask`, because blocking
questions require one concrete recipient.

## Error Handling

- An `ask` timeout remains a non-zero result with no answer; guidance must not
  silently fall back to raw `terminal.send`, which would discard reply metadata.
- Stale terminal handles follow the existing Orca recovery rule: reacquire the
  live handle, then retry the structured operation.
- If orchestration is disabled or unavailable, report that limitation instead of
  claiming the exchange is reply-tracked.

## Files

- `skills/orca-cli/SKILL.md`: distinguish one-way full handoffs from replyable
  review requests at the terminal-send decision boundary.
- `skills/orchestration/SKILL.md`: document blocking `ask` and asynchronous
  `send`/`reply` review flows while preserving full-handoff ownership rules.
- `config/scripts/orca-cli-skill-guidance.test.mjs`: lock the terminal-send
  restriction and replyable-review routing language.
- `config/scripts/orchestration-skill-guidance.test.mjs`: lock the decision rule,
  concrete-recipient requirement, commands, and full-handoff non-regression.

## Testing

Development follows red-green TDD:

1. Add guidance assertions for replyable review/verdict routing and observe them
   fail against the current skills.
2. Update the two skills with the minimal routing rules and examples.
3. Run both guidance suites.
4. Run existing orchestration CLI/RPC/formatter tests to prove the documented
   commands and reply metadata remain valid.
5. Run formatting and repository validation gates relevant to skill changes.

## Success Criteria

- A request that expects a verdict back is never documented as a one-off
  `terminal.send` full handoff.
- The blocking path names `orchestration ask` with a concrete terminal handle.
- The asynchronous path names `orchestration send` and `orchestration reply`.
- Genuine one-way full handoffs still transfer ownership without task/dispatch
  lifecycle or completion monitoring.
- Tests fail if future guidance removes this distinction.
