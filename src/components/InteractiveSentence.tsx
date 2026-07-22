import { Fragment } from 'react';
import type { Sentence } from '../types/lesson';
import { InteractiveToken } from './InteractiveToken';

// Bottom Sheet v2 (см. AI_PIPELINE.md) — каждое word-слово кликабельно само
// по себе, всегда. Раньше здесь была группировка соседних токенов с общим
// annotationId в одну кликабельную фразу (markPhrases решал это на этапе
// генерации) — убрана: клик по любому слову всегда открывает объяснение
// именно на него, «связанная фраза» показывается внутри самого объяснения
// (см. ExplanationSheet), а не меняет цель клика.

type Props = {
  sentence: Sentence;
  selectedTokenId: string | null;
  activeTokenId: string | null;
  onSelectToken: (tokenId: string) => void;
};

export function InteractiveSentence({ sentence, selectedTokenId, activeTokenId, onSelectToken }: Props) {
  return (
    <>
      {sentence.tokens.map((token, index) => {
        const needsLeadingSpace = index > 0 && token.type !== 'punctuation';
        if (token.type === 'punctuation') {
          return <Fragment key={token.id}>{token.text}</Fragment>;
        }
        return (
          <Fragment key={token.id}>
            {needsLeadingSpace ? ' ' : null}
            <InteractiveToken
              token={token}
              isSelected={selectedTokenId === token.id}
              isSpeaking={activeTokenId === token.id}
              onSelect={() => onSelectToken(token.id)}
            />
          </Fragment>
        );
      })}
    </>
  );
}
