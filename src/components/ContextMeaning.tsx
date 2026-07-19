import type { Annotation } from '../types/lesson';

type Props = {
  annotation: Annotation;
};

export function ContextMeaning({ annotation }: Props) {
  return (
    <div className="sheet-body">
      <p className="sheet-section-title">В этом предложении</p>
      <p>{annotation.contextualMeaning}</p>
      {annotation.constructionExplanation && (
        <>
          <p className="sheet-section-title">Конструкция</p>
          <p>{annotation.constructionExplanation}</p>
        </>
      )}
    </div>
  );
}
