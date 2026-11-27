# Machine Voice (on-device) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Nghe" button that reads English, Japanese and scientific names with the device's own voice (Web Speech API), labelled "Giọng máy, tham khảo", in the learner Profile and the flashcard reveal.

**Architecture:** A small pure module (`machineVoice.ts`: text normalisation, voice choice, rate, speak/cancel) and one component (`MachineVoice.tsx`) that mirrors the existing `Pronunciation` player's look and behaviour. Wired into `Profile.tsx` and the flashcard reveal in `QuestionView.tsx`. Web app only: no API, DB, Docker or VPS change.

**Tech Stack:** React 19, TypeScript, Vitest 5 + jsdom (`vitest run` in `apps/web`), `lucide-react` icons, browser `speechSynthesis`.

**Spec:** `docs/superpowers/specs/2026-11-27-machine-voice-design.md`

## Global Constraints

- Machine voice is never used in the **Nghe** (listening) question or anywhere that scores; the `q.type === 'listening'` branch in `QuestionView.tsx` stays exactly as it is.
- The machine voice is never "approved" and is never stored as audio. No Vietnamese (`vi`) names get a button.
- No network call, no downloaded voice file, no new dependency.
- Spoken text: Japanese reads the katakana name label; English reads the name label; scientific names read the label with an `en-US` voice. Normalise before speaking: `/` becomes `、` (so `ウニ / ムラサキウニ` reads as `ウニ、ムラサキウニ`), a trailing ` sp.` becomes ` species`.
- Voice choice: Japanese prefers a voice whose name contains `Kyoko`, otherwise the first `ja-JP` voice; English and scientific prefer `en-US`; if the device has no voice for that language, render nothing (no button, no error). Voices load late on many browsers: listen to `voiceschanged` and remove the listener on unmount.
- Rates: Japanese `0.85` normal / `0.65` slow; English and scientific `1` normal / `0.75` slow.
- The label "Giọng máy, tham khảo" is always visible next to the button. The status text uses `role="status"`.
- One sound at a time: starting machine voice calls `stopAudio()` (file clips) and `stopAudio()` must also cancel speech; leaving the screen or changing the card cancels speech.
- When an approved recording exists for a name, show only the approved player; machine voice appears only when there is no approved recording (design decision, the owner may change it).
- Copy is Vietnamese. Buttons reuse the `btn secondary` look and the `pilot-audio` container of `Pronunciation` in `apps/web/src/pilot/Media.tsx`.
- Gates that must stay green: `npm test` (web 327 before this work, studio 136, API 435, scripts 58), `npm run lint` (0 errors, 0 warnings), `npm run format:check`, `npm run build`, `npm run check:bundle`. `check:web-tier` stays untouched.

## Review Focus

1. A browser or test environment with no `speechSynthesis` (jsdom, old browsers) must render nothing and never throw. Pinned in Task 1.
2. Voices that arrive after first render (`voiceschanged`): the button must appear when they arrive, and the listener must be removed on unmount. Pinned in Task 1.
3. Two sounds at once: an approved clip playing then machine voice, and the reverse; unmount and card change cancel speech. Pinned in Task 1 (and card change in Task 2).
4. Label oddities: `ウニ / ムラサキウニ`, `Oreochromis sp.`, an empty or whitespace label (must not speak, no button). Pinned in Task 1.
5. Browsers report `error: 'interrupted'` / `'canceled'` when we cancel on purpose: that must not show an error message; a real error (for example `'synthesis-failed'`) shows "Không đọc được. Hãy thử lại." Pinned in Task 1.
6. Approved audio present → only the approved player; `vi` never; listening question untouched. Pinned in Task 2.

---

### Task 1: Speech module, component, and stopAudio integration

**Files:**
- Create: `apps/web/src/pilot/machineVoice.ts`, `apps/web/src/pilot/machineVoice.test.ts`, `apps/web/src/pilot/MachineVoice.tsx`, `apps/web/src/pilot/MachineVoice.test.tsx`
- Modify: `apps/web/src/pilot/Media.tsx` (`stopAudio` also cancels speech), `apps/web/src/pilot/pilot.css` only if the existing `pilot-audio` styles do not already fit
- Test helpers: use `apps/web/src/learner/testDom.ts` (`mount`, `unmountAll`) as `Profile.test.tsx` does

**Interfaces:**
- Produces (Task 2 relies on exactly these):
  - `export type VoiceKind = 'en' | 'ja' | 'scientific'`
  - `export function speechText(kind: VoiceKind, label: string): string` (normalised, trimmed; empty string when nothing to say)
  - `export function pickVoice(kind: VoiceKind, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined`
  - `export function speechRate(kind: VoiceKind, slow: boolean): number`
  - `export function speechAvailable(): boolean` (true only when `window.speechSynthesis` and `SpeechSynthesisUtterance` exist)
  - `export function speak(kind: VoiceKind, label: string, slow: boolean, on: { start(): void; end(): void; error(fatal: boolean): void }): boolean` (false when there is no text or no voice; `error(false)` for `interrupted`/`canceled`, `error(true)` otherwise)
  - `export function cancelSpeech(): void` (safe when unavailable)
  - `export function MachineVoice({ kind, label }: { kind: VoiceKind; label: string }): JSX.Element | null`

- [ ] **Step 1: Write failing tests for `machineVoice.ts`** (`machineVoice.test.ts`, Vitest, a fake `speechSynthesis` installed with `vi.stubGlobal` together with a minimal `SpeechSynthesisUtterance` class). Assertions: `speechText('ja', 'ウニ / ムラサキウニ') === 'ウニ、ムラサキウニ'`; `speechText('scientific', 'Oreochromis sp.') === 'Oreochromis species'`; `speechText('en', '   ') === ''`; `pickVoice('ja', [enUS, jaOther, jaKyoko])` returns the Kyoko one, with no Kyoko returns the first `ja-JP`, with no ja voice returns `undefined`; `pickVoice('en', [enGB, enUS])` returns the `en-US` one; `speechRate('ja', false) === 0.85`, `speechRate('ja', true) === 0.65`, `speechRate('en', true) === 0.75`, `speechRate('scientific', false) === 1`; `speak(...)` builds an utterance with the normalised text, the chosen voice, `lang` of the voice, the right rate, calls `cancel()` first, returns `true`, and returns `false` without calling `speak` when no voice or empty text; the utterance `onerror` with `{ error: 'interrupted' }` calls `on.error(false)`, with `{ error: 'synthesis-failed' }` calls `on.error(true)`; `speechAvailable()` is false when the globals are absent. Add the Review Focus 1, 4, 5 cases here.
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/pilot/machineVoice.test.ts` and confirm FAIL (module not found).
- [ ] **Step 3: Implement `machineVoice.ts`** with the signatures above; read `window.speechSynthesis.getVoices()` at call time; wrap every browser call so a missing API returns `false`/no-op instead of throwing.
- [ ] **Step 4: Run** the same command; PASS.
- [ ] **Step 5: Write failing component tests** (`MachineVoice.test.tsx`, jsdom + the same fake): renders `null` when `speechAvailable()` is false (Review Focus 1); renders `null` when no voice for the kind; shows the text `Giọng máy, tham khảo`, a `Nghe` button and a `Thường`/`Chậm` toggle when a voice exists; voices arriving later through the fake's `voiceschanged` event make the button appear, and unmount removes the listener (assert `removeEventListener` called with the same handler) (Review Focus 2); clicking `Nghe` calls the fake `speak` once and shows `Đang đọc`, the utterance end shows `Đã đọc xong`; the toggle changes the next utterance's rate; a non-fatal error shows no message, a fatal error shows `Không đọc được. Hãy thử lại.`; unmount calls `cancel`; clicking `Nghe` calls `stopAudio` (spy via the exported function in `Media.tsx`), and a `stopAudio()` call cancels speech (Review Focus 3).
- [ ] **Step 6: Run** `npx vitest run src/pilot/MachineVoice.test.tsx`; FAIL.
- [ ] **Step 7: Implement `MachineVoice.tsx`** and change `stopAudio()` in `Media.tsx` to also call `cancelSpeech()` (import from `./machineVoice`; `machineVoice.ts` must not import `Media.tsx`). Markup mirrors `Pronunciation`: `div.pilot-audio` containing the label span, `button.btn.secondary` with `Volume2` icon and `Nghe`, the speed toggle with `aria-pressed`, and `span[role=status]`.
- [ ] **Step 8: Run** the focused tests, then the full web suite once: `cd apps/web && npx vitest run` (expect 327 plus the new tests, all pass), `npm run lint` and `npm run format:check` from the repo root.
- [ ] **Step 9: Commit** `feat(web): on-device machine voice module and component`.

### Task 2: Wire into Profile and the flashcard reveal, docs

**Files:**
- Modify: `apps/web/src/learner/Profile.tsx` (names list, around the `Pronunciation` call), `apps/web/src/learner/study/QuestionView.tsx` (flashcard reveal block with `Pronunciation`/`study-chip`), `README.md` (one short Vietnamese section "Giọng máy trên thiết bị")
- Test: `apps/web/src/learner/Profile.test.tsx`, `apps/web/src/learner/study/QuestionView.test.tsx`

**Interfaces:**
- Consumes (Task 1): `MachineVoice({ kind, label })`, `VoiceKind`, `speechAvailable`.
- In the flashcard, the existing `answerLanguage[q.prompt].lang` is `'en' | 'ja' | 'la'`; map `la` to `'scientific'` for `MachineVoice`.

- [ ] **Step 1: Write failing Profile tests** using the existing `mount`/fetch stub pattern and a fake `speechSynthesis` with `en-US` and `ja-JP` voices: a catalog item with names `vi`, `en`, `ja`, `scientific` and no approved audio shows exactly three `Giọng máy, tham khảo` labels (none for `vi`); the same item with an approved pronunciation media for `en` shows the approved player for `en` and no machine voice for `en`, while `ja` and `scientific` still show it; with no `speechSynthesis` in the environment the existing "Chưa có bản thu đã duyệt." text still shows and nothing throws (Review Focus 6).
- [ ] **Step 2: Write failing QuestionView tests** with the same fake: a flashcard whose reveal has no `audio.url` shows `Giọng máy, tham khảo` for prompts `Tên tiếng Anh`, `Tên tiếng Nhật` and `Tên khoa học`; a reveal with `audio.url` shows only the approved player; a `listening` question never shows `Giọng máy, tham khảo`; moving to the next card (re-render with a new question) cancels speech (assert fake `cancel` called).
- [ ] **Step 3: Run** `cd apps/web && npx vitest run src/learner/Profile.test.tsx src/learner/study/QuestionView.test.tsx`; the new cases FAIL.
- [ ] **Step 4: Implement the wiring.** Profile: for `n.kind !== 'vi'`, keep `audio ? <Pronunciation id={audio} /> : <p className="profile-audio-missing">Chưa có bản thu đã duyệt.</p>` and, only in the no-audio branch, render `<MachineVoice kind={n.kind as VoiceKind} label={n.label} />` for `en`, `ja` and `scientific` kinds. QuestionView reveal: keep the existing branch, and in the `study-chip` ("Chưa có bản thu") branch add `<MachineVoice kind=... label={reveal.label} />` when `language` is known. Do not touch the `listening` branch.
- [ ] **Step 5: Run** the focused tests (PASS), then from the repo root: `npm test` (web 327 + new, studio 136, API 435, scripts 58), `npm run build`, `npm run check:bundle`, `npm run lint`, `npm run format:check`.
- [ ] **Step 6: README.** Add a short section (Vietnamese): what the button does, the label "Giọng máy, tham khảo", that it depends on the device's voices and hides when none, that listening questions only use approved audio, and where the deferred "tạo giọng trên Studio" note lives (`docs/handoffs/2026-11-26-tts-provider-setup.md`).
- [ ] **Step 7: Commit** `feat(web): machine voice in Profile and flashcard reveal`.
