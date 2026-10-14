# SeeYourVoice

Live voice-to-keyboard visualisation and verbal-delivery trainer. Speak into your microphone and see your pitch as a lit piano key and a scrolling pitch graph, with pace, pauses and filler words alongside. Everything runs in the browser; there is no backend.

It is a voice-training instrument, not a music tool: notes are a way to *see* pitch movement, not targets.

## Run

```bash
npm install
npm run dev        # http://localhost:5173  (microphone works on localhost)
npm run check      # type-check + tests + production build
npm test           # unit tests only
npm run build      # outputs dist/
npm run preview    # serve dist/ on :4173
```

> This repo lives under a Google Drive folder. Run `npm install` in a **non-synced copy** (Drive file-locking corrupts `node_modules`); copy only source back.

## Deploy

`dist/` is a static site (hash routing, relative asset paths, so any host or sub-path works). On Zeabur or any static host: build command `npm run build`, output `dist`. **It must be served over HTTPS** (or localhost): browsers block microphone access on plain HTTP.

## Architecture

| Path | Responsibility |
|---|---|
| `src/audio/` | `MicEngine`: getUserMedia, AudioContext, 25 ms analysis loop, pause/stop/cleanup, interruption + device-loss handling. `FrameLog`: fixed-capacity typed-array frame store (20 min cap). |
| `src/pitch/` | `yin.ts` (YIN F0 on decimated audio), `tracker.ts` (silence gate, voiced decision, octave/outlier suppression, median smoothing), `notes.ts`, `stats.ts`. |
| `src/speech/` | `vad.ts` (adaptive voice activity, segments, pauses), `fillers.ts` (context-aware), `recognition.ts` (provider interface; Web Speech API implementation). |
| `src/sessions/` | Metric definitions (`metrics.ts`, versioned), comparison, record building, `SessionController`. |
| `src/storage/` | `prefs.ts` (localStorage, validated), `backend.ts` + `repo.ts` (IndexedDB; in-memory fallback/test backend). |
| `src/practice/` | Passages, suggested-pause matching, rule-based suggestions. |
| `src/visualization/`, `src/components/`, `src/views/` | Canvas renderers and React UI. |

Decisions: analysis runs on the main thread on a timer (YIN on a ~12 kHz decimated 2048-sample buffer is a few hundred µs, preallocated, so no worker was needed); canvas is drawn from `requestAnimationFrame`, decoupled from analysis. Only runtime deps are `react` and `react-dom`.

## Privacy

- Microphone starts only after pressing Start; off on Stop, route change or unmount.
- No audio is uploaded by the app. Audio recording and saving are opt-in; saved data stays in IndexedDB.
- **Transcription is opt-in per session** and uses the browser's Web Speech API, which in Chrome/Edge sends audio to the browser vendor's service. Pitch, pauses and the rest work without it.
- Settings → *Delete everything* clears sessions, recordings and preferences.

## Manual test checklist

1. **Permission**: Start → allow: live readouts. Block it in site settings → clear error, Start usable again. Unplug/no mic → "No microphone was found".
2. **Devices**: Settings → *Show microphone names*, pick another input, confirm the Studio uses it.
3. **Volume / noise**: whisper, normal, loud (level meter + readouts stay sane); noisy room → raise *Silence threshold* in Settings.
4. **Layouts**: desktop, tablet, phone (≤ 390 px): no horizontal scroll, Start/Stop reachable; check rotation.
5. **Refresh / interruption**: refresh while recording (browser warns; unsaved session is lost); lock the phone or switch tabs mid-session (an "audio interrupted" banner with *Resume audio* may appear); unplug the mic mid-session (session ends, partial data kept).
6. **Long session**: record 10+ minutes; memory stays flat (fixed buffers), auto-stops at 20 min. Confirm the browser's mic indicator disappears after Stop and when leaving the page.
7. **Transcription** (Chrome/Edge): tick it, speak with "um/uh/like"; check the transcript, WPM, filler highlights.
8. **Data**: save, reopen, compare two sessions, delete one, delete all.

## Known limitations

- Pitch tracking is monophonic and estimated; breathy/creaky voice and noisy rooms yield uncertain (dashed/hatched) or missing readings.
- Speech recognition: Chrome/Edge only; engines often drop "um/uh" so filler counts are lower bounds; "like"/"you know" use a context heuristic, not understanding. Firefox/Safari get everything except transcription-derived metrics.
- Speaking rate without transcription is estimated from passage length and assumes the whole passage was read.
- Cadence matching assumes a roughly even pace.
- An in-progress session is not autosaved; background tabs may throttle timers on some browsers (an interruption shows as a gap).
- `MediaRecorder` WebM replay duration/seeking relies on a workaround for the missing duration header.
- Automated tests cover the logic; microphone/Web Audio/canvas/IndexedDB behaviour was verified by a scripted run in Edge with a fake microphone, not on physical mics, iOS Safari or Firefox.
