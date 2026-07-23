// Dev-only debug screen for PR 4 tracking — see brief §4 "debug journey":
// raw session event log, not a full dashboard (05 §16 dashboard needs
// learning-state/completion aggregates that don't exist yet). Opened from a
// button inside SettingsOverlay that only renders when import.meta.env.DEV.
import { useState } from 'react';
import { getSessionEventLog } from '../content-system/analytics/eventClient';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function DebugEventsOverlay({ open, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const events = getSessionEventLog();
  const json = JSON.stringify(events, null, 2);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable/denied — the <pre> below is still
      // selectable/copyable by hand.
    }
  }

  return (
    <div className="overlay open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="debug-events-title">
        <div className="modal-inner">
          <div className="modal-head">
            <h2 id="debug-events-title">Debug: события ({events.length})</h2>
            <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <section className="settings-section">
            <button type="button" className="btn ghost" onClick={handleCopy}>
              {copied ? 'Скопировано' : 'Скопировать JSON'}
            </button>
            <pre style={{ maxHeight: '60vh', overflow: 'auto', fontSize: '12px', marginTop: '12px' }}>
              {events.length === 0 ? 'Пока нет событий этой сессии.' : json}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
}
