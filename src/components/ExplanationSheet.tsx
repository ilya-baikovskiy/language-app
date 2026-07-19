import type { SheetSelection } from '../hooks/useSelectedAnnotation';
import { GrammarSummary } from './GrammarSummary';
import { ExampleList } from './ExampleList';

type Props = {
  selection: SheetSelection | null;
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  onSpeak: (text: string) => void;
};

// Раздел 6.4 и 11 ТЗ. Контент не размонтируется при закрытии (иначе во время
// анимации сворачивания панель на миг станет пустой) — только isOpen переключает
// видимость через CSS-класс. Прослушивание слова/фразы — иконка рядом с текстом,
// а не отдельная кнопка внизу: объяснение может быть длинным и прокручиваться,
// поэтому основное действие («Продолжить отсюда») закреплено в футере панели.
export function ExplanationSheet({ selection, isOpen, onClose, onContinue, onSpeak }: Props) {
  return (
    <>
      <div className={`sheet-overlay${isOpen ? ' is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <div
        className={`sheet${isOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Объяснение слова"
      >
        <div className="sheet-panel">
          <div className="sheet-scroll">
            <div className="sheet-handle" />

            {selection?.kind === 'annotation' && (
              <>
                <div className="sheet-top">
                  <div>
                    <div className="sheet-head-row">
                      <div className="sheet-head">{selection.annotation.displayText}</div>
                      <button
                        className="icon-btn-sm"
                        type="button"
                        aria-label="Прослушать"
                        onClick={() => onSpeak(selection.annotation.displayText)}
                      >
                        <SpeakerIcon />
                      </button>
                    </div>
                    {selection.annotation.pronunciation && (
                      <p className="sheet-pron">{selection.annotation.pronunciation}</p>
                    )}
                  </div>
                  <button className="sheet-close" type="button" aria-label="Закрыть" onClick={onClose}>
                    <CloseIcon />
                  </button>
                </div>
                <p className="sheet-lemma">
                  от <b>{selection.annotation.lemma}</b>
                  {selection.annotation.partOfSpeech && (
                    <span className="sheet-tag">{selection.annotation.partOfSpeech}</span>
                  )}
                  {selection.annotation.grammarLabel && (
                    <span className="sheet-tag">{selection.annotation.grammarLabel}</span>
                  )}
                </p>
                <p className="sheet-translation">{selection.annotation.shortTranslation}</p>

                <hr className="sheet-divider" />

                <div className="sheet-body">
                  <div className="sheet-section-row">
                    <p className="sheet-section-title">В этом предложении</p>
                    <button
                      className="icon-btn-sm"
                      type="button"
                      aria-label="Прослушать предложение"
                      onClick={() => onSpeak(selection.sentenceText)}
                    >
                      <SpeakerIcon />
                    </button>
                  </div>
                  <p>{selection.annotation.contextualMeaning}</p>
                  {selection.annotation.constructionExplanation && (
                    <>
                      <p className="sheet-section-title">Конструкция</p>
                      <p>{selection.annotation.constructionExplanation}</p>
                    </>
                  )}
                </div>

                <GrammarSummary annotation={selection.annotation} />
                <ExampleList examples={selection.annotation.examples} />
              </>
            )}

            {selection?.kind === 'fallback' && (
              <>
                <div className="sheet-top">
                  <div className="sheet-head-row">
                    <div className="sheet-head">{selection.word}</div>
                    <button
                      className="icon-btn-sm"
                      type="button"
                      aria-label="Прослушать"
                      onClick={() => onSpeak(selection.word)}
                    >
                      <SpeakerIcon />
                    </button>
                  </div>
                  <button className="sheet-close" type="button" aria-label="Закрыть" onClick={onClose}>
                    <CloseIcon />
                  </button>
                </div>

                <hr className="sheet-divider" />

                <div className="sheet-body">
                  <p>Встречается в предложении: «{selection.sentenceText}»</p>
                  <p className="fallback-note">Подробное объяснение пока не добавлено.</p>
                </div>
              </>
            )}
          </div>

          <div className="sheet-footer">
            <button className="act-btn primary" type="button" onClick={onContinue}>
              Продолжить отсюда
            </button>
            {selection && (
              <button className="act-btn ghost" type="button">
                ✦ Спросить AI · скоро
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16.5 8.5a5 5 0 010 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
