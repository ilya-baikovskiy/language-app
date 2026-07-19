import { SpeedControl } from './SpeedControl';

// Этап 1: статическая вёрстка sticky-плеера (раздел 6.3 ТЗ). Не монтируется
// в Idle-состоянии — см. ReaderPage. Play/Pause/Stop и прогресс станут
// рабочими в Этапе 3.
export function NarrationPlayer() {
  return (
    <div className="player">
      <div className="player-card">
        <button className="player-btn primary" type="button" aria-label="Пауза">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
          </svg>
        </button>
        <button className="player-btn" type="button" aria-label="Остановить">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="5" width="14" height="14" rx="1.5" />
          </svg>
        </button>
        <div className="progress" aria-hidden="true">
          <span />
        </div>
        <SpeedControl />
      </div>
    </div>
  );
}
