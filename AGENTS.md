# File handoff

User preference: after processing inbox files, report results in chat. Create or update an outbox deliverable only when a concrete response, request, or asset genuinely needs to be handed to another party. Do not generate an outbox file merely to duplicate a chat report or document internal work. Clearly identify any current file the user should forward; never send it externally without authorization.

When a task involves `_inbox/` or `_outbox/`, read `docs/FILE_HANDOFF.md` before processing files.

- Use batch IDs and reconcile against that batch's request manifest. Never mix batches or infer species/HS IDs from appearance alone.
- Keep application runtime and release builds independent of `_inbox/`, `_outbox/`, and `_archive/`.
- After processing an input, record its disposition and destination before moving it to `_archive/inbox/<batch-id>/`. Once inputs have been processed, archive them even if content approval remains pending; track pending decisions in docs/handoffs, not by leaving old files in inbox.
- After reconciling a processed handoff, clear both active folders: archive useful originals and provenance, delete redundant files and empty folders. Record receipt closure separately from outstanding public-content approvals in `docs/handoffs/`. The user has explicitly authorized this cleanup; do not repeatedly ask for confirmation.
- Keep only the current deliverable in the active outbox. Superseded briefs/responses may be moved to the batch's archive after recording the move; this does not close the batch.
- Prefer moving to the archive over deleting originals. Do not delete approved runtime assets or provenance when cleaning handoff folders.
- These are manual agent workflows, not a background watcher or automatic approval mechanism.
