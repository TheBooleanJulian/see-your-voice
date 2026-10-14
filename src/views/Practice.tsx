import { useMemo, useState } from 'react';
import { ContourChart } from '../components/ContourChart';
import { LiveStudio } from '../components/LiveStudio';
import { usePrefs } from '../hooks/hooks';
import { matchPauses } from '../practice/cadence';
import {
  ARTICULATION_DRILLS,
  CADENCE_PASSAGES,
  EXAMPLE_PRESENTATION,
  PITCH_INTENTS,
  PITCH_PASSAGE,
  parsePassage,
} from '../practice/passages';
import { MODE_LABELS, type PracticeMode, type SessionRecord } from '../sessions/types';

const MODES: PracticeMode[] = ['free', 'pitch', 'cadence', 'presentation', 'custom'];
const COLORS = ['#A78BFA', '#00D4C8', '#F5C842', '#4ADE80'];

function isMode(x: string | undefined): x is PracticeMode {
  return !!x && (MODES as string[]).includes(x);
}

export function PracticeView({ param }: { param?: string }) {
  const mode: PracticeMode = isMode(param) ? param : 'free';
  return (
    <div className="practice">
      <h1>Practice</h1>
      <nav className="tabs" aria-label="Practice modes">
        {MODES.map((m) => (
          <a key={m} href={`#/practice/${m}`} className={`tab ${m === mode ? 'tab-on' : ''}`} aria-current={m === mode ? 'page' : undefined}>
            {MODE_LABELS[m]}
          </a>
        ))}
      </nav>
      {/* key remounts the studio per mode so the microphone is released when switching */}
      {mode === 'free' && <FreeMode key="free" />}
      {mode === 'pitch' && <PitchMode key="pitch" />}
      {mode === 'cadence' && <CadenceMode key="cadence" />}
      {mode === 'presentation' && <PresentationMode key="presentation" />}
      {mode === 'custom' && <CustomMode key="custom" />}
    </div>
  );
}

function FreeMode() {
  return (
    <>
      <div className="panel">
        <h2>Free speak</h2>
        <p>Talk naturally and watch the keyboard and graph. Look for long stretches of flat pitch, and notice how pitch moves on questions, statements and emphasis.</p>
        <p className="muted small">There is no score here: a wide pitch range is not automatically better.</p>
      </div>
      <LiveStudio mode="free" label="Free speak" />
    </>
  );
}

function PitchMode() {
  const { prefs } = usePrefs();
  const [intentId, setIntentId] = useState<(typeof PITCH_INTENTS)[number]['id']>('neutral');
  const [attempts, setAttempts] = useState<{ intent: string; record: SessionRecord }[]>([]);
  const [busy, setBusy] = useState(false);
  const intent = PITCH_INTENTS.find((i) => i.id === intentId)!;
  const parsed = useMemo(() => parsePassage(PITCH_PASSAGE.text), []);
  const duration = Math.max(1, ...attempts.map((a) => a.record.durationSec));

  const series = attempts.map((a, i) => ({
    label: `${a.intent} #${i + 1}`,
    color: COLORS[i % COLORS.length],
    contour: a.record.contour,
    medianHz: a.record.metrics.pitch?.medianHz,
  }));

  return (
    <>
      <div className="panel">
        <h2>Pitch variation</h2>
        <p>Read the passage below with each intention in turn. Then compare how your pitch moved. There are no target notes: use whatever register is natural for you.</p>
        <blockquote className="passage">{parsed.text}</blockquote>
        <fieldset className="intents">
          <legend>Intention for the next attempt</legend>
          {PITCH_INTENTS.map((i) => (
            <label key={i.id} className={`chip ${i.id === intentId ? 'chip-on' : ''}`}>
              <input type="radio" name="intent" value={i.id} checked={i.id === intentId} disabled={busy} onChange={() => setIntentId(i.id)} />
              {i.label}
            </label>
          ))}
        </fieldset>
        <p className="small">{intent.hint}</p>
      </div>

      <LiveStudio
        mode="pitch"
        label={`Pitch variation · ${intent.label}`}
        intent={intent.label}
        onBusyChange={setBusy}
        passage={{ id: PITCH_PASSAGE.id, title: PITCH_PASSAGE.title, wordCount: parsed.wordCount }}
        onFinished={(record) => setAttempts((a) => [...a, { intent: intent.label, record }].slice(-4))}
      />

      {attempts.length > 0 ? (
        <section className="panel" aria-label="Attempt comparison">
          <h2>Compare attempts</h2>
          <p className="muted small">
            Each line is plotted in semitones around that attempt’s own median pitch, so you compare shape rather than register. Lines also differ by dash pattern.
          </p>
          <ContourChart
            series={series}
            durationSec={duration}
            mode="relative"
            prefs={prefs}
            description={`Overlay of ${attempts.length} pitch contours in semitones relative to each attempt's median.`}
          />
          <table className="table">
            <caption className="sr-only">Pitch movement per attempt</caption>
            <thead>
              <tr>
                <th scope="col">Attempt</th>
                <th scope="col">Range (5–95th)</th>
                <th scope="col">Variation (std)</th>
                <th scope="col">Median</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a, i) => (
                <tr key={a.record.id}>
                  <th scope="row">
                    <span className="swatch" style={{ background: COLORS[i % COLORS.length] }} aria-hidden="true" />
                    {a.intent} #{i + 1}
                  </th>
                  <td className="mono">{a.record.metrics.pitch ? `${a.record.metrics.pitch.rangeSemitones.toFixed(1)} st` : '—'}</td>
                  <td className="mono">{a.record.metrics.pitch ? `${a.record.metrics.pitch.stdSemitones.toFixed(1)} st` : '—'}</td>
                  <td className="mono">{a.record.metrics.pitch ? `${a.record.metrics.pitch.medianHz.toFixed(0)} Hz` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAttempts([])}>
            Clear comparison
          </button>
        </section>
      ) : null}
    </>
  );
}

function CadenceMode() {
  const [pid, setPid] = useState(CADENCE_PASSAGES[0].id);
  const [busy, setBusy] = useState(false);
  const passage = CADENCE_PASSAGES.find((p) => p.id === pid)!;
  const parsed = useMemo(() => parsePassage(passage.text), [passage]);
  const phrases = passage.text.split('|').map((s) => s.trim());

  return (
    <>
      <div className="panel">
        <h2>Pause &amp; cadence</h2>
        <p>
          Read the passage aloud and pause briefly at each <span className="pause-mark">│</span>. Afterwards, compare where you actually paused with the suggested phrase breaks.
        </p>
        <label className="field">
          <span>Passage</span>
          <select value={pid} disabled={busy} onChange={(e) => setPid(e.target.value)}>
            {CADENCE_PASSAGES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <blockquote className="passage">
          {phrases.map((ph, i) => (
            <span key={i}>
              {ph}
              {i < phrases.length - 1 ? (
                <span className="pause-mark" title="Suggested pause">
                  {' '}│<span className="sr-only"> (pause) </span>{' '}
                </span>
              ) : null}
            </span>
          ))}
        </blockquote>
      </div>
      <LiveStudio
        mode="cadence"
        onBusyChange={setBusy}
        label={`Pause & cadence · ${passage.title}`}
        passage={{ id: passage.id, title: passage.title, wordCount: parsed.wordCount }}
        renderExtra={(rec) => <CadenceResult record={rec} fractions={parsed.pauseFractions} />}
      />
    </>
  );
}

function CadenceResult({ record, fractions }: { record: SessionRecord; fractions: number[] }) {
  const r = matchPauses(fractions, record.metrics.pauses, record.metrics.segments);
  return (
    <article className="card">
      <h3>Your pauses vs the suggested ones</h3>
      <p>
        <strong className="mono">
          {r.matched} of {r.suggested}
        </strong>{' '}
        suggested pauses had a pause near them{r.extra > 0 ? `, plus ${r.extra} extra pause${r.extra === 1 ? '' : 's'} elsewhere` : ''}.
      </p>
      <ol className="small checklist">
        {r.perBoundary.map((ok, i) => (
          <li key={i}>
            Break {i + 1}: {ok ? '✓ pause found nearby' : '✗ no pause found nearby'}
          </li>
        ))}
      </ol>
      <p className="muted small">
        Positions are matched by how far through the passage you were (speaking time vs word count), so a very uneven pace can shift them. Extra pauses are not mistakes.
      </p>
    </article>
  );
}

function PresentationMode() {
  const [dur, setDur] = useState(45);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="panel">
        <h2>Presentation practice</h2>
        <p>Deliver a short talk in the time you choose. It stops automatically, then you get a summary with one or two evidence-based suggestions.</p>
        <label className="field">
          <span>Duration</span>
          <select value={dur} disabled={busy} onChange={(e) => setDur(Number(e.target.value))}>
            {[30, 45, 60].map((d) => (
              <option key={d} value={d}>
                {d} seconds
              </option>
            ))}
          </select>
        </label>
        <details>
          <summary>Need something to say? Example script</summary>
          <blockquote className="passage">{EXAMPLE_PRESENTATION.text}</blockquote>
        </details>
      </div>
      <LiveStudio mode="presentation" label={`Presentation · ${dur}s`} autoStopSec={dur} onBusyChange={setBusy} />
    </>
  );
}

function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function CustomMode() {
  const { prefs, update } = usePrefs();
  const parsed = useMemo(() => parsePassage(prefs.customPassage), [prefs.customPassage]);
  const limit = prefs.customDurationSec > 0 ? prefs.customDurationSec : undefined;
  const [busy, setBusy] = useState(false);

  return (
    <>
      <div className="panel">
        <h2>Custom passage</h2>
        <p>Paste or type your own script (a business intro, sales pitch, explanation…). An example presentation is preloaded so you can try this straight away.</p>
        <div className="field">
          <label htmlFor="custom-text">Your passage</label>
          <textarea
            id="custom-text"
            rows={7}
            value={prefs.customPassage}
            disabled={busy}
            onChange={(e) => update({ customPassage: e.target.value })}
            spellCheck
          />
          <span className="small muted">{parsed.wordCount} words</span>
        </div>
        <div className="row">
          <label className="field field-inline">
            <span>Practice time (seconds, 0 = no limit)</span>
            <input
              type="number"
              min={0}
              max={1200}
              step={5}
              value={prefs.customDurationSec}
              disabled={busy}
              onChange={(e) => update({ customDurationSec: Number(e.target.value) || 0 })}
            />
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ customPassage: EXAMPLE_PRESENTATION.text })}>
            Load example script
          </button>
        </div>
        <details>
          <summary>Articulation drills</summary>
          <ul className="drills">
            {ARTICULATION_DRILLS.map((d) => (
              <li key={d.id}>
                <strong>{d.title}</strong> <span className="muted small">{d.text}</span>{' '}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ customPassage: d.text })}>
                  Use this text
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small">
            With transcription on you can see how the recogniser heard you, but recognition errors can come from accent, microphone or noise, not only enunciation.
          </p>
        </details>
        <blockquote className="passage">{parsed.text || 'Type a passage above.'}</blockquote>
      </div>
      <LiveStudio
        mode="custom"
        onBusyChange={setBusy}
        label="Custom passage"
        autoStopSec={limit}
        passage={{ id: `custom-${hashText(parsed.text)}`, title: 'Custom passage', wordCount: parsed.wordCount }}
      />
    </>
  );
}
