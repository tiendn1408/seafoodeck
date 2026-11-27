# Machine Voice Edge Cases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two small status bugs left after the machine voice feature: a status that never leaves "Đang đọc" when the engine never reports back, and an approved-audio player that keeps showing "Đang phát" after machine voice (or `stopAudio()`) interrupts it.

**Architecture:** A watchdog inside `speechVoice.ts` for the first bug; a reset hook that `stopAudio()` calls for the second. Web only; no API, DB, Docker or VPS change.

**Tech Stack:** React 19, TypeScript, Vitest 5 + jsdom with fake timers (`vi.useFakeTimers`).

**Spec:** `docs/superpowers/specs/2026-11-27-machine-voice-design.md` (behaviour unchanged except the two fixes below).

## Global Constraints

- All constraints of `docs/superpowers/plans/2026-11-27-machine-voice.md` still hold (no scoring effect, `vi` never, listening untouched, no network call, one sound at a time, Vietnamese copy, `speechVoice.ts` must not import `Media.tsx`, no two files differing only by case).
- Bug A (stuck "Đang đọc"): if the engine never fires `start` within 3000 ms of `speak`, treat it as a fatal failure: status becomes "Không đọc được. Hãy thử lại." (the existing fatal message). If it fired `start` but never fires `end` within 15000 ms, clear the status to empty (no error text). Every timer is cleared on `end`, `error`, cancel, takeover by another sound, label/kind change and unmount. A normal utterance must behave exactly as today.
- Bug B (stale "Đang phát"): when `stopAudio()` stops a playing clip (called by machine voice, by a speed toggle, by another `Pronunciation`, or on unmount), the `Pronunciation` that owned that clip resets its status to empty. A clip that ends normally still shows "Đã phát xong"; an `error` still shows the existing retry text. `stopAudio()` stays safe to call when nothing is playing.
- Gates that must stay green: `npm test` (web 368, studio 136, API 435, scripts 58 before this work), `npm run lint` (0 warnings), `npm run format:check`, `npm run build`, `npm run check:bundle`.

## Review Focus

1. A utterance that starts and ends normally must not be affected by the watchdog (timers cleared; no late "Không đọc được" after "Đã đọc xong"). Pinned in the task.
2. Android with no TTS engine / a stalled remote Chrome voice: `speak` but no event at all: the button must recover to an error message, and the next click must work. Pinned.
3. Takeover while a watchdog is pending (A waiting for `start`, B starts): A's timers must not fire later and change A's status. Pinned.
4. A `Pronunciation` interrupted while its URL is still loading (before `Audio` exists): no crash, no stale status. Pinned.
5. Unmount with a pending watchdog or a playing clip: no state update on an unmounted component, no warning in test output. Pinned.

---

### Task 1: Watchdog and stopAudio reset

**Files:**
- Modify: `apps/web/src/pilot/speechVoice.ts`, `apps/web/src/pilot/MachineVoice.tsx` (only if needed), `apps/web/src/pilot/Media.tsx` (`stopAudio`, `Pronunciation`)
- Test: `apps/web/src/pilot/speechVoice.test.ts`, `apps/web/src/pilot/MachineVoice.test.tsx`, and a test for `Pronunciation` in the existing Media test file if one exists, else `apps/web/src/pilot/Media.test.tsx`

**Interfaces:**
- Consumes: existing `speak(kind, label, slow, on)` (the `on` handlers: `start`, `end`, `error(fatal)`, optional `reset`), `cancelSpeech()`, `stopAudio()`, `Pronunciation`.
- Produces: no new exported API is required. The watchdog lives inside `speak` and reports through the existing `on.error(true)` / `on.reset()` handlers; `stopAudio()` additionally calls a module-private reset callback registered by the `Pronunciation` that started the current clip.

- [ ] **Step 1: Write failing tests for bug A** using fake timers and the existing fake `speechSynthesis`: (a) `speak` with a fake that never fires any event, advance 3000 ms, assert `on.error` called once with `true` and the status text in `MachineVoice` is "Không đọc được. Hãy thử lại."; (b) fire `start` at 100 ms, never `end`, advance 15000 ms, assert the status is empty and no error text; (c) fire `start` then `end` normally, advance 20000 ms, assert no extra `error`/`reset` calls and the status stays "Đã đọc xong" (Review Focus 1); (d) A waits for `start`, B starts, advance 3000 ms: A's status unchanged by A's timer (Review Focus 3); (e) after the stuck failure a second click on `Nghe` speaks again (Review Focus 2); (f) unmount with a pending watchdog, advance timers, no state update warning (Review Focus 5).
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/pilot/speechVoice.test.ts src/pilot/MachineVoice.test.tsx`; confirm the new tests FAIL.
- [ ] **Step 3: Implement the watchdog in `speechVoice.ts`**: start a 3000 ms timer in `speak`; `start` cancels it and arms a 15000 ms timer; `end`, `error`, `cancelSpeech`, `releaseOwner`/takeover and a new `speak` clear whichever timer is pending; the 3000 ms expiry calls `on.error(true)` and cancels the engine; the 15000 ms expiry calls `on.reset()`. Guard with the existing `active` flag so a superseded utterance's timers never act.
- [ ] **Step 4: Run** the same command; PASS.
- [ ] **Step 5: Write failing tests for bug B** (Media test file, jsdom, stub global `Audio` whose `play` resolves and which exposes `pause`/`onended`/`onerror`, and an `api` mock or `initialUrl` so no network is needed): (a) render `Pronunciation` with `initialUrl`, click `Nghe`, status shows "Đang phát"; call `stopAudio()`; status becomes empty; (b) the same but the interruption is clicking `Nghe` of a `MachineVoice` (with the fake `speechSynthesis` and a voice): the clip's status becomes empty; (c) a clip that ends normally still shows "Đã phát xong" and a later `stopAudio()` does not change it; (d) `stopAudio()` with nothing playing does not throw; (e) interrupting during URL loading (resolve the URL after `stopAudio()`): no crash, status empty, nothing plays (Review Focus 4); (f) unmounting a playing `Pronunciation` emits no warning.
- [ ] **Step 6: Run** `cd apps/web && npx vitest run src/pilot`; confirm the new tests for bug B FAIL.
- [ ] **Step 7: Implement in `Media.tsx`**: a module-level `playingReset: (() => void) | null` set by `Pronunciation` when it starts a clip; `stopAudio()` calls it (then nulls it) after pausing; `Pronunciation` also resets on unmount through the same path. Keep the current `generation` logic.
- [ ] **Step 8: Run** the focused tests (PASS), then the full gates from the repo root: `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:bundle`.
- [ ] **Step 9: Commit** `fix(web): machine voice watchdog and stale Đang phát status`.
