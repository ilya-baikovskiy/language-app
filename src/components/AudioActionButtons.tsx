type Props = {
  hasPhrase: boolean;
};

// Этап 1: кнопки статичны (без onClick) — реальное прослушивание слова/фразы/
// предложения и «Продолжить отсюда» подключаются в Этапе 3.
export function AudioActionButtons({ hasPhrase }: Props) {
  return (
    <>
      <div className="sheet-actions">
        <button className="act-btn" type="button">
          ▶ Слово
        </button>
        {hasPhrase && (
          <button className="act-btn" type="button">
            ▶ Фраза
          </button>
        )}
        <button className="act-btn" type="button">
          ▶ Предложение
        </button>
        <button className="act-btn primary" type="button">
          Продолжить отсюда
        </button>
      </div>
      <div className="sheet-actions" style={{ marginTop: 8 }}>
        <button className="act-btn ghost" type="button">
          ✦ Спросить AI · скоро
        </button>
      </div>
    </>
  );
}
