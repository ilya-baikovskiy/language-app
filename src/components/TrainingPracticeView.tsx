import { useEffect, useMemo, useRef, useState } from 'react';
import { classifyReviewAnswer, scheduleNext, type ReviewVerdict } from '../content-system/srs';
import {
  PRACTICE_PHRASE_PROMPT_VERSION,
  type SavedWord,
} from '../content-system/savedWord';
import { useSpeechInput } from '../hooks/useSpeechInput';
import { useUnitPronunciation } from '../hooks/useUnitPronunciation';
import { findWordAlignedIndex } from '../lib/wordAlign';
import { fetchAnnotationBasic, fetchPracticePhrase } from '../services/generation/lessonsApi';
import { getLanguageConfig, type LanguageCode } from '../../lib/pipeline/languageConfig';
import { tokenizeParagraphs } from '../../lib/pipeline/tokenize';
import type { AnnotationSummary } from '../types/lesson';

type Props = {
  words: SavedWord[];
  onExit: () => void;
  onUpdateWord?: (word: SavedWord) => Promise<SavedWord>;
};

type Cloze = { before: string; blank: string; after: string };
type GlossState =
  | { status: 'loading'; text: string }
  | { status: 'ready'; text: string; summary: AnnotationSummary }
  | { status: 'error'; text: string };

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
  candidates: (string | null | undefined)[],
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
          <button key={index} className="cw" type="button" onClick={() => onTapWord(token)}>
            {token}
          </button>
        ) : (
          <span key={index}>{token}</span>
        ),
      )}
    </>
  );
}

function verdictTitle(verdict: ReviewVerdict, retry: boolean): string {
  if (verdict === 'good') return retry ? '✓ Теперь верно!' : '✓ Верно!';
  if (verdict === 'almost') return '~ Почти';
  return '✕ Не совсем';
}

export function TrainingPracticeView({ words, onExit, onUpdateWord }: Props) {
  const [sessionWords, setSessionWords] = useState(words);
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [answered, setAnswered] = useState(false);
  const [verdict, setVerdict] = useState<ReviewVerdict | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [srsLocked, setSrsLocked] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewIntervalDays, setReviewIntervalDays] = useState<number | null>(null);
  const [phraseStatus, setPhraseStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [gloss, setGloss] = useState<GlossState | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const preparedWordIdsRef = useRef(new Set<string>());
  const glossCacheRef = useRef(new Map<string, AnnotationSummary>());

  const word = sessionWords[index];
  const language = (word?.language as LanguageCode | undefined) ?? 'fr';
  const languageConfig = getLanguageConfig(language);
  const source = word?.practicePhrase?.source ?? word?.contextSource;
  const translation = word?.practicePhrase?.translation ?? word?.contextTranslation;
  const cloze = useMemo(() => (word ? buildCloze(source, word.surfaceForm) : null), [source, word]);
  const ruBold = useMemo(
    () => (word && translation ? boldRussian(translation, [word.translation, word.relatedTranslation]) : null),
    [translation, word],
  );
  const primaryProvider = word?.audioProvider ?? 'openai';
  const primaryPronunciation = useUnitPronunciation(language, primaryProvider);
  const openAiPronunciation = useUnitPronunciation(language, 'openai');
  const speechInput = useSpeechInput();

  useEffect(() => {
    if (!word || word.practicePhrase || !word.contextSource || !onUpdateWord) {
      setPhraseStatus('idle');
      return;
    }
    if (preparedWordIdsRef.current.has(word.id)) return;
    preparedWordIdsRef.current.add(word.id);
    let cancelled = false;
    setPhraseStatus('loading');

    fetchPracticePhrase(
      {
        surfaceForm: word.surfaceForm,
        translation: word.translation,
        contextSource: word.contextSource,
        contextTranslation: word.contextTranslation,
        level: word.level ?? 'A2',
      },
      language,
    )
      .then((phrase) => {
        const now = new Date().toISOString();
        return onUpdateWord({
          ...word,
          practicePhrase: {
            ...phrase,
            promptVersion: PRACTICE_PHRASE_PROMPT_VERSION,
            generatedAt: now,
          },
          updatedAt: now,
        });
      })
      .then((stored) => {
        if (cancelled) return;
        setSessionWords((current) => current.map((item) => (item.id === stored.id ? stored : item)));
        setPhraseStatus('idle');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Не удалось подготовить короткую фразу:', err);
        setPhraseStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [language, onUpdateWord, word]);

  useEffect(() => {
    if (!word) return;
    primaryPronunciation.prefetch(word.audioText ?? word.surfaceForm);
  }, [primaryPronunciation, word]);

  if (!word) {
    return (
      <div className="shell">
        <p className="empty-state">Слов для тренировки нет.</p>
        <button className="btn primary" type="button" onClick={onExit}>
          Назад
        </button>
      </div>
    );
  }

  function replaceSessionWord(nextWord: SavedWord) {
    setSessionWords((current) => current.map((item) => (item.id === nextWord.id ? nextWord : item)));
  }

  function resetForNextCard() {
    setInput('');
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
    setAudioError(null);
  }

  function handleHintToggle() {
    if (answered) return;
    setHintOpen((open) => !open);
    setHintUsed(true);
  }

  async function persistVerdict(nextVerdict: ReviewVerdict) {
    const now = new Date();
    const nextReview = scheduleNext(word.review, nextVerdict, now);
    setReviewIntervalDays(nextReview.intervalDays);
    if (!onUpdateWord) return;
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
    } catch (err) {
      console.error('Не удалось сохранить результат тренировки:', err);
      setReviewError('Не удалось сохранить результат. Проверь соединение и повтори.');
      throw err;
    } finally {
      setReviewSaving(false);
    }
  }

  async function handleCheck() {
    if (answered || reviewSaving) return;
    const nextVerdict = classifyReviewAnswer(input, word.surfaceForm, hintUsed);
    setAnswered(true);
    setVerdict(nextVerdict);
    setReviewError(null);

    if (!srsLocked) {
      setSrsLocked(true);
      await persistVerdict(nextVerdict).catch(() => {});
    }
  }

  function handleRetryAnswer() {
    setRetryAttempt(true);
    setInput('');
    setAnswered(false);
    setVerdict(null);
    setHintOpen(false);
    setHintUsed(false);
  }

  function handleSkip() {
    goNext();
  }

  function goNext() {
    if (index + 1 >= sessionWords.length) {
      onExit();
      return;
    }
    setIndex((current) => current + 1);
    resetForNextCard();
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

  async function handleTapWord(tapped: string) {
    const sentenceText = source;
    if (!sentenceText) return;
    const cacheKey = `${language}|${sentenceText}|${tapped.toLocaleLowerCase()}`;
    const cached = glossCacheRef.current.get(cacheKey);
    if (cached) {
      setGloss({ status: 'ready', text: tapped, summary: cached });
      return;
    }

    setGloss({ status: 'loading', text: tapped });
    try {
      const sentence = tokenizeParagraphs([sentenceText], languageConfig.bcp47)[0]?.sentences[0];
      const target = sentence?.tokens.find(
        (token) => token.type === 'word' && token.text.toLocaleLowerCase() === tapped.toLocaleLowerCase(),
      );
      if (!sentence || !target) throw new Error('word token not found');
      const summary = await fetchAnnotationBasic(
        { tokenId: target.id, sentence },
        word.level ?? 'A2',
        language,
      );
      glossCacheRef.current.set(cacheKey, summary);
      setGloss({ status: 'ready', text: tapped, summary });
    } catch (err) {
      console.error(`Не удалось объяснить "${tapped}":`, err);
      setGloss({ status: 'error', text: tapped });
    }
  }

  const isSpeaking = (text: string) =>
    primaryPronunciation.isLoading(text) || openAiPronunciation.isLoading(text);

  return (
    <div className="shell training-shell">
      <div className="training-top">
        <button className="icon-btn" type="button" aria-label="Назад" onClick={onExit}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="training-progress-track">
          <div className="training-progress-fill" style={{ width: `${((index + 1) / sessionWords.length) * 100}%` }} />
        </div>
        <span className="training-progress-label">
          {index + 1}/{sessionWords.length}
        </span>
      </div>

      <div className="training-card">
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

        <div className="training-eyebrow-row">
          <p className="training-eyebrow">Впиши пропущенное слово</p>
          {phraseStatus === 'loading' && <span className="training-phrase-status">Готовим короткую фразу…</span>}
          {phraseStatus === 'error' && <span className="training-phrase-status">Используем исходную фразу</span>}
        </div>

        <p className="training-cloze">
          {cloze ? (
            <>
              <ClozeWords text={cloze.before} onTapWord={handleTapWord} />
              <input
                className="training-blank"
                value={input}
                disabled={answered}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !answered) void handleCheck();
                }}
                placeholder="?"
                autoComplete="off"
                autoFocus
              />
              <ClozeWords text={cloze.after} onTapWord={handleTapWord} />
            </>
          ) : (
            <>
              <span className="training-fallback-label">{word.translation}: </span>
              <input
                className="training-blank"
                value={input}
                disabled={answered}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !answered) void handleCheck();
                }}
                placeholder="?"
                autoComplete="off"
                autoFocus
              />
            </>
          )}
        </p>

        {gloss && (
          <div className="training-gloss-pop" role="status">
            {gloss.status === 'loading' && <span>Готовим объяснение для «{gloss.text}»…</span>}
            {gloss.status === 'error' && <span>Не удалось объяснить «{gloss.text}».</span>}
            {gloss.status === 'ready' && (
              <span>
                <b>{gloss.text}</b> — {gloss.summary.translation}
              </span>
            )}
            {gloss.status === 'ready' && (
              <button
                className="training-mini-speaker"
                type="button"
                onClick={() => speakText(gloss.summary.audioText)}
                aria-label={`Прослушать ${gloss.text}`}
                disabled={isSpeaking(gloss.summary.audioText)}
              >
                {isSpeaking(gloss.summary.audioText) ? '…' : '🔊'}
              </button>
            )}
            <button className="training-gloss-close" type="button" onClick={() => setGloss(null)} aria-label="Закрыть">
              ✕
            </button>
          </div>
        )}

        <button
          className={`training-hint-toggle ${hintOpen ? 'is-open' : ''}`}
          type="button"
          onClick={handleHintToggle}
          disabled={answered}
        >
          {hintOpen ? 'Скрыть подсказку' : 'Подсказка (раскрыть слово)'}
        </button>
        {hintUsed && !answered && (
          <p className="training-hint-cost">Уже засчитано как «не помню» для этой попытки — прятать/показывать можно свободно</p>
        )}
        {hintOpen && (
          <div className="training-hint-box">
            <span>
              <b>{word.surfaceForm}</b> — {word.translation}
            </span>
            <button
              className="training-mini-speaker"
              type="button"
              onClick={() => speakText(word.audioText ?? word.surfaceForm)}
              aria-label={`Прослушать ${word.surfaceForm}`}
              disabled={isSpeaking(word.audioText ?? word.surfaceForm)}
            >
              {isSpeaking(word.audioText ?? word.surfaceForm) ? '…' : '🔊'}
            </button>
          </div>
        )}

        {!answered && (
          <>
            <div className="training-action-row">
              <button className="btn primary training-check-btn" type="button" onClick={() => void handleCheck()}>
                Проверить
              </button>
              <button
                className={`btn training-voice-btn ${speechInput.listening ? 'is-listening' : ''}`}
                type="button"
                disabled={!speechInput.supported}
                title={speechInput.supported ? 'Продиктовать ответ' : 'Голосовой ввод не поддерживается этим браузером'}
                onClick={() => {
                  if (speechInput.listening) {
                    speechInput.stop();
                  } else {
                    speechInput.start(languageConfig.bcp47, setInput);
                  }
                }}
              >
                {speechInput.listening ? 'Слушаю…' : 'Голос'}
              </button>
            </div>
            {speechInput.error && <p className="training-inline-error">{speechInput.error}</p>}
            <button className="training-skip-btn" type="button" onClick={handleSkip}>
              Пропустить это слово
            </button>
          </>
        )}

        {answered && verdict && (
          <>
            <div className={`training-verdict training-verdict-${verdict}`}>
              <p className="training-verdict-head">{verdictTitle(verdict, retryAttempt)}</p>
              <p className="training-verdict-body">
                {verdict === 'good'
                  ? retryAttempt
                    ? 'Ответ исправлен. Расписание уже учло только первую попытку.'
                    : `Следующее повторение через ${reviewIntervalDays ?? 1} дн.`
                  : verdict === 'almost'
                    ? `Слово похоже, но форма не совпала с «${word.surfaceForm}».`
                    : hintUsed
                      ? 'Засчитано как «не помню» — подсказка была раскрыта в этой попытке.'
                      : `Ожидалось «${word.surfaceForm}».`}
              </p>
            </div>

            {reviewSaving && <p className="training-save-status">Сохраняем расписание…</p>}
            {reviewError && (
              <div className="training-save-error">
                <span>{reviewError}</span>
                <button type="button" onClick={() => void persistVerdict(verdict)}>
                  Повторить сохранение
                </button>
              </div>
            )}

            {source && (
              <div className="training-say-aloud">
                <div>
                  <p className="training-say-aloud-label">Проговори фразу целиком</p>
                  <p className="training-say-aloud-text">{source}</p>
                </div>
                <button
                  className="training-mini-speaker"
                  type="button"
                  onClick={() => speakText(source)}
                  aria-label="Прослушать фразу целиком"
                  disabled={isSpeaking(source)}
                >
                  {isSpeaking(source) ? '…' : '🔊'}
                </button>
              </div>
            )}

            {(verdict === 'almost' || verdict === 'again') && !retryAttempt && (
              <button className="btn training-retry-btn" type="button" onClick={handleRetryAnswer}>
                Попробовать ещё раз
              </button>
            )}
            <button
              className="btn primary training-next-btn"
              type="button"
              onClick={goNext}
              disabled={reviewSaving || !!reviewError}
            >
              Дальше →
            </button>
          </>
        )}

        {audioError && <p className="training-inline-error">{audioError}</p>}
      </div>
    </div>
  );
}
