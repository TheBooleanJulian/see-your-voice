import { useCallback, useMemo, useState } from 'react';
import { LiveStudio } from './components/LiveStudio';
import { PrefsContext, useHashRoute } from './hooks/hooks';
import { clearPrefs, loadPrefs, savePrefs, DEFAULT_PREFS, type Prefs } from './storage/prefs';
import { Landing } from './views/Landing';
import { PracticeView } from './views/Practice';
import { SessionsView } from './views/Sessions';
import { SettingsView } from './views/Settings';

const NAV = [
  { href: '#/studio', key: 'studio', label: 'Live Studio' },
  { href: '#/practice', key: 'practice', label: 'Practice' },
  { href: '#/sessions', key: 'sessions', label: 'Sessions' },
  { href: '#/settings', key: 'settings', label: 'Settings' },
];

export function App() {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);
  const reset = useCallback(() => {
    clearPrefs();
    setPrefs(DEFAULT_PREFS);
  }, []);
  const api = useMemo(() => ({ prefs, update, reset }), [prefs, update, reset]);

  const [section = '', param] = useHashRoute();

  return (
    <PrefsContext.Provider value={api}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="#/">
          See<span className="accent">Your</span>Voice
        </a>
        <nav aria-label="Main">
          {NAV.map((n) => (
            <a key={n.key} href={n.href} aria-current={section === n.key ? 'page' : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {section === '' && <Landing />}
        {section === 'studio' && (
          <div>
            <h1>Live Studio</h1>
            <LiveStudio mode="free" label="Free speak" />
          </div>
        )}
        {section === 'practice' && <PracticeView param={param} />}
        {section === 'sessions' && <SessionsView id={param} />}
        {section === 'settings' && <SettingsView />}
        {!['', 'studio', 'practice', 'sessions', 'settings'].includes(section) && (
          <div className="panel">
            <p>Page not found.</p>
            <a className="link" href="#/">Go to the start page</a>
          </div>
        )}
      </main>
      <footer className="site-footer">
        <p>
          Measurements are estimates from your microphone. Audio is analysed in your browser; nothing is uploaded by SeeYourVoice.
        </p>
      </footer>
    </PrefsContext.Provider>
  );
}
