import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { classifyReviewAnswer, isDue, scheduleNext, wordStatus, type ReviewVerdict } from '../content-system/srs';
import { TrainingSessionSummary, type SessionOutcome } from './TrainingSessionSummary';
import {
  PRACTICE_PHRASE_PROMPT_VERSION,
  type SavedWord,
} from '../content-system/savedWord';
import type { TrainingPhraseMode } from '../content-system/userTypes';
import { useSpeechInput } from '../hooks/useSpeechInput';
import { useUnitPronunciation } from '../hooks/useUnitPronunciation';
import { selectSourcePracticeContext } from '../lib/trainingPhrase';
import { findWordAlignedIndex } from '../lib/wordAlign';
import { getSentenceAudioSegment, playAudioSegment } from '../lib/lessonSentenceAudio';
import {
  fetchAnnotationBasic,
  fetchPracticeFeedback,
  fetchPracticePhrase,
} from '../services/generation/lessonsApi';
import { getLanguageConfig, type LanguageCode } from '../../lib/pipeline/languageConfig';
import { tokenizeParagraphs } from '../../lib/pipeline/tokenize';
import type { AnnotationSummary } from '../types/lesson';
import {
  Button,
  FeedbackPanel,
  IconButton,
  SpeakerButton,
  TextInput,
} from './ui/controls';
import { CloseIcon, MicrophoneIcon, StopIcon } from './ui/icons';

type Props = {
  words: SavedWord[];
  phraseMode?: TrainingPhraseMode;
  onExit: () => void;
  onUpdateWord?: (word: SavedWord) => Promise<SavedWord>;
};

type Cloze = { before: string; blank: string; after: string };
type FrozenPhrase = { wordId: string; source?: string; translation?: string };
type GlossState =
  | { status: 'loading'; text: string }
  | { status: 'ready'; text: string; summary: AnnotationSummary }
  | { status: 'error'; text: string };
type FeedbackState =
  | { status: 'loading' }
  | { status: 'ready'; explanation: string }
  | { status: 'error'; explanation: string };

function availableFrozenPhrase(
  word: SavedWord | undefined,
  phraseMode: TrainingPhraseMode,
): FrozenPhrase | null {
  if (!word) return null;
  if (phraseMode === 'source') {
    return {
      wordId: word.id,
      ...selectSourcePracticeContext(
        word,
        getLanguageConfig(word.language as LanguageCode).bcp47,
      ),
    };
  }
  if (!word.practicePhrase) return null;
  return {
    wordId: word.id,
    source: word.practicePhrase.source,
    translation: word.practicePhrase.translation,
  };
}

function tokenize(text: string): string[] {
  return text.match(/[\p{L}\p{M}'’-]+|\s+|[^\s]/gu) ?? [];
}
const WORD_TOKEN = /[\p{L}\p{M}]/u;

function buildCloze(source: string | undefined, surfaceForm: string): Cloze | null {
  if (!source) return null;
  const idx = findWordAlignedIndex(source, surfaceForm);
  if (idx === -1) return null;
  return {
    before: source.slice(0, idx),
    blank: source.slice(idx, idx + surfaceForm.length),
    after: source.slice(idx + surfaceForm.length),
  };
}

function boldRussian(
  contextTranslation: string,
  candidates: Array<string | null | undefined>,
): { before: string; bold: string; after: string } | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const idx = findWordAlignedIndex(contextTranslation, candidate);
    if (idx !== -1) {
      return {
        before: contextTranslation.slice(0, idx),
        bold: contextTranslation.slice(idx, idx + candidate.length),
        after: contextTranslation.slice(idx + candidate.length),
      };
    }
  }
  return null;
}

function ClozeWords({ text, onTapWord }: { text: string; onTapWord: (word: string) => void }) {
  const tokens = useMemo(() => tokenize(text), [text]);
  return (
    <>
      {tokens.map((token, index) =>
        WORD_TOKEN.test(token) ? (
          <button
            key={index}
            className="training-context-word"
            type="button"
            onClick={() => onTapWord(token)}
            title={`Объяснить «${token}»`}
          >
            {token}
          </button>
        ) : (
          <span key={index}>{token}</span>
        ),
      )}
    </>
  );
}

function verdictPresentation(
  verdict: ReviewVerdict,
  retry: boolean,
  hintUsed: boolean,
  answer: string,
): {
  tone: 'success' | 'warning' | 'error' | 'neutral';
  title: string;
} {
  if (verdict === 'good') {
    return { tone: 'success', title: retry ? '✓ Теперь верно' : '✓ Верно' };
  }
  if (!answer.trim() || hintUsed) {
    return { tone: 'neutral', title: 'Ответ показан' };
  }
  if (verdict === 'almost') return { tone: 'warning', title: '≈ Почти' };
  return { tone: 'error', title: '✕ Не совсем' };
}

function fallbackFeedback(verdict: ReviewVerdict, expected: string): string {
  return verdict === 'almost'
    ? `Ответ близок, но точная форма в этом предложении — «${expected}».`
    : `В этом контексте нужна форма «${expected}».`;
}

export function TrainingPracticeView({
  words,
  phraseMode = 'source',
  onExit,
  onUpdateWord,
}: Props) {
  const [sessionWords, setSessionWords] = useState(words);
  // Какие слова были «к повтору» на момент старта сессии — единственный
  // критерий, обновлять ли расписание. Замораживается вместе с очередью:
  // dueAt меняется только нашей же записью, поэтому пересчитывать его на
  // каждый ответ незачем, а зафиксированный набор не «уплывает» посреди сессии.
  //
  // Это заменяет прежний сессионный флаг freePractice: тренировка вне
  // расписания — не отдельный режим, а просто случай, когда к повтору не было
  // ничего. Тот же механизм автоматически делает учебной и мини-сессию
  // «Повторить ошибки» (там dueAt уже уехал в будущее первой попыткой).
  const [dueWordIds, setDueWordIds] = useState(
    () => new Set(words.filter((word) => isDue(word)).map((word) => word.id)),
  );
  // Итоги по одному на слово, в порядке прохождения — основа экрана итогов.
  const [outcomes, setOutcomes] = useState<SessionOutcome[]>([]);
  const [finished, setFinished] = useState(false);
  const [index, setIndex] = useState(0);
  const [frozenPhrase, setFrozenPhrase] = useState<FrozenPhrase | null>(
    () => availableFrozenPhrase(words[0], phraseMode),
  );
  const [phraseStatus, setPhraseStatus] = useState<'idle' | 'loading'>(
    () => (phraseMode === 'ai' && words[0] && !words[0].practicePhrase ? 'loading' : 'idle'),
  );
  const [input, setInput] = useState('');
  const [answerForResult, setAnswerForResult] = useState('');
  const [answered, setAnswered] = useState(false);
  const [verdict, setVerdict] = useState<ReviewVerdict | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [srsLocked, setSrsLocked] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewIntervalDays, setReviewIntervalDays] = useState<number | null>(null);
  const [gloss, setGloss] = useState<GlossState | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [fullPhraseLoading, setFullPhraseLoading] = useState(false);
  const preparationPromisesRef = useRef(new Map<string, Promise<SavedWord>>());
  const glossCacheRef = useRef(new Map<string, AnnotationSummary>());
  const feedbackRequestIdRef = useRef(0);

  const word = sessionWords[index];
  const language = (word?.language as LanguageCode | undefined) ?? 'fr';
  const languageConfig = getLanguageConfig(language);
  const hasFrozenPhrase = Boolean(word && frozenPhrase?.wordId === word.id);
  const source = hasFrozenPhrase ? frozenPhrase?.source : undefined;
  const translation = hasFrozenPhrase ? frozenPhrase?.translation : undefined;
  const cloze = useMemo(
    () => (word ? buildCloze(source, word.surfaceForm) : null),
    [source, word],
  );
  const ruBold = useMemo(
    () => (
      word && translation
        ? boldRussian(translation, [word.translation, word.relatedTranslation])
        : null
    ),
    [translation, word],
  );
  const primaryProvider = word?.audioProvider ?? 'openai';
  const primaryPronunciation = useUnitPronunciation(language, primaryProvider);
  const openAiPronunciation = useUnitPronunciation(language, 'openai');
  const speechInput = useSpeechInput();

  const prepareAiPhrase = useCallback(
    async (candidate: SavedWord): Promise<SavedWord> => {
      if (candidate.practicePhrase || !candidate.contextSource || !onUpdateWord) return candidate;
      const existing = preparationPromisesRef.current.get(candidate.id);
      if (existing) return existing;

      const candidateLanguage = candidate.language as LanguageCode;
      const promise = fetchPracticePhrase(
        {
          surfaceForm: candidate.surfaceForm,
          translation: candidate.translation,
          contextSource: candidate.contextSource,
          contextTranslation: candidate.contextTranslation,
          level: candidate.level ?? 'A2',
        },
        candidateLanguage,
      ).then((phrase) => {
        const now = new Date().toISOString();
        return onUpdateWord({
          ...candidate,
          practicePhrase: {
            ...phrase,
            promptVersion: PRACTICE_PHRASE_PROMPT_VERSION,
            generatedAt: now,
          },
          updatedAt: now,
        });
      });
      preparationPromisesRef.current.set(candidate.id, promise);
      promise.catch(() => preparationPromisesRef.current.delete(candidate.id));
      return promise;
    },
    [onUpdateWord],
  );

  const preparedWordIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!word) return;
    let cancelled = false;
    // Only invalidate an in-flight feedback request when the card actually
    // changed. `word` gets a new object reference whenever persistVerdict's
    // replaceSessionWord refreshes review/updatedAt on the SAME card, which
    // must not cancel a feedback request already in flight for it.
    if (preparedWordIdRef.current !== word.id) {
      feedbackRequestIdRef.current += 1;
      preparedWordIdRef.current = word.id;
    }

    if (phraseMode === 'source') {
      const context = selectSourcePracticeContext(word, languageConfig.bcp47);
      setFrozenPhrase({ wordId: word.id, ...context });
      setPhraseStatus('idle');
      return;
    }

    if (word.practicePhrase) {
      setFrozenPhrase({
        wordId: word.id,
        source: word.practicePhrase.source,
        translation: word.practicePhrase.translation,
      });
      setPhraseStatus('idle');
      return;
    }

    setFrozenPhrase(null);
    setPhraseStatus('loading');
    prepareAiPhrase(word)
      .then((stored) => {
        if (cancelled) return;
        setSessionWords((current) => current.map((item) => (item.id === stored.id ? stored : item)));
        const context = stored.practicePhrase
          ? {
              source: stored.practicePhrase.source,
              translation: stored.practicePhrase.translation,
            }
          : selectSourcePracticeContext(stored, getLanguageConfig(stored.language as LanguageCode).bcp47);
        setFrozenPhrase({ wordId: stored.id, ...context });
        setPhraseStatus('idle');
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Не удалось подготовить AI-фразу:', error);
        const context = selectSourcePracticeContext(word, languageConfig.bcp47);
        setFrozenPhrase({ wordId: word.id, ...context });
        setPhraseStatus('idle');
      });

    return () => {
      cancelled = true;
    };
  }, [languageConfig.bcp47, phraseMode, prepareAiPhrase, word]);

  // AI-режим готовит следующую карточку в фоне, но текущая frozenPhrase от
  // этого никогда не меняется.
  useEffect(() => {
    if (phraseMode !== 'ai' || phraseStatus !== 'idle' || !frozenPhrase) return;
    const nextWord = sessionWords[index + 1];
    if (!nextWord || nextWord.practicePhrase) return;
    let cancelled = false;
    prepareAiPhrase(nextWord)
      .then((stored) => {
        if (cancelled) return;
        setSessionWords((current) => current.map((item) => (item.id === stored.id ? stored : item)));
      })
      .catch(() => {
        // Current session remains usable through the source fallback when the
        // prefetched word becomes active.
      });
    return () => {
      cancelled = true;
    };
  }, [frozenPhrase, index, phraseMode, phraseStatus, prepareAiPhrase, sessionWords]);

  useEffect(() => {
    if (!word) return;
    primaryPronunciation.prefetch(word.audioText ?? word.surfaceForm);
  }, [primaryPronunciation, word]);

  if (finished) {
    return (
      <TrainingSessionSummary
        outcomes={outcomes}
        onRepeatMistakes={() => {
          const mistakeIds = new Set(
            outcomes.filter((o) => o.verdict !== 'good').map((o) => o.wordId),
          );
          const mistakes = sessionWords.filter((item) => mistakeIds.has(item.id));
          if (mistakes.length > 0) restartWith(mistakes);
        }}
        onDone={onExit}
      />
    );
  }

  if (!word) {
    return (
      <div className="shell">
        <p className="empty-state">Слов для тренировки нет.</p>
        <Button variant="primary" onClick={onExit}>Назад</Button>
      </div>
    );
  }

  function replaceSessionWord(nextWord: SavedWord) {
    setSessionWords((current) => current.map((item) => (item.id === nextWord.id ? nextWord : item)));
  }

  // Перезапуск на подмножестве слов — «Повторить ошибки» с экрана итогов.
  // dueWordIds пересчитывается заново: у только что отвеченных слов dueAt уже
  // уехал в будущее, поэтому мини-сессия автоматически учебная и расписание
  // второй раз не трогает.
  function restartWith(nextWords: SavedWord[]) {
    setSessionWords(nextWords);
    setDueWordIds(new Set(nextWords.filter((item) => isDue(item)).map((item) => item.id)));
    setOutcomes([]);
    setFinished(false);
    setIndex(0);
    preparedWordIdRef.current = null;
    resetForNextCard(nextWords[0]);
  }

  function resetForNextCard(nextWord: SavedWord) {
    feedbackRequestIdRef.current += 1;
    speechInput.stop();
    setFrozenPhrase(availableFrozenPhrase(nextWord, phraseMode));
    setPhraseStatus(
      phraseMode === 'ai' && !nextWord.practicePhrase ? 'loading' : 'idle',
    );
    setInput('');
    setAnswerForResult('');
    setAnswered(false);
    setVerdict(null);
    setHintOpen(false);
    setHintUsed(false);
    setSrsLocked(false);
    setRetryAttempt(false);
    setReviewSaving(false);
    setReviewError(null);
    setReviewIntervalDays(null);
    setGloss(null);
    setFeedback(null);
    setAudioError(null);
  }

  function handleHintToggle() {
    if (answered) return;
    setGloss(null);
    setHintOpen((open) => !open);
    setHintUsed(true);
  }

  // Возвращает сохранённое слово, если расписание реально обновилось — итоги
  // сессии считают по этому, а не по вердикту: у слова не к повтору вердикт
  // есть, а записи расписания нет.
  async function persistVerdict(nextVerdict: ReviewVerdict): Promise<SavedWord | undefined> {
    if (!dueWordIds.has(word.id)) return undefined;
    const now = new Date();
    const nextReview = scheduleNext(word.review, nextVerdict, now);
    setReviewIntervalDays(nextReview.intervalDays);
    if (!onUpdateWord) return undefined;
    setReviewSaving(true);
    setReviewError(null);
    const nextWord: SavedWord = {
      ...word,
      review: nextReview,
      updatedAt: now.toISOString(),
    };
    try {
      const stored = await onUpdateWord(nextWord);
      replaceSessionWord(stored);
      return stored;
    } catch (error) {
      console.error('Не удалось сохранить результат тренировки:', error);
      setReviewError('Не удалось сохранить результат. Проверь соединение и повтори.');
      throw error;
    } finally {
      setReviewSaving(false);
    }
  }

  function requestFeedback(nextVerdict: ReviewVerdict, answer: string) {
    const trimmedAnswer = answer.trim();
    if (
      nextVerdict === 'good'
      || hintUsed
      || retryAttempt
      || !trimmedAnswer
      || !source
    ) {
      setFeedback(null);
      return;
    }

    const requestId = ++feedbackRequestIdRef.current;
    setFeedback({ status: 'loading' });
    fetchPracticeFeedback(
      {
        surfaceForm: word.surfaceForm,
        translation: word.translation,
        learnerAnswer: trimmedAnswer,
        source,
        sourceTranslation: translation,
        verdict: nextVerdict,
        level: word.level ?? 'A2',
      },
      language,
    )
      .then(({ explanation }) => {
        if (feedbackRequestIdRef.current !== requestId) return;
        setFeedback({ status: 'ready', explanation });
      })
      .catch((error) => {
        if (feedbackRequestIdRef.current !== requestId) return;
        console.error('Не удалось получить разбор ответа:', error);
        setFeedback({
          status: 'error',
          explanation: fallbackFeedback(nextVerdict, word.surfaceForm),
        });
      });
  }

  async function handleCheck() {
    if (answered || reviewSaving || speechInput.listening || phraseStatus === 'loading') return;
    const nextVerdict = classifyReviewAnswer(input, word.surfaceForm, hintUsed);
    setAnswerForResult(input);
    setAnswered(true);
    setVerdict(nextVerdict);
    setReviewError(null);
    setGloss(null);
    setHintOpen(false);
    requestFeedback(nextVerdict, input);

    // Итог записывается ровно один раз на слово — на той попытке, которая
    // засчитывается. «Попробовать ещё раз» учебный и итоги не меняет, ровно
    // как и расписание.
    if (!srsLocked) {
      setSrsLocked(true);
      const statusBefore = wordStatus(word);
      const stored = await persistVerdict(nextVerdict).catch(() => undefined);
      const statusAfter = stored ? wordStatus(stored) : statusBefore;
      setOutcomes((prev) => [
        ...prev,
        {
          wordId: word.id,
          surfaceForm: word.surfaceForm,
          translation: word.translation,
          verdict: nextVerdict,
          scheduleUpdated: Boolean(stored),
          promotedTo: statusAfter !== statusBefore ? statusAfter : null,
        },
      ]);
    }
  }

  function handleRetryAnswer() {
    feedbackRequestIdRef.current += 1;
    setRetryAttempt(true);
    setInput('');
    setAnswerForResult('');
    setAnswered(false);
    setVerdict(null);
    setHintOpen(false);
    setHintUsed(false);
    setGloss(null);
    setFeedback(null);
  }

  function goNext() {
    if (index + 1 >= sessionWords.length) {
      // Итоги вместо молчаливого выхода. Если ни одного ответа не было (все
      // слова пропустили) — показывать нечего, выходим сразу.
      if (outcomes.length === 0) onExit();
      else setFinished(true);
      return;
    }
    const nextIndex = index + 1;
    resetForNextCard(sessionWords[nextIndex]);
    setIndex(nextIndex);
  }

  function speakText(text: string) {
    setAudioError(null);
    primaryPronunciation.speak(text, () => {
      if (primaryProvider === 'elevenlabs') {
        openAiPronunciation.speak(text, () => setAudioError('Не удалось воспроизвести звук'));
      } else {
        setAudioError('Не удалось воспроизвести звук');
      }
    });
  }

  // «Проговори фразу целиком» в source-режиме — это предложение из урока
  // целиком, часто длиннее 80 символов (лимит /api/speak-unit — эндпоинт для
  // слова/фразы, не абзаца). Вместо нового TTS-вызова нарезаем уже готовую
  // дорожку урока по timestamps; на AI-фразу (которой в записи урока не было)
  // или на любую ошибку поиска сегмента — обычный speakText целиком.
  function speakFullPhrase() {
    if (!source) return;
    if (phraseMode !== 'source') {
      speakText(source);
      return;
    }
    setAudioError(null);
    setFullPhraseLoading(true);
    getSentenceAudioSegment(word)
      .then((segment) => (segment ? playAudioSegment(segment) : Promise.reject(new Error('no segment'))))
      .catch(() => {
        speakText(source);
      })
      .finally(() => setFullPhraseLoading(false));
  }

  async function handleTapWord(tapped: string) {
    if (!source || answered) return;
    setHintOpen(false);
    const cacheKey = `${language}|${source}|${tapped.toLocaleLowerCase()}`;
    const cached = glossCacheRef.current.get(cacheKey);
    if (cached) {
      setGloss({ status: 'ready', text: tapped, summary: cached });
      return;
    }

    setGloss({ status: 'loading', text: tapped });
    try {
      const sentence = tokenizeParagraphs([source], languageConfig.bcp47)[0]?.sentences[0];
      const target = sentence?.tokens.find(
        (token) => token.type === 'word'
          && token.text.toLocaleLowerCase() === tapped.toLocaleLowerCase(),
      );
      if (!sentence || !target) throw new Error('word token not found');
      const summary = await fetchAnnotationBasic(
        { tokenId: target.id, sentence },
        word.level ?? 'A2',
        language,
      );
      glossCacheRef.current.set(cacheKey, summary);
      setGloss({ status: 'ready', text: tapped, summary });
    } catch (error) {
      console.error(`Не удалось объяснить "${tapped}":`, error);
      setGloss({ status: 'error', text: tapped });
    }
  }

  const isSpeaking = (text: string) =>
    primaryPronunciation.isLoading(text) || openAiPronunciation.isLoading(text);
  const resultPresentation = verdict
    ? verdictPresentation(verdict, retryAttempt, hintUsed, answerForResult)
    : null;
  const deterministicResultText = hintUsed || !answerForResult.trim()
    ? 'Ответ показан — повторим слово позже.'
    : null;

  return (
    <div className="shell training-shell">
      <div className="training-top">
        <IconButton label="Завершить тренировку" className="training-exit-button" onClick={onExit}>
          <CloseIcon />
        </IconButton>
        <div className="training-progress-track" aria-label={`Упражнение ${index + 1} из ${sessionWords.length}`}>
          <div
            className="training-progress-fill"
            style={{ width: `${((index + 1) / sessionWords.length) * 100}%` }}
          />
        </div>
        <span className="training-progress-label">
          {index + 1}/{sessionWords.length}
        </span>
      </div>

      <div className="training-card">
        {phraseStatus === 'loading' ? (
          <div className="training-preparing" role="status" aria-live="polite">
            <div className="training-skeleton training-skeleton-short" />
            <div className="training-skeleton training-skeleton-long" />
            <p>Готовим упражнение</p>
          </div>
        ) : (
          <>
            {!answered && (
              <>
                {translation && (
                  <p className="training-ru-sentence">
                    {ruBold ? (
                      <>
                        {ruBold.before}
                        <b>{ruBold.bold}</b>
                        {ruBold.after}
                      </>
                    ) : (
                      translation
                    )}
                  </p>
                )}

                <p className="training-instruction">Вставь пропущенное слово</p>

                <div className="training-cloze">
                  {cloze ? (
                    <>
                      <ClozeWords text={cloze.before} onTapWord={handleTapWord} />
                      <TextInput
                        autoSize
                        measureValue={input || word.surfaceForm}
                        shellClassName="training-answer-shell"
                        className="training-answer-input"
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void handleCheck();
                        }}
                        aria-label={`Пропущенное слово: ${word.translation}`}
                        autoComplete="off"
                        autoFocus
                      />
                      <ClozeWords text={cloze.after} onTapWord={handleTapWord} />
                    </>
                  ) : (
                    <div className="training-fallback-input">
                      <span className="training-fallback-label">{word.translation}</span>
                      <TextInput
                        autoSize
                        measureValue={input || word.surfaceForm}
                        shellClassName="training-answer-shell"
                        className="training-answer-input"
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void handleCheck();
                        }}
                        aria-label={`Переведи: ${word.translation}`}
                        autoComplete="off"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {!answered && (
              <>
                {gloss && (
                  <div className="training-assistance-card training-gloss-card" role="status">
                    <div className="training-assistance-content">
                      {gloss.status === 'loading' && <span>Объясняем «{gloss.text}»…</span>}
                      {gloss.status === 'error' && <span>Не удалось объяснить «{gloss.text}».</span>}
                      {gloss.status === 'ready' && (
                        <span><b>{gloss.text}</b> — {gloss.summary.translation}</span>
                      )}
                    </div>
                    <div className="training-assistance-actions">
                      {gloss.status === 'ready' && (
                        <SpeakerButton
                          label={`Прослушать ${gloss.text}`}
                          loading={isSpeaking(gloss.summary.audioText)}
                          onClick={() => speakText(gloss.summary.audioText)}
                        />
                      )}
                      <IconButton label="Закрыть объяснение" onClick={() => setGloss(null)}>
                        <CloseIcon />
                      </IconButton>
                    </div>
                  </div>
                )}

                <Button
                  variant="ghost"
                  className="training-hint-toggle"
                  onClick={handleHintToggle}
                >
                  {hintOpen ? 'Скрыть подсказку' : 'Подсказка'}
                </Button>

                {hintOpen && (
                  <div className="training-assistance-card training-hint-card">
                    <div className="training-assistance-content">
                      <b>{word.surfaceForm}</b> — {word.translation}
                    </div>
                    <div className="training-assistance-actions">
                      <SpeakerButton
                        label={`Прослушать ${word.surfaceForm}`}
                        loading={isSpeaking(word.audioText ?? word.surfaceForm)}
                        onClick={() => speakText(word.audioText ?? word.surfaceForm)}
                      />
                    </div>
                  </div>
                )}

                <div className="training-action-row">
                  <Button
                    variant="primary"
                    size="lg"
                    className="training-check-btn"
                    disabled={speechInput.listening}
                    onClick={() => void handleCheck()}
                  >
                    Проверить
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    className={`training-voice-btn ${speechInput.listening ? 'is-listening' : ''}`}
                    disabled={!speechInput.supported}
                    aria-pressed={speechInput.listening}
                    title={speechInput.supported ? undefined : 'Голосовой ввод не поддерживается этим браузером'}
                    onClick={() => {
                      if (speechInput.listening) {
                        speechInput.stop();
                      } else {
                        speechInput.start(languageConfig.bcp47, setInput);
                      }
                    }}
                  >
                    {speechInput.listening ? <StopIcon /> : <MicrophoneIcon />}
                    {speechInput.listening ? 'Завершить' : 'Сказать ответ'}
                  </Button>
                </div>
                {speechInput.listening && (
                  <p className="training-voice-help" role="status">
                    Говорите — нажмите ещё раз, когда закончите
                  </p>
                )}
                {speechInput.error && <p className="training-inline-error">{speechInput.error}</p>}
                <Button variant="ghost" fullWidth className="training-skip-btn" onClick={goNext}>
                  Пропустить слово
                </Button>
              </>
            )}

            {answered && verdict && resultPresentation && (
              <div className="training-result-stack">
                <FeedbackPanel
                  tone={resultPresentation.tone}
                  title={resultPresentation.title}
                >
                  {deterministicResultText ? (
                    <p>{deterministicResultText}</p>
                  ) : verdict === 'good' ? (
                    <p>
                      {!dueWordIds.has(word.id)
                        ? 'Вне расписания — расписание не изменилось.'
                        : retryAttempt
                          ? 'Ответ исправлен. Расписание уже учло только первую попытку.'
                          : `Следующее повторение через ${reviewIntervalDays ?? 1} дн.`}
                    </p>
                  ) : feedback?.status === 'loading' ? (
                    <div className="training-feedback-loading" aria-label="Разбираем ответ">
                      <span />
                      <span />
                    </div>
                  ) : feedback?.status === 'ready' || feedback?.status === 'error' ? (
                    <p>{feedback.explanation}</p>
                  ) : (
                    <p>{fallbackFeedback(verdict, word.surfaceForm)}</p>
                  )}
                </FeedbackPanel>

                <section className="training-answer-comparison">
                  <div className="training-answer-row">
                    <span className="training-answer-label">Твой ответ</span>
                    <span className="training-answer-value">{answerForResult.trim() || '—'}</span>
                  </div>
                  <div className="training-answer-row training-correct-row">
                    <span className="training-answer-label">Правильно</span>
                    <div className="training-answer-with-action">
                      <span className="training-answer-value">{word.surfaceForm}</span>
                      <SpeakerButton
                        label={`Прослушать ${word.surfaceForm}`}
                        loading={isSpeaking(word.audioText ?? word.surfaceForm)}
                        onClick={() => speakText(word.audioText ?? word.surfaceForm)}
                      />
                    </div>
                  </div>
                  {source && (
                    <div className="training-full-phrase">
                      <div>
                        <span className="training-answer-label">Проговори фразу целиком</span>
                        <p>{source}</p>
                      </div>
                      <SpeakerButton
                        label="Прослушать фразу целиком"
                        loading={fullPhraseLoading || isSpeaking(source)}
                        onClick={speakFullPhrase}
                      />
                    </div>
                  )}
                </section>

                {reviewSaving && <p className="training-save-status">Сохраняем расписание…</p>}
                {reviewError && (
                  <div className="training-save-error">
                    <span>{reviewError}</span>
                    <button type="button" onClick={() => void persistVerdict(verdict)}>
                      Повторить сохранение
                    </button>
                  </div>
                )}

                {(verdict === 'almost' || verdict === 'again') && !retryAttempt && (
                  <Button
                    variant="secondary"
                    size="lg"
                    fullWidth
                    className="training-retry-btn"
                    onClick={handleRetryAnswer}
                  >
                    Попробовать ещё раз
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  className="training-next-btn"
                  onClick={goNext}
                  disabled={reviewSaving || !!reviewError}
                >
                  Дальше →
                </Button>
              </div>
            )}

            {audioError && <p className="training-inline-error">{audioError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
