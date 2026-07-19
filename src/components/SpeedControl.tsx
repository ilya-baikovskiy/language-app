type Props = {
  rate: number;
  onCycle: () => void;
};

export function SpeedControl({ rate, onCycle }: Props) {
  return (
    <button className="speed-btn" type="button" aria-label={`Скорость воспроизведения: ${rate}×`} onClick={onCycle}>
      {rate.toFixed(1)}×
    </button>
  );
}
