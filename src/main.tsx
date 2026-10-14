import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Intentionally not wrapped in <StrictMode>: the session controller owns a live microphone
// and is disposed on unmount, and StrictMode's dev-only mount/unmount/mount would dispose it twice.
createRoot(document.getElementById('root')!).render(<App />);
