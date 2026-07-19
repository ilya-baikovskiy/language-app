import { useEffect, useRef, useState } from 'react';
import { NARRATION_RATE_STEPS } from '../hooks/useNarration';

type Props = {
  rate: number;
  onChange: (rate: number) => void;
};

export function SpeedControl({ rate, onChange }: Props) {
  const [isOpen, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="speed-control" ref={rootRef}>
      <button
        className="speed-btn"
        type="button"
        aria-label={`Скорость воспроизведения: ${rate}×`}
        aria-expanded={isOpen}
        onClick={() => setOpen((open) => !open)}
      >
        {rate.toFixed(1)}×
      </button>
      {isOpen && (
        <div className="speed-dropdown" role="menu">
          {NARRATION_RATE_STEPS.map((step) => (
            <button
              key={step}
              type="button"
              role="menuitemradio"
              aria-checked={step === rate}
              className={`speed-option${step === rate ? ' is-active' : ''}`}
              onClick={() => {
                onChange(step);
                setOpen(false);
              }}
            >
              {step.toFixed(1)}×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
