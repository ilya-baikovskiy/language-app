import { Fragment, useMemo } from 'react';
import type { Lesson } from '../types/lesson';
import { InteractiveSentence } from './InteractiveSentence';

type Props = {
  lesson: Lesson;
  selectedAnnotationId: string | null;
  selectedTokenId: string | null;
  onSelectGroup: (tokenId: string, annotationId: string | null) => void;
};

export function ArticleContent({ lesson, selectedAnnotationId, selectedTokenId, onSelectGroup }: Props) {
  const annotationsById = useMemo(
    () => new Map(lesson.annotations.map((annotation) => [annotation.id, annotation])),
    [lesson.annotations],
  );

  return (
    <main className="article-wrap">
      {lesson.paragraphs.map((paragraph) => (
        <p key={paragraph.id}>
          {paragraph.sentences.map((sentence, index) => (
            <Fragment key={sentence.id}>
              {index > 0 ? ' ' : null}
              <InteractiveSentence
                sentence={sentence}
                annotationsById={annotationsById}
                selectedAnnotationId={selectedAnnotationId}
                selectedTokenId={selectedTokenId}
                onSelectGroup={onSelectGroup}
              />
            </Fragment>
          ))}
        </p>
      ))}
    </main>
  );
}
