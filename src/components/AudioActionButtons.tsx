type Props = {
  variant: 'word' | 'phrase' | 'fallback';
  onSpeakWord: () => void;
  onSpeakPhrase?: () => void;
  onSpeakSentence?: () => void;
  onContinue: () => void;
};

export function AudioActionButtons({ variant, onSpeakWord, onSpeakPhrase, onSpeakSentence, onContinue }: Props) {
  return (
    <>
      <div className="sheet-actions">
        <button className="act-btn" type="button" onClick={onSpeakWord}>
          ▶ Слово
        </button>
        {variant === 'phrase' && onSpeakPhrase && (
          <button className="act-btn" type="button" onClick={onSpeakPhrase}>
            ▶ Фраза
          </button>
        )}
        {variant !== 'fallback' && onSpeakSentence && (
          <button className="act-btn" type="button" onClick={onSpeakSentence}>
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
