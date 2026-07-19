import type { Annotation } from '../types/lesson';
import { GrammarDetails } from './GrammarDetails';

type Props = {
  annotation: Annotation;
};

export function GrammarSummary({ annotation }: Props) {
  if (!annotation.grammarSummary) return null;

  return (
    <div className="sheet-body">
      <p className="sheet-section-title">Грамматика</p>
      <p>{annotation.grammarSummary}</p>
      {annotation.grammarDetails && <GrammarDetails details={annotation.grammarDetails} />}
      {annotation.otherMeanings && annotation.otherMeanings.length > 0 && (
        <details className="sheet-more">
          <summary>Другие частые значения</summary>
          <div className="sheet-more-body">
            {annotation.otherMeanings.map((meaning) => (
              <p key={meaning.translation}>{meaning.translation}</p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
