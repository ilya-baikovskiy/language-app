// Этап 1: показывает дефолтную скорость 1.0×. Реальный список скоростей
// (0.6–1.5×) и переключение появятся вместе с логикой озвучки в Этапе 3.
export function SpeedControl() {
  return (
    <button className="speed-btn" type="button" aria-label="Скорость воспроизведения: 1.0×">
      1.0×
    </button>
  );
}
