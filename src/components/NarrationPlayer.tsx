import type { PlaybackStatus } from '../types/reader';
import { SpeedControl } from './SpeedControl';

type Props = {
  status: PlaybackStatus;
  progress: number;
  rate: number;
  onTogglePlay: () => void;
  onStop: () => void;
  onCycleRate: () => void;
  onReplay: () => void;
};

// Раздел 6.3 и 7.6 ТЗ. Смонтирован только пока playbackStatus !== 'idle'/'stopped'
// (см. ReaderPage) — до старта чтения плеер не виден.
export function NarrationPlayer({ status, progress, rate, onTogglePlay, onStop, onCycleRate, onReplay }: Props) {
  if (status === 'completed') {
    return (
      <div className="player">
        <div className="player-card">
          <span className="player-completed-note">Текст дочитан</span>
          <button className="act-btn" type="button" style={{ marginLeft: 'auto' }} onClick={onReplay}>
            Прослушать ещё раз
          </button>
        </div>
      </div>
    );
  }

  const isPlaying = status === 'playing';
  const progressPercent = Math.min(100, Math.max(0, Math.round(progress * 100)));

  return (
    <div className="player">
      <div className="player-card">
        <button
          className="player-btn primary"
          type="button"
          aria-label={isPlaying ? 'Пауза' : 'Продолжить'}
          onClick={onTogglePlay}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button className="player-btn" type="button" aria-label="Остановить" onClick={onStop}>
          <StopIcon />
        </button>
        <div className="progress" aria-hidden="true">
          <span style={{ inset: `0 ${100 - progressPercent}% 0 0` }} />
        </div>
        <SpeedControl rate={rate} onCycle={onCycleRate} />
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
    </svg>
  );
}
