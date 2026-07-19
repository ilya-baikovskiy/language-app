import { Fragment, useMemo } from 'react';
import type { Lesson } from '../types/lesson';
import { InteractiveSentence } from './InteractiveSentence';

type Props = {
  lesson: Lesson;
};

export function ArticleContent({ lesson }: Props) {
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
              <InteractiveSentence sentence={sentence} annotationsById={annotationsById} />
            </Fragment>
          ))}
        </p>
      ))}
    </main>
  );
}
