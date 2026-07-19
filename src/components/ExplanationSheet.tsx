import type { Annotation } from '../types/lesson';
import { ContextMeaning } from './ContextMeaning';
import { GrammarSummary } from './GrammarSummary';
import { ExampleList } from './ExampleList';
import { AudioActionButtons } from './AudioActionButtons';

type Props = {
  annotation: Annotation;
  isOpen: boolean;
};

// Этап 1: статическая вёрстка Bottom Sheet (раздел 6.4 и 11 ТЗ) с контентом
// одной заготовленной аннотации. isOpen сейчас захардкожен на false в
// ReaderPage — открытие по клику на слово появится в Этапе 2.
export function ExplanationSheet({ annotation, isOpen }: Props) {
  return (
    <>
      <div className={`sheet-overlay${isOpen ? ' is-open' : ''}`} />
      <div className={`sheet${isOpen ? ' is-open' : ''}`}>
        <div className="sheet-panel">
          <div className="sheet-handle" />

          <div className="sheet-top">
            <div>
              <div className="sheet-head">{annotation.displayText}</div>
              {annotation.pronunciation && <p className="sheet-pron">{annotation.pronunciation}</p>}
            </div>
            <button className="sheet-close" type="button" aria-label="Закрыть">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <p className="sheet-lemma">
            от <b>{annotation.lemma}</b>
            {annotation.partOfSpeech && <span className="sheet-tag">{annotation.partOfSpeech}</span>}
            {annotation.grammarLabel && <span className="sheet-tag">{annotation.grammarLabel}</span>}
          </p>
          <p className="sheet-translation">{annotation.shortTranslation}</p>

          <hr className="sheet-divider" />

          <ContextMeaning annotation={annotation} />
          <GrammarSummary annotation={annotation} />
          <ExampleList examples={annotation.examples} />
          <AudioActionButtons hasPhrase={annotation.type === 'phrase'} />
        </div>
      </div>
    </>
  );
}
