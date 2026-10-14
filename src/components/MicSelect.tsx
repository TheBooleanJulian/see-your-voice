import { useCallback, useEffect, useState } from 'react';
import { listAudioInputs } from '../audio/micEngine';
import { usePrefs } from '../hooks/hooks';

interface Props {
  disabled?: boolean;
  id?: string;
}

export function MicSelect({ disabled, id = 'mic-select' }: Props) {
  const { prefs, update } = usePrefs();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDevices(await listAudioInputs());
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const md = navigator.mediaDevices;
    md?.addEventListener?.('devicechange', refresh);
    return () => md?.removeEventListener?.('devicechange', refresh);
  }, [refresh]);

  const unlabeled = devices.length > 0 && devices.every((d) => !d.label);

  // Browsers hide device names until microphone permission has been granted once.
  const reveal = async () => {
    setMsg(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      await refresh();
    } catch {
      setMsg('Microphone access was not granted, so device names cannot be shown.');
    }
  };

  if (!navigator.mediaDevices?.enumerateDevices) {
    return <p className="muted small">This browser cannot list microphones; the default input will be used.</p>;
  }

  return (
    <div className="field">
      <label htmlFor={id}>Microphone</label>
      <select id={id} value={prefs.deviceId} disabled={disabled} onChange={(e) => update({ deviceId: e.target.value })}>
        <option value="">System default</option>
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `Microphone ${i + 1}`}
          </option>
        ))}
      </select>
      {unlabeled ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={reveal} disabled={disabled}>
          Show microphone names (asks for access)
        </button>
      ) : null}
      {msg ? <p className="small warn">{msg}</p> : null}
    </div>
  );
}
