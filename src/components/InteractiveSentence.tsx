import { Fragment } from 'react';
import type { Annotation, Sentence, Token } from '../types/lesson';
import { InteractiveToken } from './InteractiveToken';

type TokenGroup = {
  tokens: Token[];
  annotationId?: string;
  annotation?: Annotation;
};

// Соседние токены одной фразовой группы (напр. "avait besoin de") схлопываются
// в одну группу — вся фраза получает единое визуальное/интерактивное состояние (раздел 10 ТЗ).
// Группировка идёт по token.annotationId, а не по наличию объекта Annotation:
// с ленивой генерацией контента (CLAUDE.md) annotationId проставляется на
// этапе создания урока (stampAnnotationTargets), а сам Annotation с текстом
// объяснения может появиться позже, по клику — фраза должна схлопываться в
// одну кликабельную область уже сейчас, до того как контент подгружен.
function groupTokens(tokens: Token[], annotationsById: Map<string, Annotation>): TokenGroup[] {
  const groups: TokenGroup[] = [];
  for (const token of tokens) {
    const lastGroup = groups[groups.length - 1];
    if (token.annotationId && lastGroup?.annotationId === token.annotationId) {
      lastGroup.tokens.push(token);
    } else {
      groups.push({
        tokens: [token],
        annotationId: token.annotationId,
        annotation: token.annotationId ? annotationsById.get(token.annotationId) : undefined,
      });
    }
  }
  return groups;
}

type Props = {
  sentence: Sentence;
  annotationsById: Map<string, Annotation>;
  selectedAnnotationId: string | null;
  selectedTokenId: string | null;
  activeTokenId: string | null;
  onSelectGroup: (tokenId: string, annotationId: string | null) => void;
};

export function InteractiveSentence({
  sentence,
  annotationsById,
  selectedAnnotationId,
  selectedTokenId,
  activeTokenId,
  onSelectGroup,
}: Props) {
  const groups = groupTokens(sentence.tokens, annotationsById);

  return (
    <>
      {groups.map((group, index) => {
        const isPunctuation = group.tokens.length === 1 && group.tokens[0].type === 'punctuation';
        const needsLeadingSpace = index > 0 && !isPunctuation;
        const anchorTokenId = group.tokens[0].id;
        const isSelected = group.annotationId
          ? selectedAnnotationId === group.annotationId
          : selectedTokenId === anchorTokenId;

        if (isPunctuation) {
          return <Fragment key={anchorTokenId}>{group.tokens[0].text}</Fragment>;
        }

        if (group.tokens.length > 1) {
          // Фраза — единая кликабельная область (открывается одно объяснение на
          // всю фразу), но подсветка двухуровневая: вся фраза тонируется мягко
          // (.phrase.is-selected), а конкретное кликнутое слово внутри —
          // сильнее (.tok-inline.is-selected-token). Поэтому внутренние слова
          // тоже кликабельны и репортят свой tokenId (аннотация — всё равно
          // фразовая), а клик по «пробелу» между словами ловит внешний span по
          // якорному токену. Подсветка произносимого слова остаётся точечной.
          return (
            <Fragment key={anchorTokenId}>
              {needsLeadingSpace ? ' ' : null}
              <span
                className={`phrase${isSelected ? ' is-selected' : ''}`}
                onClick={() => onSelectGroup(anchorTokenId, group.annotationId ?? null)}
              >
                {group.tokens.map((token, tokenIndex) => {
                  const classes = ['tok-inline'];
                  if (activeTokenId === token.id) classes.push('is-speaking');
                  if (isSelected && selectedTokenId === token.id) classes.push('is-selected-token');
                  return (
                    <Fragment key={token.id}>
                      {tokenIndex > 0 ? ' ' : null}
                      <span
                        className={classes.join(' ')}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectGroup(token.id, group.annotationId ?? null);
                        }}
                      >
                        {token.text}
                      </span>
                    </Fragment>
                  );
                })}
              </span>
            </Fragment>
          );
        }

        return (
          <Fragment key={anchorTokenId}>
            {needsLeadingSpace ? ' ' : null}
            <InteractiveToken
              token={group.tokens[0]}
              isSelected={isSelected}
              isSpeaking={activeTokenId === anchorTokenId}
              onSelect={() => onSelectGroup(anchorTokenId, group.annotation?.id ?? null)}
            />
          </Fragment>
        );
      })}
    </>
  );
}
