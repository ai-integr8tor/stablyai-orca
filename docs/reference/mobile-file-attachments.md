# Mobile Any-File Attachments — Design

**Date:** 2026-07-16
**Status:** Approved (pending spec review)
**Target:** PR against `stablyai/orca` `main`

## Problem

The mobile app's attach button is image-only. Tap opens the photo library
(`mediaTypes: ['images']`); long-press opens the iOS/Android document picker but
filters to `type: 'image/*'`, so PDFs, text files, logs, and CSVs are greyed out
and unselectable. Users cannot hand an agent a document from their phone.

Everything else in the pipeline is already content-agnostic: the chunked upload
RPCs (`clipboard.startImageUpload` → `appendImageUploadChunk` →
`commitImageUpload`), the SSH-aware temp-file write, and the bracketed-paste
path injection all move opaque base64 to a host file and paste its path. The
image-only behavior lives in exactly three places:

1. `mobile/src/session/mobile-image-source-picker.ts` — `image/*` picker filter;
   discards the picked file's name.
2. `src/main/window/clipboard-image-temp-file.ts` — hardcodes the temp filename
   `orca-paste-<ts>-<uuid>.png`.

(The downscale-to-fit logic in `mobile-clipboard-image.ts` belongs to the
clipboard *paste* path only — picker attachments already fail fast with a
"too large" toast today. This design does not touch the paste path.)

## Goals

- Attach any file type from the mobile Files picker (long-press), for both the
  "docs as agent context" case (PDF, txt, log, CSV) and general desktop parity.
- Preserve the original filename so the agent sees meaningful context.
- Keep the existing ~24MB-base64 (~18MB binary) budget; oversized non-image
  files fail fast with a clear error (no downscale equivalent exists for them).
- Work identically for local and SSH-remote worktrees.
- Degrade cleanly against older desktop hosts.

## Non-Goals

- Raising the size cap or streaming uploads to disk.
- Multiple-file selection (picker stays `multiple: false`, matching images).
- Changing tap behavior (photo library) or adding new UI surfaces.
- New RPC methods — the existing clipboard upload channel is extended, not
  duplicated.

## Design

### 1. UX (mobile)

- Tap: photo library, unchanged.
- Long-press: document picker becomes `type: '*/*'` when the paired host
  supports filenames (see §4); otherwise it keeps today's `image/*` filter so
  users never pick a file the host would mangle.
- Accessibility label/hint updated to say "file", not "image", when unfiltered.
- New toast for oversized non-image files: "File too large to attach".
  Existing toasts (permission denied, disconnected, generic failure) unchanged.

### 2. Mobile pipeline

- The picker returns `{ base64, fileName, mimeType }` instead of bare
  `{ base64 }`; `expo-document-picker` already supplies `name` and `mimeType`.
  Photo-library picks return no `fileName` (they are unnamed pastes today).
  Both sources keep today's fail-fast behavior when over the upload budget —
  no picker-path downscaling exists or is added.
- Renames (repo naming rule: name modules for what they contain):
  - `mobile-image-source-picker.ts` → `mobile-attachment-picker.ts`
  - `mobile-image-attachment.ts` → `mobile-terminal-attachment.ts`
  - `use-mobile-image-attachment.ts` → `use-mobile-terminal-attachment.ts`
  - `PickedMobileImage` → `PickedMobileAttachment`, `MobileImageSource` →
    `MobileAttachmentSource`, and callers follow.
  - `mobile-clipboard-image.ts` keeps its name where it serves clipboard image
    paste; the shared upload entry point (`saveMobileClipboardImageAsTempFile`)
    gains an optional `fileName` arg and a name that reflects the general role
    (`saveMobileAttachmentAsTempFile`).

### 3. Protocol and host

- `clipboard.startImageUpload` and `clipboard.saveImageAsTempFile` params gain
  one optional field: `fileName: string`. Method names stay — renaming breaks
  compatibility; a comment marks them as the generic blob-to-temp-file channel.
- On commit, when `fileName` is present the host writes
  `orca-file-<ts>-<uuid>-<sanitized-name>`; when absent, today's
  `orca-paste-<ts>-<uuid>.png` (byte-identical behavior for existing callers).
- Sanitization is host-side only (`clipboard-image-temp-file.ts`) — the phone
  is untrusted input:
  - Strip path separators (`/` and `\`), control characters, and leading dots.
  - Cap the sanitized basename at 80 characters (preserving the extension where
    possible).
  - If nothing survives sanitization, fall back to the generated name with no
    original-name suffix.
- Identical naming for local temp writes and SSH SFTP writes; the bracketed
  paste payload (`buildMobileImagePastePayload`) is unchanged.

### 4. Version gate

- Desktop bumps `RUNTIME_PROTOCOL_VERSION` 3 → 4 in
  `src/shared/protocol-version.ts` when it starts honoring `fileName`.
- Mobile already receives `status.protocolVersion`. The session screen enables
  the unfiltered picker only when `protocolVersion >= 4`; below that,
  long-press keeps the current image-only behavior. Rationale: old hosts
  silently strip unknown zod fields and would save a PDF as `….png`, which
  agents then misread (extension sniffing).
- `MIN_COMPATIBLE_DESKTOP_VERSION` does **not** bump — feature detection only,
  no hard-block.
- `mobile/src/transport/protocol-version.ts` mirrors the desktop constant per
  the existing manual-sync comment.

### 5. Error handling

- Reuses existing paths: abort-on-failure releases the host upload slot;
  disconnected and permission toasts unchanged.
- Size-limit error message generalized so both image and file cases read
  correctly on the phone.

### 6. Testing

- Mobile (vitest): picker returns `fileName` for document picks; attachment
  flow passes `fileName` through to the upload; version gate chooses filtered
  vs unfiltered picker; oversized document pick surfaces the size toast.
- Host (vitest): `fileName` sanitization table — path traversal (`../../x`),
  separators, control chars, leading dots, empty-after-sanitize, >80 chars,
  unicode names; commit naming with and without `fileName`; unchanged behavior
  when `fileName` is absent.
- Both suites run in CI as today (`pnpm test`, mobile vitest config).

## Compatibility Matrix

| Mobile | Desktop host | Behavior |
| --- | --- | --- |
| new | new (v4) | Any file attaches with sanitized original name |
| new | old (v3) | Long-press stays image-filtered (gate); images work as today |
| old | new (v4) | No `fileName` sent → exact current behavior (`.png` temp name) |
| old | old | Unchanged |

## Precedent

Upstream #7832 (`feat(native-chat): upload composer attachments over SSH`)
already established "attach any file; non-images become path references" for
the desktop native-chat composer. This design brings the equivalent capability
to the mobile terminal attach flow.
