import { Fragment } from 'react';
import type { Lesson } from '../types/lesson';
import type { SentenceTranslation } from '../hooks/useSentenceTranslations';
import { InteractiveSentence } from './InteractiveSentence';

type Props = {
  lesson: Lesson;
  selectedTokenId: string | null;
  activeTokenId: string | null;
  onSelectToken: (tokenId: string) => void;
  translationMode: boolean;
  translations: Map<string, SentenceTranslation>;
  onRetryTranslation: (sentenceId: string) => void;
};

export function ArticleContent({
  lesson,
  selectedTokenId,
  activeTokenId,
  onSelectToken,
  translationMode,
  translations,
  onRetryTranslation,
}: Props) {
  // Режим перевода: каждое предложение — блок с русской строкой под ним. Обычный
  // режим — предложения инлайн внутри абзаца (как в ридере по умолчанию).
  if (translationMode) {
    return (
      <main className="article-wrap translation-mode">
        {lesson.paragraphs.map((paragraph) => (
          <div className="para-block" key={paragraph.id}>
            {paragraph.sentences.map((sentence) => (
              <div className="sentence-block" key={sentence.id}>
                <InteractiveSentence
                  sentence={sentence}
                  selectedTokenId={selectedTokenId}
                  activeTokenId={activeTokenId}
                  onSelectToken={onSelectToken}
                />
                <TranslationRow
                  translation={translations.get(sentence.id)}
                  onRetry={() => onRetryTranslation(sentence.id)}
                />
              </div>
            ))}
          </div>
        ))}
      </main>
    );
  }

  return (
    <main className="article-wrap">
      {lesson.paragraphs.map((paragraph) => (
        <p key={paragraph.id}>
          {paragraph.sentences.map((sentence, index) => (
            <Fragment key={sentence.id}>
              {index > 0 ? ' ' : null}
              <InteractiveSentence
                sentence={sentence}
                selectedTokenId={selectedTokenId}
                activeTokenId={activeTokenId}
                onSelectToken={onSelectToken}
              />
            </Fragment>
          ))}
        </p>
      ))}
    </main>
  );
}

function TranslationRow({
  translation,
  onRetry,
}: {
  translation: SentenceTranslation | undefined;
  onRetry: () => void;
}) {
  const status = translation?.status ?? 'idle';

  if (status === 'ready') {
    return <div className="sentence-translation">{translation?.text}</div>;
  }
  if (status === 'error') {
    return (
      <div className="sentence-translation is-error">
        Не удалось перевести.{' '}
        <button type="button" className="translation-retry" onClick={onRetry}>
          Повторить
        </button>
      </div>
    );
  }
  // idle / loading
  return (
    <div className="sentence-translation is-loading" aria-live="polite">
      Переводим…
    </div>
  );
}
