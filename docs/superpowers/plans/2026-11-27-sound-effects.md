# Sound Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play four short, quiet, synthesised sounds (correct, wrong, neutral, session done) in the learner Study screen, with an on/off switch and a volume slider remembered per device.

**Architecture:** A settings module with a tiny shared store (`soundSettings.ts`), a Web Audio synthesiser (`sfx.ts`) that never plays over machine voice or a clip, a `SoundControl` component in the study bar, and wiring into the existing `Feedback` block and the end-of-session `Summary`. Web only: no API, DB, Docker or VPS change, no new dependency.

**Tech Stack:** React 19, TypeScript, Vitest 5 + jsdom (`vitest run` in `apps/web`), browser Web Audio (`AudioContext`).

**Spec:** `docs/superpowers/specs/2026-11-27-sound-effects-design.md`

## Global Constraints

- Four sounds only, each under 0.5 s, synthesised with Web Audio (no audio file, no library). Exact notes, auditioned and accepted by the owner on 27/11/2026 (`{frequency Hz, start ms, length ms, wave}`): `correct` = `{660,0,110,sine}` + `{880,90,170,sine}`; `wrong` = `{220,0,260,triangle}`; `neutral` = `{1200,0,45,sine}`; `done` = `{523,0,120,sine}` + `{659,110,120,sine}` + `{784,220,220,sine}`. Envelope per note: linear attack to the peak over 8 ms, then exponential decay to 0.0001 at the end of its length. The audition page is `.local/sound-preview/index.html` (not in git).
- Defaults: sound ON, volume `0.25`. Peak output = `volume * 0.3` (so the default peak is `0.075`; at 100% it is `0.3`). Volume is clamped to `[0, 1]`.
- Settings persist per device in `localStorage` under the key `seafoodeck.sound.v1` as `{ on: boolean, volume: number }`; every read and write is wrapped in try/catch; the feature works when storage is unavailable; invalid stored data falls back to the defaults.
- No effect plays while `speechSynthesis` is speaking or an approved-audio clip is playing; a new effect stops the previous effect (one effect at a time).
- iPhone/Safari: create and `resume()` the `AudioContext` on the first `pointerdown` or `keydown` inside the Study screen (not later from an async result). The unlock listeners stay installed until a context has actually been created (if sound is OFF at the first gesture they are kept, so switching sound ON later still unlocks on the next gesture); only the returned remover or a successful creation detaches them. `playSfx` before unlock is a silent no-op, never an error. With sound OFF no `AudioContext` is created. With no `AudioContext` available (tests, old browsers) everything is a silent no-op.
- One effect per result: `Feedback` plays once per `questionId` (not again when a provisional score is replaced by the server score for the same question, not on re-render). `Summary` plays `done` once on mount.
- Never changes scores, review schedule, progress, API calls or stored learning data. Listening and all other question types get the same feedback sounds; machine voice and approved audio behaviour are unchanged.
- Copy is Vietnamese. File names must not differ only by case (`sfx.ts`, `soundSettings.ts`, `SoundControl.tsx` are distinct). `speechVoice.ts` must not import `Media.tsx`.
- Gates that must stay green: `npm test` (web 385, studio 136, API 435, scripts 58 before this work), `npm run lint` (0 warnings), `npm run format:check`, `npm run build`, `npm run check:bundle`.

## Review Focus

1. iPhone unlock: the context is created and resumed on the first gesture, so a sound requested later from an async result plays; before any gesture `playSfx` is a silent no-op. Pinned in Task 1.
2. Never talk over voice: `speechSynthesis.speaking` or a playing clip skips the effect. Pinned in Task 1.
3. Exactly once: a rerender, a provisional-to-server score replacement for the same `questionId`, and the same result rendered in several places of `QuestionView` each play one sound, not more. Pinned in Task 2.
4. Corrupt or unavailable storage, out-of-range or non-numeric volume, volume 0, sound OFF (no `AudioContext` created). Pinned in Task 1.
5. Rapid answers: effects never pile up (a new effect stops the previous); unmount cleans up listeners. Pinned in Tasks 1 and 2.
6. The slider gives feedback (a preview `neutral` tick when the value is committed) and the control is keyboard and screen-reader usable. Pinned in Task 2.

---

### Task 1: Settings and synthesiser

**Files:**
- Create: `apps/web/src/learner/sound/soundSettings.ts`, `apps/web/src/learner/sound/soundSettings.test.ts`, `apps/web/src/learner/sound/sfx.ts`, `apps/web/src/learner/sound/sfx.test.ts`
- Modify: `apps/web/src/pilot/Media.tsx` (export `isClipPlaying()` returning whether a file clip is currently playing; no behaviour change)

**Interfaces:**
- Produces (Task 2 relies on exactly these):
  - `soundSettings.ts`: `export type SoundSettings = { on: boolean; volume: number }`, `export const DEFAULT_SOUND: SoundSettings` (`{ on: true, volume: 0.25 }`), `export function loadSoundSettings(): SoundSettings`, `export function saveSoundSettings(s: SoundSettings): void`, `export function getSoundSettings(): SoundSettings` (current shared value), `export function updateSoundSettings(patch: Partial<SoundSettings>): void` (clamps, saves, notifies), `export function useSoundSettings(): SoundSettings` (React hook over the shared store, `useSyncExternalStore`), `export function resetSoundSettingsForTests(): void`.
  - `sfx.ts`: `export type SfxKind = 'correct' | 'wrong' | 'neutral' | 'done'`, `export function sfxPeak(volume: number): number`, `export function installSoundUnlock(): () => void` (adds one-time `pointerdown`/`keydown` listeners on `document`, returns a remover), `export function playSfx(kind: SfxKind): boolean` (true only when a sound was scheduled).
  - `Media.tsx`: `export function isClipPlaying(): boolean`.

- [ ] **Step 1: Write failing tests for `soundSettings.ts`**: defaults are `{ on: true, volume: 0.25 }`; `loadSoundSettings` clamps `volume` 1.7 to 1 and -3 to 0, ignores a non-number volume and a non-boolean `on`, returns defaults for invalid JSON, a missing key, and when `localStorage.getItem` throws; `saveSoundSettings` writes `{"on":..,"volume":..}` under `seafoodeck.sound.v1` and does not throw when `setItem` throws; `updateSoundSettings({ volume: 2 })` stores 1 and notifies subscribers; `useSoundSettings` re-renders a mounted component when `updateSoundSettings` is called from outside (use `mount`/`unmountAll` from `apps/web/src/learner/testDom.ts`).
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/learner/sound/soundSettings.test.ts`; confirm FAIL (module not found).
- [ ] **Step 3: Implement `soundSettings.ts`** with the signatures above (module-level store, listener set, `useSyncExternalStore`).
- [ ] **Step 4: Run** the same command; PASS.
- [ ] **Step 5: Write failing tests for `sfx.ts`** with a `FakeAudioContext` installed through `vi.stubGlobal('AudioContext', ...)` that records created oscillators (frequency, type, start and stop times), gain nodes (peak value) and `resume`/`close` calls, and unstubs after each test: `sfxPeak(0.25) === 0.075`, `sfxPeak(1) === 0.3`, `sfxPeak(2) === 0.3`, `sfxPeak(-1) === 0`; before any gesture `playSfx('correct')` returns `false` and creates no context (Review Focus 1); after `installSoundUnlock()` and one dispatched `pointerdown` on `document` a context is created once and `resume()` called, a second `pointerdown` does not create another; when sound is OFF at the first `pointerdown` no context is created, and after `updateSoundSettings({ on: true })` the next `pointerdown` creates it; `playSfx('correct')` then returns `true` and schedules exactly two oscillators, `'wrong'` one, `'neutral'` one, `'done'` three, each ending within 0.5 s, each with peak gain `sfxPeak(volume)`; volume 0 returns `false`; sound OFF returns `false` and, when OFF at the first gesture, no `AudioContext` is constructed (Review Focus 4); with `speechSynthesis.speaking === true` (fake) or `isClipPlaying() === true` the call returns `false` (Review Focus 2; make the clip case through the real `Pronunciation` clip start or by mocking `isClipPlaying` at the module boundary with `vi.mock`); two quick `playSfx` calls stop the first effect's oscillators before the second starts (Review Focus 5); the remover returned by `installSoundUnlock` removes both listeners; with `AudioContext` undefined everything returns `false` and nothing throws.
- [ ] **Step 6: Run** `npx vitest run src/learner/sound`; confirm the `sfx` tests FAIL.
- [ ] **Step 7: Implement `sfx.ts` and `isClipPlaying()`** with the signatures above: one lazily created shared `AudioContext` (created only inside the unlock handler and only when `getSoundSettings().on`), each effect built from `OscillatorNode` + `GainNode` with a short attack/release envelope, a module-level handle to stop the previous effect; wrap every Web Audio call so a failure returns `false` instead of throwing.
- [ ] **Step 8: Run** the focused tests (PASS), then the full web suite once (`cd apps/web && npx vitest run`) and from the repo root `npm run lint` and `npm run format:check`.
- [ ] **Step 9: Commit** `feat(web): sound settings and Web Audio effects module`.

### Task 2: SoundControl, wiring, styles and docs

**Files:**
- Create: `apps/web/src/learner/sound/SoundControl.tsx`, `apps/web/src/learner/sound/SoundControl.test.tsx`
- Modify: `apps/web/src/learner/study/Study.tsx` (the `study-bar`: add `<SoundControl />` and call `installSoundUnlock` in a `useEffect` on mount), `apps/web/src/learner/study/QuestionView.tsx` (`Feedback`: play once per question), `apps/web/src/learner/study/HaulSummary.tsx` (`Summary`: play `done` once on mount), `apps/web/src/learner/study/study.css` (button, panel and slider styles using the existing tokens), `README.md` (short Vietnamese section "Hiệu ứng âm thanh")
- Test: `apps/web/src/learner/study/QuestionView.test.tsx`, `apps/web/src/learner/study/Study.test.tsx` (or the existing test file that covers the study bar), plus `SoundControl.test.tsx`

**Interfaces:**
- Consumes (Task 1): `useSoundSettings()`, `updateSoundSettings(patch)`, `getSoundSettings()`, `playSfx(kind)`, `installSoundUnlock()`, `SfxKind`.
- Mapping used by `Feedback`: `skip` and `self` tones play `'neutral'`, `correct` plays `'correct'`, `wrong` plays `'wrong'`.

- [ ] **Step 1: Write failing tests for `SoundControl`**: renders a button with accessible name `Âm thanh hiệu ứng` and `aria-expanded="false"`; clicking opens a group (`role="group"`, name `Âm thanh hiệu ứng`) containing a checkbox `Bật âm thanh` reflecting `on` and a range input named `Âm lượng hiệu ứng` (min 0, max 100, value = volume × 100); toggling the checkbox calls `updateSoundSettings({ on })`; changing the slider updates `volume` live and plays a preview `neutral` sound once when the value is committed (Review Focus 6; spy on `playSfx` by `vi.mock('./sfx')`); the button icon reflects on/off (mute icon when off or volume 0, with the state in the accessible name, for example `Âm thanh hiệu ứng: tắt`); Escape closes the panel and returns focus to the button; unmount removes any document listeners.
- [ ] **Step 2: Write failing wiring tests** (mock `../sound/sfx` with `vi.mock` and assert on `playSfx`): a mounted `QuestionView` whose result is `correct` calls `playSfx('correct')` once, `wrong` calls `playSfx('wrong')` once, `skipped` and `selfRated` call `playSfx('neutral')` once (Review Focus 3); re-rendering with the same result object, and with a different result object for the same `questionId` (provisional replaced by server score), does not call it again; a result for a new `questionId` calls it again; a question shown with no result plays nothing; the same result rendered in all the places `QuestionView` renders `Feedback` still plays exactly once; `Summary` calls `playSfx('done')` once on mount and not on re-render; `Study` mounts `SoundControl` in `.study-bar` and calls `installSoundUnlock` once on mount and its remover on unmount.
- [ ] **Step 3: Run** `cd apps/web && npx vitest run src/learner`; confirm the new tests FAIL.
- [ ] **Step 4: Implement `SoundControl.tsx`** and the wiring: `Feedback` uses a `useEffect` keyed on `result.questionId` with a ref of the last played id so it plays once per question; `Summary` plays `done` in a mount-only effect; `Study` installs the unlock listeners on mount and removes them on unmount; add the CSS (the panel must fit a 360 px wide phone, controls at least 44 px tall).
- [ ] **Step 5: Run** the focused tests (PASS), then from the repo root: `npm test` (web 385 + new, studio 136, API 435, scripts 58), `npm run build`, `npm run check:bundle`, `npm run lint`, `npm run format:check`.
- [ ] **Step 6: README.** Add a short Vietnamese section "Hiệu ứng âm thanh": the four sounds, on by default at a low volume, the speaker button in the study bar (switch and slider, remembered per device), not played over machine voice or recordings, no effect on scores, and that the iPhone silent switch and the real loudness on phone speakers are not verified in CI.
- [ ] **Step 7: Commit** `feat(web): sound effects control and feedback wiring`.
