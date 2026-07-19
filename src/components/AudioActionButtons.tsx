type Props = {
  variant: 'word' | 'phrase' | 'fallback';
  onContinue: () => void;
};

// Этап 2: реально работает только «Продолжить отсюда» (закрывает Bottom Sheet).
// Прослушивание слова/фразы/предложения подключится вместе с озвучкой в Этапе 3.
export function AudioActionButtons({ variant, onContinue }: Props) {
  return (
    <>
      <div className="sheet-actions">
        <button className="act-btn" type="button">
          ▶ Слово
        </button>
        {variant === 'phrase' && (
          <button className="act-btn" type="button">
            ▶ Фраза
          </button>
        )}
        {variant !== 'fallback' && (
          <button className="act-btn" type="button">
            ▶ Предложение
          </button>
        )}
        <button className="act-btn primary" type="button" onClick={onContinue}>
          Продолжить отсюда
        </button>
      </div>
      {variant !== 'fallback' && (
        <div className="sheet-actions" style={{ marginTop: 8 }}>
          <button className="act-btn ghost" type="button">
            ✦ Спросить AI · скоро
          </button>
        </div>
      )}
    </>
  );
}
