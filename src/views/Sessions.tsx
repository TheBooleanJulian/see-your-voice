import { useCallback, useEffect, useMemo, useState } from 'react';
import { ContourChart } from '../components/ContourChart';
import { fmtDate, fmtDelta, fmtDuration, fmtNum } from '../components/format';
import { SessionReport } from '../components/SessionReport';
import { usePrefs } from '../hooks/hooks';
import { compareSessions, suggestComparison } from '../sessions/compare';
import { MODE_LABELS, type SessionMeta, type SessionRecord } from '../sessions/types';
import { getRepo, type SessionRepo } from '../storage/repo';

function useRepo(): SessionRepo | null {
  const [repo, setRepo] = useState<SessionRepo | null>(null);
  useEffect(() => {
    let live = true;
    void getRepo().then((r) => live && setRepo(r));
    return () => {
      live = false;
    };
  }, []);
  return repo;
}

export function SessionsView({ id }: { id?: string }) {
  return id ? <SessionDetail id={id} /> : <SessionList />;
}

function SessionList() {
  const repo = useRepo();
  const [items, setItems] = useState<SessionMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!repo) return;
    try {
      setItems(await repo.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load sessions.');
    }
  }, [repo]);
  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (s: SessionMeta) => {
    if (!repo || !window.confirm(`Delete “${s.label}” from ${fmtDate(s.createdAt)}? This cannot be undone.`)) return;
    await repo.remove(s.id);
    await load();
  };
  const removeAll = async () => {
    if (!repo || !window.confirm('Delete ALL saved sessions and recordings on this device? This cannot be undone.')) return;
    await repo.clearAll();
    await load();
  };

  return (
    <div>
      <h1>Sessions</h1>
      {repo && !repo.persistent ? (
        <div className="banner banner-warn" role="status">
          Browser storage is unavailable (private mode or blocked), so sessions are only kept until you close this tab.
        </div>
      ) : null}
      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}
      {items === null ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="panel">
          <p>No saved sessions yet. Record one in the <a className="link" href="#/studio">Live Studio</a> or a <a className="link" href="#/practice">practice mode</a>, then choose Save session.</p>
        </div>
      ) : (
        <>
          <ul className="session-list">
            {items.map((s) => (
              <li key={s.id} className="panel session-item">
                <div>
                  <a className="session-title" href={`#/sessions/${s.id}`}>{s.label}</a>
                  <p className="muted small">
                    {fmtDate(s.createdAt)} · {fmtDuration(s.durationSec)} · {MODE_LABELS[s.mode]}
                    {s.intent ? ` · ${s.intent}` : ''}
                    {s.hasAudio ? ' · audio saved' : ''}
                  </p>
                  <p className="small mono">
                    {s.metrics.pitch ? `${s.metrics.pitch.medianHz.toFixed(0)} Hz median · ${s.metrics.pitch.rangeSemitones.toFixed(1)} st range` : 'no steady pitch'}
                    {s.metrics.rate?.wpmSpeaking ? ` · ${Math.round(s.metrics.rate.wpmSpeaking)} wpm` : ''}
                    {s.metrics.fillers?.per100 != null ? ` · ${s.metrics.fillers.per100.toFixed(1)} fillers/100w` : ''}
                  </p>
                </div>
                <div className="controls">
                  <a className="btn btn-sm" href={`#/sessions/${s.id}`}>Open</a>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => void remove(s)} aria-label={`Delete ${s.label} from ${fmtDate(s.createdAt)}`}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-danger" onClick={() => void removeAll()}>
            Delete all sessions
          </button>
        </>
      )}
    </div>
  );
}

function SessionDetail({ id }: { id: string }) {
  const repo = useRepo();
  const { prefs } = usePrefs();
  const [record, setRecord] = useState<SessionRecord | null | undefined>(undefined);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [all, setAll] = useState<SessionMeta[]>([]);
  const [otherId, setOtherId] = useState<string>('');
  const [other, setOther] = useState<SessionRecord | null>(null);
  const [relative, setRelative] = useState(true);

  useEffect(() => {
    if (!repo) return;
    let live = true;
    void (async () => {
      const [rec, list] = await Promise.all([repo.get(id), repo.list()]);
      if (!live) return;
      setRecord(rec ?? null);
      setAll(list);
      setAudio((await repo.getAudio(id)) ?? null);
      if (rec) setOtherId(suggestComparison(rec, list)?.id ?? '');
    })();
    return () => {
      live = false;
    };
  }, [repo, id]);

  useEffect(() => {
    if (!repo || !otherId) {
      setOther(null);
      return;
    }
    let live = true;
    void repo.get(otherId).then((r) => live && setOther(r ?? null));
    return () => {
      live = false;
    };
  }, [repo, otherId]);

  const rows = useMemo(() => (record && other ? compareSessions(other, record) : []), [record, other]);

  const remove = async () => {
    if (!repo || !record || !window.confirm('Delete this session and its recording? This cannot be undone.')) return;
    await repo.remove(record.id);
    window.location.hash = '#/sessions';
  };

  if (record === undefined) return <p className="muted">Loading…</p>;
  if (record === null) {
    return (
      <div className="panel">
        <p>That session could not be found. It may have been deleted.</p>
        <a className="link" href="#/sessions">← Back to sessions</a>
      </div>
    );
  }

  const options = all.filter((s) => s.id !== record.id);

  return (
    <div>
      <p><a className="link" href="#/sessions">← All sessions</a></p>
      <SessionReport record={record} audio={audio}>
        <section className="panel" aria-label="Compare attempts">
          <h2>Compare with another attempt</h2>
          {options.length === 0 ? (
            <p className="muted">Save at least one more session to compare.</p>
          ) : (
            <>
              <label className="field">
                <span>Compare with</span>
                <select value={otherId} onChange={(e) => setOtherId(e.target.value)}>
                  <option value="">Choose a session…</option>
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} · {fmtDate(s.createdAt)}
                    </option>
                  ))}
                </select>
              </label>
              {other ? (
                <>
                  <label className="check">
                    <input type="checkbox" checked={relative} onChange={(e) => setRelative(e.target.checked)} />
                    <span>Align by each session’s median pitch (compare shape, not register)</span>
                  </label>
                  <ContourChart
                    series={[
                      { label: 'Earlier', color: '#00D4C8', contour: other.contour, medianHz: other.metrics.pitch?.medianHz },
                      { label: 'This session', color: '#A78BFA', contour: record.contour, medianHz: record.metrics.pitch?.medianHz },
                    ]}
                    durationSec={Math.max(record.durationSec, other.durationSec)}
                    mode={relative ? 'relative' : 'absolute'}
                    prefs={prefs}
                    description="Overlay of the two pitch contours."
                  />
                  <p className="small">
                    <span className="swatch" style={{ background: '#00D4C8' }} aria-hidden="true" /> Solid: {other.label}, {fmtDate(other.createdAt)}
                    <br />
                    <span className="swatch" style={{ background: '#A78BFA' }} aria-hidden="true" /> Dashed: this session
                  </p>
                  <table className="table">
                    <caption className="sr-only">Metric comparison</caption>
                    <thead>
                      <tr>
                        <th scope="col">Metric</th>
                        <th scope="col">Earlier</th>
                        <th scope="col">This</th>
                        <th scope="col">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key}>
                          <th scope="row">
                            {r.label}
                            {r.hint ? <small className="muted"> {r.hint}</small> : null}
                          </th>
                          <td className="mono">{fmtNum(r.a, 1, r.unit ? ` ${r.unit}` : '')}</td>
                          <td className="mono">{fmtNum(r.b, 1, r.unit ? ` ${r.unit}` : '')}</td>
                          <td className="mono">{fmtDelta(r.delta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="muted small">Metrics use the same definitions for every session. A change is not automatically an improvement; judge it against what you were practising.</p>
                </>
              ) : null}
            </>
          )}
        </section>
        <div className="controls">
          <button type="button" className="btn btn-danger" onClick={() => void remove()}>
            Delete this session
          </button>
        </div>
      </SessionReport>
    </div>
  );
}
