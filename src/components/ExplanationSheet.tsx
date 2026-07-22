import { useEffect, useRef, useState } from 'react';
import type { SheetSelection } from '../hooks/useSelectedAnnotation';
import type { Annotation, BreakdownPart, FormPair } from '../types/lesson';
import { ExampleList } from './ExampleList';

type SpeakFn = (text: string, onError?: (error: Error) => void, contextText?: string) => void;
type IsLoadingFn = (text: string) => boolean;

type Props = {
  selection: SheetSelection | null;
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  // Предложение целиком — нарезка дорожки урока (там коартикуляция уместна и
  // ожидаема на слух).
  onSpeak: SpeakFn;
  // Слово/фраза/форма — отдельный TTS-клип (useUnitPronunciation), не нарезка:
  // нарезка на границах слов резала звук (découvrir звучало как couvrir), а для
  // текста, которого в уроке нет дословно (формы, разбор фразы по частям), её
  // вообще не существовало — там раньше была кнопка-заглушка с тостом.
  onSpeakUnit: SpeakFn;
  isUnitLoading: IsLoadingFn;
  onRetry: () => void;
  onLoadDetails: () => void;
  onRetryDetails: () => void;
  isSaved: boolean;
  onToggleSave: () => void;
};

// Раздел 6.4 и 11 ТЗ. Контент не размонтируется при закрытии (иначе во время
// анимации сворачивания панель на миг станет пустой) — только isOpen переключает
// видимость через CSS-класс.
//
// Двухтировый контент (CLAUDE.md/PROGRESS.md): Уровень 1 (базовое — что значит
// ЗДЕСЬ, без грамматических терминов) виден сразу; грамматика и формы (тир 2)
// прячутся за «Подробнее» и догружаются лениво (onLoadDetails).
export function ExplanationSheet({
  selection,
  isOpen,
  onClose,
  onContinue,
  onSpeak,
  onSpeakUnit,
  isUnitLoading,
  onRetry,
  onLoadDetails,
  onRetryDetails,
  isSaved,
  onToggleSave,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const annotationId = selection?.kind === 'annotation' ? selection.annotation.id : null;

  // Смена слова/фразы — сбрасываем локальное «Подробнее» и тост, чтобы новая
  // панель открывалась в свёрнутом виде.
  useEffect(() => {
    setExpanded(false);
    setToast(null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, [annotationId]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }

  // И клип (onSpeakUnit), и нарезка дорожки (onSpeak) могут не получиться —
  // сеть/квота у клипа, текст не нашёлся в уроке у нарезки. Один тост на оба
  // случая, чтобы не ронять весь плеер в состояние ошибки.
  const showPlaybackErrorToast = () => showToast('Не удалось воспроизвести звук');

  function handleMore() {
    setExpanded(true);
    onLoadDetails();
  }

  return (
    <>
      <div className={`sheet-overlay${isOpen ? ' is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <div
        className={`sheet${isOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Объяснение слова"
      >
        <div className="sheet-panel">
          <div className="sheet-scroll">
            <div className="sheet-handle" />

            {selection?.kind === 'annotation' && (
              <AnnotationView
                selection={selection}
                onClose={onClose}
                onSpeak={onSpeak}
                onSpeakUnit={onSpeakUnit}
                isUnitLoading={isUnitLoading}
                onPlaybackError={showPlaybackErrorToast}
                expanded={expanded}
                onMore={handleMore}
                onRetryDetails={onRetryDetails}
              />
            )}

            {selection?.kind === 'loading' && (
              <>
                <div className="sheet-top">
                  <div className="sheet-head-row">
                    <div className="sheet-head">{selection.displayText}</div>
                  </div>
                  <CloseButton onClose={onClose} />
                </div>

                <hr className="sheet-divider" />

                <div className="sheet-body sheet-loading" role="status" aria-live="polite">
                  <span className="sheet-loading-spinner" aria-hidden="true">
                    <SpinnerIcon />
                  </span>
                  <p>Готовим объяснение…</p>
                </div>
              </>
            )}

            {selection?.kind === 'error' && (
              <>
                <div className="sheet-top">
                  <div className="sheet-head-row">
                    <div className="sheet-head">{selection.displayText}</div>
                  </div>
                  <CloseButton onClose={onClose} />
                </div>

                <hr className="sheet-divider" />

                <div className="sheet-body">
                  <p className="fallback-note">Не удалось загрузить объяснение — попробуй ещё раз.</p>
                  <button className="act-btn" type="button" onClick={onRetry}>
                    Повторить
                  </button>
                </div>
              </>
            )}

            {selection?.kind === 'fallback' && (
              <>
                <div className="sheet-top">
                  <div className="sheet-head-row">
                    <div className="sheet-head">{selection.word}</div>
                    <UnitSpeakerButton
                      text={selection.word}
                      contextText={selection.sentenceText}
                      onSpeakUnit={onSpeakUnit}
                      isUnitLoading={isUnitLoading}
                      onPlaybackError={showPlaybackErrorToast}
                      label="Прослушать"
                    />
                  </div>
                  <CloseButton onClose={onClose} />
                </div>

                <hr className="sheet-divider" />

                <div className="sheet-body">
                  <p>Встречается в предложении: «{selection.sentenceText}»</p>
                  <p className="fallback-note">Подробное объяснение пока не добавлено.</p>
                </div>
              </>
            )}
          </div>

          {toast && (
            <div className="sheet-toast" role="status" aria-live="polite">
              {toast}
            </div>
          )}

          <div className="sheet-footer">
            <button className="act-btn primary" type="button" onClick={onContinue}>
              Продолжить отсюда
            </button>
            {selection?.kind === 'annotation' && (
              <button
                className={`act-btn save${isSaved ? ' is-saved' : ''}`}
                type="button"
                aria-pressed={isSaved}
                onClick={onToggleSave}
              >
                <BookmarkIcon filled={isSaved} />
                {isSaved ? 'Сохранено' : 'Сохранить'}
              </button>
            )}
            {selection && (
              <button className="act-btn ghost" type="button">
                ✦ Спросить AI · скоро
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

type AnnotationViewProps = {
  selection: Extract<SheetSelection, { kind: 'annotation' }>;
  onClose: () => void;
  onSpeak: SpeakFn;
  onSpeakUnit: SpeakFn;
  isUnitLoading: IsLoadingFn;
  onPlaybackError: () => void;
  expanded: boolean;
  onMore: () => void;
  onRetryDetails: () => void;
};

function AnnotationView({
  selection,
  onClose,
  onSpeak,
  onSpeakUnit,
  isUnitLoading,
  onPlaybackError,
  expanded,
  onMore,
  onRetryDetails,
}: AnnotationViewProps) {
  const a = selection.annotation;
  const unitLabel = getUnitLabel(a);

  return (
    <>
      <div className="sheet-top">
        <div>
          <div className="sheet-head-row">
            <div className="sheet-head">{a.displayText}</div>
            <UnitSpeakerButton
              text={a.displayText}
              contextText={selection.sentenceText}
              onSpeakUnit={onSpeakUnit}
              isUnitLoading={isUnitLoading}
              onPlaybackError={onPlaybackError}
              label="Прослушать"
            />
            <span className="sheet-unit-label">{unitLabel}</span>
          </div>
          {a.pronunciation && <p className="sheet-pron">{a.pronunciation}</p>}
        </div>
        <CloseButton onClose={onClose} />
      </div>

      {/* Старые аннотации без baseForm показывают lemma-строку как запасной вариант. */}
      {!a.baseForm && (
        <p className="sheet-lemma">
          от <b>{a.lemma}</b>
          {a.partOfSpeech && <span className="sheet-tag">{a.partOfSpeech}</span>}
        </p>
      )}

      <p className="sheet-translation">{a.shortTranslation}</p>

      <hr className="sheet-divider" />

      <div className="sheet-body">
        <div className="sheet-section-row">
          <p className="sheet-section-title">В этом предложении</p>
          <button
            className="icon-btn-sm"
            type="button"
            aria-label="Прослушать предложение"
            onClick={() => onSpeak(selection.sentenceText, onPlaybackError)}
          >
            <SpeakerIcon />
          </button>
        </div>
        <p className="sheet-sentence">{highlightTarget(selection.sentenceText, a.displayText)}</p>
        <p>{a.contextualMeaning}</p>
      </div>

      {(a.baseForm || a.formInText) && (
        <div className="sheet-body sheet-forms">
          {a.baseForm && (
            <FormLine label="Базовая форма" pair={a.baseForm} onSpeakUnit={onSpeakUnit} isUnitLoading={isUnitLoading} onPlaybackError={onPlaybackError} />
          )}
          {a.formInText && (
            <FormLine label="Форма в тексте" pair={a.formInText} onSpeakUnit={onSpeakUnit} isUnitLoading={isUnitLoading} onPlaybackError={onPlaybackError} />
          )}
        </div>
      )}

      {a.type === 'phrase' && a.beginnerBreakdown && a.beginnerBreakdown.length > 0 && (
        <div className="sheet-body">
          <p className="sheet-section-title">Разберём по частям</p>
          {a.beginnerBreakdown.map((part: BreakdownPart) => (
            <div className="breakdown-part" key={part.text}>
              <div className="breakdown-part-head">
                <span className="fr">{part.text}</span>
                <UnitSpeakerButton
                  text={part.text}
                  onSpeakUnit={onSpeakUnit}
                  isUnitLoading={isUnitLoading}
                  onPlaybackError={onPlaybackError}
                  label={`Прослушать ${part.text}`}
                />
              </div>
              <div className="ru">{part.meaning}</div>
              {part.note && <div className="breakdown-note">{part.note}</div>}
            </div>
          ))}
        </div>
      )}

      {a.type === 'phrase' && a.wholePhrase && (
        <div className="sheet-body">
          <p className="sheet-section-title">Вся фраза</p>
          <div className="whole-phrase">
            <div className="whole-phrase-head">
              <span className="fr">{a.wholePhrase.text}</span>
              <UnitSpeakerButton
                text={a.wholePhrase.text}
                onSpeakUnit={onSpeakUnit}
                isUnitLoading={isUnitLoading}
                onPlaybackError={onPlaybackError}
                label="Прослушать фразу"
              />
            </div>
            <div className="ru">{a.wholePhrase.meaning}</div>
          </div>
        </div>
      )}

      {a.plainLearningNote && (
        <div className="sheet-body">
          <p className="sheet-note">{a.plainLearningNote}</p>
        </div>
      )}

      {!expanded && (
        <button className="sheet-more-toggle" type="button" onClick={onMore}>
          Подробнее про грамматику и формы
        </button>
      )}

      {expanded && (
        <DetailsView
          selection={selection}
          onSpeakUnit={onSpeakUnit}
          isUnitLoading={isUnitLoading}
          onPlaybackError={onPlaybackError}
          onRetryDetails={onRetryDetails}
        />
      )}
    </>
  );
}

function DetailsView({
  selection,
  onSpeakUnit,
  isUnitLoading,
  onPlaybackError,
  onRetryDetails,
}: {
  selection: Extract<SheetSelection, { kind: 'annotation' }>;
  onSpeakUnit: SpeakFn;
  isUnitLoading: IsLoadingFn;
  onPlaybackError: () => void;
  onRetryDetails: () => void;
}) {
  const a = selection.annotation;

  if (selection.detailsStatus === 'loading') {
    return (
      <div className="sheet-body sheet-loading" role="status" aria-live="polite">
        <span className="sheet-loading-spinner" aria-hidden="true">
          <SpinnerIcon />
        </span>
        <p>Готовим грамматику…</p>
      </div>
    );
  }

  if (selection.detailsStatus === 'error') {
    return (
      <div className="sheet-body">
        <p className="fallback-note">Не удалось загрузить детали — попробуй ещё раз.</p>
        <button className="act-btn" type="button" onClick={onRetryDetails}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <>
      {(a.grammarLabel || a.grammarSummary) && (
        <div className="sheet-body">
          <div className="sheet-section-row">
            <p className="sheet-section-title">Грамматика</p>
            {a.grammarLabel && <span className="sheet-tag">{a.grammarLabel}</span>}
          </div>
          {a.grammarSummary && <p>{a.grammarSummary}</p>}
          {a.grammarDetails && <p className="sheet-note">{a.grammarDetails}</p>}
        </div>
      )}

      {a.constructionExplanation && (
        <div className="sheet-body">
          <p className="sheet-section-title">Конструкция</p>
          <p>{a.constructionExplanation}</p>
        </div>
      )}

      {a.formVariants && a.formVariants.items.length > 0 && (
        <div className="sheet-body">
          <p className="sheet-section-title">{a.formVariants.title}</p>
          {a.formVariants.items.map((variant) => (
            <div className={`form-variant${variant.isCurrent ? ' is-current' : ''}`} key={variant.text}>
              <div className="form-variant-head">
                <span className="fr">{variant.text}</span>
                <UnitSpeakerButton
                  text={variant.text}
                  onSpeakUnit={onSpeakUnit}
                  isUnitLoading={isUnitLoading}
                  onPlaybackError={onPlaybackError}
                  label={`Прослушать ${variant.text}`}
                />
              </div>
              <div className="ru">
                {variant.meaning}
                {variant.note && <span className="form-variant-note"> · {variant.note}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <ExampleList examples={a.examples} />

      {a.otherMeanings && a.otherMeanings.length > 0 && (
        <div className="sheet-body">
          <p className="sheet-section-title">Другие значения</p>
          {a.otherMeanings.map((meaning) => (
            <p key={meaning.translation}>{meaning.translation}</p>
          ))}
        </div>
      )}
    </>
  );
}

function FormLine({
  label,
  pair,
  onSpeakUnit,
  isUnitLoading,
  onPlaybackError,
}: {
  label: string;
  pair: FormPair;
  onSpeakUnit: SpeakFn;
  isUnitLoading: IsLoadingFn;
  onPlaybackError: () => void;
}) {
  return (
    <div className="form-line">
      <div className="form-line-top">
        <span className="form-line-label">{label}</span>
        <span className="fr">{pair.text}</span>
        <UnitSpeakerButton
          text={pair.text}
          onSpeakUnit={onSpeakUnit}
          isUnitLoading={isUnitLoading}
          onPlaybackError={onPlaybackError}
          label={`Прослушать ${pair.text}`}
        />
      </div>
      <div className="ru">{pair.meaning}</div>
    </div>
  );
}

// Кнопка озвучки слова/фразы/формы — клип через useUnitPronunciation
// (см. Props.onSpeakUnit), с индикацией загрузки на время первого запроса
// (повторные клики по тому же тексту берут кэш на сервере и почти мгновенны).
function UnitSpeakerButton({
  text,
  contextText,
  onSpeakUnit,
  isUnitLoading,
  onPlaybackError,
  label,
}: {
  text: string;
  contextText?: string;
  onSpeakUnit: SpeakFn;
  isUnitLoading: IsLoadingFn;
  onPlaybackError: () => void;
  label: string;
}) {
  const loading = isUnitLoading(text);
  return (
    <button
      className={`icon-btn-sm${loading ? ' is-loading' : ''}`}
      type="button"
      aria-label={label}
      aria-busy={loading}
      disabled={loading}
      onClick={() => onSpeakUnit(text, onPlaybackError, contextText)}
    >
      <SpeakerIcon />
    </button>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button className="sheet-close" type="button" aria-label="Закрыть" onClick={onClose}>
      <CloseIcon />
    </button>
  );
}

// Ярлык единицы: фраза / форма слова / отдельное слово.
function getUnitLabel(a: Annotation): string {
  if (a.type === 'phrase') return 'Фраза';
  if (a.baseForm && a.baseForm.text !== a.displayText) return 'Форма слова';
  return 'Слово';
}

// Подсветка целевого фрагмента внутри французского предложения: первое
// вхождение displayText (без учёта регистра) оборачивается в <mark>. Если не
// нашли (напр. форма в тексте отличается) — предложение показывается как есть.
function highlightTarget(sentence: string, target: string) {
  const idx = sentence.toLowerCase().indexOf(target.toLowerCase());
  if (idx === -1) return sentence;
  const before = sentence.slice(0, idx);
  const match = sentence.slice(idx, idx + target.length);
  const after = sentence.slice(idx + target.length);
  return (
    <>
      {before}
      <mark className="sheet-target">{match}</mark>
      {after}
    </>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="40 100" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16.5 8.5a5 5 0 010 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}>
      <path
        d="M6 4h12v16l-6-4-6 4V4z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
