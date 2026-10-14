import { useState } from 'react';
import { MicSelect } from '../components/MicSelect';
import { usePrefs } from '../hooks/hooks';
import { DEFAULT_FILLERS } from '../speech/fillers';
import { getRepo } from '../storage/repo';
import { midiToName } from '../pitch/notes';
import { cMidi } from '../visualization/keyboard';

export function SettingsView() {
  const { prefs, update, reset } = usePrefs();
  const [fillerText, setFillerText] = useState(prefs.fillers.join(', '));
  const [msg, setMsg] = useState<string | null>(null);

  const low = cMidi(prefs.lowOctave);
  const high = low + prefs.octaves * 12;

  const commitFillers = () => {
    const list = [...new Set(fillerText.split(/[,\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
    update({ fillers: list });
    setFillerText(list.join(', '));
  };

  const clearAll = async () => {
    if (!window.confirm('Delete ALL saved sessions and recordings on this device? This cannot be undone.')) return;
    try {
      await (await getRepo()).clearAll();
      setMsg('All saved sessions and recordings were deleted.');
    } catch {
      setMsg('Could not delete saved sessions. Try clearing site data in your browser settings.');
    }
  };

  const wipeEverything = async () => {
    if (!window.confirm('Delete all sessions AND reset every setting? This cannot be undone.')) return;
    try {
      await (await getRepo()).clearAll();
    } catch {
      /* continue with settings reset */
    }
    reset();
    setFillerText(DEFAULT_FILLERS.join(', '));
    setMsg('All data and settings were reset.');
  };

  return (
    <div className="settings">
      <h1>Settings</h1>

      <section className="panel">
        <h2>Microphone</h2>
        <MicSelect />
      </section>

      <section className="panel">
        <h2>Keyboard &amp; graph</h2>
        <div className="form-grid">
          <label className="field">
            <span>Lowest octave (C{prefs.lowOctave} = {Math.round(440 * Math.pow(2, (low - 69) / 12))} Hz)</span>
            <select value={prefs.lowOctave} onChange={(e) => update({ lowOctave: Number(e.target.value) })}>
              {[1, 2, 3, 4].map((o) => (
                <option key={o} value={o}>C{o}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Octaves shown</span>
            <select value={prefs.octaves} onChange={(e) => update({ octaves: Number(e.target.value) })}>
              {[2, 3, 4, 5].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Graph time window</span>
            <select value={prefs.graphWindowSec} onChange={(e) => update({ graphWindowSec: Number(e.target.value) })}>
              {[10, 15, 20, 30].map((s) => (
                <option key={s} value={s}>{s} seconds</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Graph scale</span>
            <select value={prefs.graphScale} onChange={(e) => update({ graphScale: e.target.value === 'hz' ? 'hz' : 'semitone' })}>
              <option value="semitone">Semitones (log; best for pitch movement)</option>
              <option value="hz">Linear Hz</option>
            </select>
          </label>
          <label className="field">
            <span>Reference tuning A4 (Hz)</span>
            <input type="number" min={400} max={480} step={1} value={prefs.a4} onChange={(e) => update({ a4: Number(e.target.value) || 440 })} />
          </label>
        </div>
        <p className="muted small">
          Showing {midiToName(low).label}–{midiToName(high).label}. Typical speaking pitch sits roughly between F2 and C4 depending on the voice. Voices outside the
          range are marked at the edge of the keyboard.
        </p>
      </section>

      <section className="panel">
        <h2>Pitch detection</h2>
        <div className="form-grid">
          <label className="field">
            <span>Lowest pitch to detect (Hz)</span>
            <input type="number" min={40} max={200} step={5} value={prefs.minHz} onChange={(e) => update({ minHz: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>Highest pitch to detect (Hz)</span>
            <input type="number" min={150} max={1000} step={10} value={prefs.maxHz} onChange={(e) => update({ maxHz: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>Strictness ({prefs.yinThreshold.toFixed(2)}; lower = stricter, fewer false readings)</span>
            <input type="range" min={0.1} max={0.4} step={0.01} value={prefs.yinThreshold} onChange={(e) => update({ yinThreshold: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>Silence threshold ({(prefs.silenceRms * 100).toFixed(1)}; raise in noisy rooms, lower for quiet mics)</span>
            <input type="range" min={0.002} max={0.05} step={0.001} value={prefs.silenceRms} onChange={(e) => update({ silenceRms: Number(e.target.value) })} />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Speech &amp; fillers</h2>
        <div className="field">
          <label htmlFor="fillers">Filler words and phrases (comma-separated)</label>
          <textarea id="fillers" rows={3} value={fillerText} onChange={(e) => setFillerText(e.target.value)} onBlur={commitFillers} />
          <span className="small muted">Words such as “like” and “actually” are only counted when the surrounding words suggest a filler.</span>
        </div>
        <label className="field">
          <span>Recognition language (used only if you turn transcription on)</span>
          <select value={prefs.lang} onChange={(e) => update({ lang: e.target.value })}>
            {['en-US', 'en-GB', 'en-SG', 'en-AU', 'en-IN'].map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel">
        <h2>Your data</h2>
        <p className="small">
          Settings are kept in this browser’s local storage. Saved sessions and recordings are kept in this browser’s IndexedDB. Nothing is sent to a server by SeeYourVoice.
        </p>
        <div className="controls">
          <button type="button" className="btn btn-danger" onClick={() => void clearAll()}>
            Delete all saved sessions
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void wipeEverything()}>
            Delete everything &amp; reset settings
          </button>
        </div>
        {msg ? <p role="status" className="small">{msg}</p> : null}
      </section>
    </div>
  );
}
