import { Fragment } from 'react';
import type { Annotation, Sentence, Token } from '../types/lesson';
import { InteractiveToken } from './InteractiveToken';

type TokenGroup = {
  tokens: Token[];
  annotation?: Annotation;
};

// Соседние токены одной фразовой аннотации (напр. "avait besoin de") схлопываются
// в одну группу — вся фраза получает единое визуальное/интерактивное состояние (раздел 10 ТЗ).
function groupTokens(tokens: Token[], annotationsById: Map<string, Annotation>): TokenGroup[] {
  const groups: TokenGroup[] = [];
  for (const token of tokens) {
    const annotation = token.annotationId ? annotationsById.get(token.annotationId) : undefined;
    const lastGroup = groups[groups.length - 1];
    if (annotation?.type === 'phrase' && lastGroup?.annotation?.id === annotation.id) {
      lastGroup.tokens.push(token);
    } else {
      groups.push({ tokens: [token], annotation });
    }
  }
  return groups;
}

type Props = {
  sentence: Sentence;
  annotationsById: Map<string, Annotation>;
};

export function InteractiveSentence({ sentence, annotationsById }: Props) {
  const groups = groupTokens(sentence.tokens, annotationsById);

  return (
    <>
      {groups.map((group, index) => {
        const isPunctuation = group.tokens.length === 1 && group.tokens[0].type === 'punctuation';
        const needsLeadingSpace = index > 0 && !isPunctuation;
        const text = group.tokens.map((t) => t.text).join(' ');

        return (
          <Fragment key={group.tokens[0].id}>
            {needsLeadingSpace ? ' ' : null}
            {isPunctuation ? text : group.tokens.length > 1 ? (
              <span className="phrase">{text}</span>
            ) : (
              <InteractiveToken token={group.tokens[0]} />
            )}
          </Fragment>
        );
      })}
    </>
  );
}
