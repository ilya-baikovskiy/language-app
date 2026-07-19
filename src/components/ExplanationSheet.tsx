import type { SheetSelection } from '../hooks/useSelectedAnnotation';
import { ContextMeaning } from './ContextMeaning';
import { GrammarSummary } from './GrammarSummary';
import { ExampleList } from './ExampleList';
import { AudioActionButtons } from './AudioActionButtons';

type Props = {
  selection: SheetSelection | null;
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  onSpeak: (text: string) => void;
};

// Раздел 6.4 и 11 ТЗ. Контент не размонтируется при закрытии (иначе во время
// анимации сворачивания панель на миг станет пустой) — только isOpen переключает
// видимость через CSS-класс.
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
          <div className="sheet-handle" />

          {selection?.kind === 'annotation' && (
            <>
              <div className="sheet-top">
                <div>
                  <div className="sheet-head">{selection.annotation.displayText}</div>
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

              <ContextMeaning annotation={selection.annotation} />
              <GrammarSummary annotation={selection.annotation} />
              <ExampleList examples={selection.annotation.examples} />
              <AudioActionButtons
                variant={selection.annotation.type === 'phrase' ? 'phrase' : 'word'}
                onSpeakWord={() =>
                  onSpeak(
                    selection.annotation.type === 'phrase'
                      ? selection.annotation.displayText.split(' ')[0]
                      : selection.annotation.displayText,
                  )
                }
                onSpeakPhrase={
                  selection.annotation.type === 'phrase' ? () => onSpeak(selection.annotation.displayText) : undefined
                }
                onSpeakSentence={() => onSpeak(selection.sentenceText)}
                onContinue={onContinue}
              />
            </>
          )}

          {selection?.kind === 'fallback' && (
            <>
              <div className="sheet-top">
                <div className="sheet-head">{selection.word}</div>
                <button className="sheet-close" type="button" aria-label="Закрыть" onClick={onClose}>
                  <CloseIcon />
                </button>
              </div>

              <hr className="sheet-divider" />

              <div className="sheet-body">
                <p>Встречается в предложении: «{selection.sentenceText}»</p>
                <p className="fallback-note">Подробное объяснение пока не добавлено.</p>
              </div>

              <AudioActionButtons variant="fallback" onSpeakWord={() => onSpeak(selection.word)} onContinue={onContinue} />
            </>
          )}
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
