// Карточка сохранённого слова в разделе «Учить» — см.
// docs/training-plan/LEARN_SECTION_PLAN.md (этап C) и мокап 06-word-card.html.
//
// Принятое решение: это НЕ новый компонент разбора, а переиспользование
// ExplanationSheet из ридера. Пользователь видит для сохранённого слова ровно
// тот же разбор, что и при чтении — без второй реализации и без расхождения
// двух представлений одного и того же.
//
// Урок при этом грузить не нужно: SavedWord уже хранит почти весь
// AnnotationSummary (surfaceForm → displayForm, partOfSpeech, translation,
// audioText, contextSource/contextTranslation → context.source/.translation,
// relatedSource/relatedTranslation и hint), поэтому Annotation собирается
// прямо из сохранённого слова. Тир 2 («Подробнее») тоже работает: предложение
// токенизируется локально — ровно так же, как TrainingPracticeView делает это
// для соседних слов.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUnitPronunciation } from '../hooks/useUnitPronunciation';
import { fetchAnnotationBasic, fetchAnnotationDetails } from '../services/generation/lessonsApi';
import { isDue, isLeech, wordStatus, type WordStatus } from '../content-system/srs';
import { ANNOTATION_PROMPT_VERSION } from '../hooks/useSavedWords';
import { createInitialReviewState, type SavedWord } from '../content-system/savedWord';
import { getLanguageConfig, type LanguageCode } from '../../lib/pipeline/languageConfig';
import { tokenizeParagraphs } from '../../lib/pipeline/tokenize';
import type { DetailsStatus } from '../hooks/useSelectedAnnotation';
import type { Annotation, DetailSection } from '../types/lesson';
import { ExplanationSheet } from './ExplanationSheet';
import { Button } from './ui/controls';

const STATUS_LABELS: Record<WordStatus, string> = {
  new: 'Новое',
  learning: 'Учу',
  known: 'Знаю',
};

function formatNextReview(word: SavedWord, now: Date): string {
  if (isDue(word, now)) return 'повтор сегодня';
  const due = new Date(word.review.dueAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const days = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);
  if (days <= 1) return 'следующий повтор — завтра';
  if (days <= 7) return `следующий повтор — через ${days} дн.`;
  return `следующий повтор — ${due.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}`;
}

// Прогресс словами, а не цифрами SM-2: ease factor и intervalDays остаются под
// капотом (решение пользователя — «статусы + даты, без Anki-терминов»).
function formatProgress(word: SavedWord): string {
  const { repetitions, lapses } = word.review;
  if (repetitions === 0 && lapses === 0) return 'Ещё не тренировалось';

  const parts: string[] = [];
  if (repetitions > 0) {
    const noun = repetitions === 1 ? 'верный повтор' : repetitions < 5 ? 'верных повтора' : 'верных повторов';
    parts.push(`${repetitions} ${noun}${repetitions > 1 ? ' подряд' : ''}`);
  }
  if (lapses > 0) {
    const noun = lapses === 1 ? 'ошибка' : lapses < 5 ? 'ошибки' : 'ошибок';
    parts.push(`${lapses} ${noun}`);
  }
  const base = parts.join(' · ');
  return isLeech(word) ? `${base} — не даётся, попробуй сбросить или удалить` : base;
}

type Props = {
  word: SavedWord;
  onClose: () => void;
  onTrain: (word: SavedWord) => void;
  onUpdateWord: (word: SavedWord) => Promise<SavedWord>;
  onDelete: (word: SavedWord) => void;
};

// Разбор заморожен в момент сохранения (см. ANNOTATION_PROMPT_VERSION в
// useSavedWords.ts) — намеренно, чтобы карточка и уже пройденная тренировка не
// разъезжались молча. Слово «устарело», если промпт с тех пор менялся, или
// если оно сохранено ДО появления поля hint: `hint === undefined` значит «его
// никогда не забирали», `hint === null` — «AI явно решил, что подсказки нет»,
// это разные вещи.
function isOutdated(word: SavedWord): boolean {
  return word.annotationPromptVersion !== ANNOTATION_PROMPT_VERSION || word.hint === undefined;
}

// Токен-цель ищем по тексту, не по id: id из локальной токенизации не
// совпадают с tokenId урока (тот же приём, что в loadDetails ниже).
function findTargetToken(sentence: ReturnType<typeof tokenizeParagraphs>[number]['sentences'][number] | undefined, surfaceForm: string) {
  return sentence?.tokens.find(
    (token) => token.type === 'word' && token.text.toLocaleLowerCase() === surfaceForm.toLocaleLowerCase(),
  );
}

export function LearnWordCard({ word, onClose, onTrain, onUpdateWord, onDelete }: Props) {
  const language = word.language as LanguageCode;
  const [details, setDetails] = useState<{ sections: DetailSection[] } | undefined>();
  const [detailsStatus, setDetailsStatus] = useState<DetailsStatus>('idle');
  const [confirming, setConfirming] = useState<'reset' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const pronunciation = useUnitPronunciation(language, word.audioProvider ?? 'openai');
  // Одна временная точка на карточку, обновляется при смене данных слова
  // (например после сброса прогресса) — иначе статус и дата могут разойтись.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(new Date());
  }, [word]);

  // Аннотация из сохранённого слова — тот же контракт, что отдаёт
  // /api/generate-annotation, поэтому шит ридера принимает её как есть.
  const annotation: Annotation = useMemo(
    () => ({
      id: word.tokenId,
      summary: {
        partOfSpeech: word.partOfSpeech ?? null,
        displayForm: word.surfaceForm,
        translation: word.translation,
        audioText: word.audioText ?? word.surfaceForm,
        hint: word.hint ?? null,
        context: {
          source: word.contextSource ?? word.surfaceForm,
          translation: word.contextTranslation ?? word.translation,
          selectedSource: word.surfaceForm,
          selectedTranslation: word.translation,
          relatedSource: word.relatedSource,
          relatedTranslation: word.relatedTranslation,
        },
      },
      details,
    }),
    [word, details],
  );

  const loadDetails = useCallback(() => {
    if (detailsStatus === 'loading' || details) return;
    // Тир 2 требует токенизированное предложение. Урок для этого не нужен —
    // хватает сохранённого contextSource.
    const source = word.contextSource;
    if (!source) {
      setDetailsStatus('error');
      return;
    }
    setDetailsStatus('loading');
    const sentence = tokenizeParagraphs([source], getLanguageConfig(language).bcp47)[0]?.sentences[0];
    // Целевой токен ищем по тексту: id токенов из локальной токенизации не
    // совпадают с tokenId урока, а тир 2 адресует цель именно внутри
    // переданного предложения.
    const target = findTargetToken(sentence, word.surfaceForm);
    if (!sentence || !target) {
      setDetailsStatus('error');
      return;
    }
    fetchAnnotationDetails({ tokenId: target.id, sentence }, word.level ?? 'A2', language)
      .then((loaded) => {
        setDetails(loaded);
        setDetailsStatus('ready');
      })
      .catch((error) => {
        console.error('Не удалось загрузить подробности слова:', error);
        setDetailsStatus('error');
      });
  }, [details, detailsStatus, language, word.contextSource, word.level, word.surfaceForm]);

  const retryDetails = useCallback(() => {
    setDetails(undefined);
    setDetailsStatus('idle');
    loadDetails();
  }, [loadDetails]);

  // Осознанное действие, а не тихий автодобор при открытии карточки: перевод
  // мог измениться с прошлого промпта (см. isOutdated), а тренировка уже идёт
  // по старой формулировке. Пользователь явно жмёт «Обновить» и видит новый
  // результат — не рассинхрон между карточкой и засчитанным прогрессом.
  async function handleRefreshAnnotation() {
    const source = word.contextSource;
    if (!source) {
      setRefreshStatus('error');
      return;
    }
    setRefreshStatus('loading');
    const sentence = tokenizeParagraphs([source], getLanguageConfig(language).bcp47)[0]?.sentences[0];
    const target = findTargetToken(sentence, word.surfaceForm);
    if (!sentence || !target) {
      setRefreshStatus('error');
      return;
    }
    try {
      const summary = await fetchAnnotationBasic({ tokenId: target.id, sentence }, word.level ?? 'A2', language);
      await onUpdateWord({
        ...word,
        surfaceForm: summary.displayForm,
        partOfSpeech: summary.partOfSpeech,
        translation: summary.translation,
        audioText: summary.audioText,
        hint: summary.hint,
        contextSource: summary.context.source,
        contextTranslation: summary.context.translation,
        relatedSource: summary.context.relatedSource ?? null,
        relatedTranslation: summary.context.relatedTranslation ?? null,
        annotationPromptVersion: ANNOTATION_PROMPT_VERSION,
        updatedAt: new Date().toISOString(),
      });
      // Тир 2 сгенерирован по старому разбору — сбрасываем, чтобы «Подробнее»
      // при следующем открытии подтянул детали заново, в согласии с новым тиром 1.
      setDetails(undefined);
      setDetailsStatus('idle');
      setRefreshStatus('done');
    } catch (error) {
      console.error('Не удалось обновить разбор слова:', error);
      setRefreshStatus('error');
    }
  }

  async function handleReset() {
    setBusy(true);
    try {
      await onUpdateWord({
        ...word,
        review: createInitialReviewState(),
        updatedAt: new Date().toISOString(),
      });
      onClose();
    } catch (error) {
      console.error('Не удалось сбросить прогресс слова:', error);
      setBusy(false);
      setConfirming(null);
    }
  }

  const status = wordStatus(word);
  const due = isDue(word, now);

  return (
    <ExplanationSheet
      isOpen
      selection={{
        kind: 'annotation',
        annotation,
        sentenceText: word.contextSource ?? word.surfaceForm,
        detailsStatus,
      }}
      onClose={onClose}
      onSpeak={(text, onError) => pronunciation.speak(text, onError)}
      onSpeakUnit={(text, onError) => pronunciation.speak(text, onError)}
      isUnitLoading={pronunciation.isLoading}
      onRetry={onClose}
      onLoadDetails={loadDetails}
      onRetryDetails={retryDetails}
      footer={
        <div className="sheet-footer learn-card-footer">
          <Button variant="primary" size="lg" fullWidth disabled={busy} onClick={() => onTrain(word)}>
            Тренировать сейчас
          </Button>
          <p className="learn-card-footer-note">
            {due
              ? 'слово в сегодняшней очереди — тренировка засчитается'
              : 'вне расписания — прогресс не изменится'}
          </p>
        </div>
      }
    >
      <div className="learn-card-block">
        <div className="learn-card-status">
          <span className={`learn-card-badge is-${status}`}>{STATUS_LABELS[status]}</span>
          {isLeech(word) && <span className="learn-card-badge is-hard">сложное</span>}
          <span className="learn-card-next">{formatNextReview(word, now)}</span>
        </div>
        <p className="learn-card-progress">{formatProgress(word)}</p>

        {refreshStatus !== 'done' && isOutdated(word) && (
          <div className="learn-card-outdated">
            <p>
              {word.hint === undefined
                ? 'Слово сохранено до появления слот-подсказки — обновите разбор, чтобы её увидеть.'
                : 'Разбор собран старой версией промпта — можно обновить перевод и форму.'}
            </p>
            <Button disabled={refreshStatus === 'loading'} onClick={() => void handleRefreshAnnotation()}>
              {refreshStatus === 'loading' ? 'Обновляем…' : 'Обновить разбор'}
            </Button>
            {refreshStatus === 'error' && (
              <p className="learn-card-outdated-error">Не удалось обновить — попробуй ещё раз.</p>
            )}
          </div>
        )}

        {confirming === null ? (
          <div className="learn-card-actions">
            <Button disabled={busy} onClick={() => setConfirming('reset')}>
              Сбросить прогресс
            </Button>
            <Button className="learn-card-danger" disabled={busy} onClick={() => setConfirming('delete')}>
              Удалить слово
            </Button>
          </div>
        ) : (
          <div className="learn-card-confirm" role="alertdialog" aria-label="Подтверждение">
            <p>
              {confirming === 'reset'
                ? 'Сбросить прогресс? Слово снова станет «Новым» и вернётся в очередь на сегодня.'
                : 'Удалить слово из изучаемых? Прогресс по нему будет потерян.'}
            </p>
            <div className="learn-card-actions">
              <Button disabled={busy} onClick={() => setConfirming(null)}>
                Отмена
              </Button>
              <Button
                variant="primary"
                className={confirming === 'delete' ? 'learn-card-danger-solid' : undefined}
                disabled={busy}
                onClick={() => (confirming === 'reset' ? void handleReset() : onDelete(word))}
              >
                {confirming === 'reset' ? 'Сбросить' : 'Удалить'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ExplanationSheet>
  );
}
