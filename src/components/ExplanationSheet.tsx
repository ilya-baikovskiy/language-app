import { useEffect, useRef, useState } from 'react';
import type { SheetSelection } from '../hooks/useSelectedAnnotation';
import type { Annotation, BreakdownPart, FormPair } from '../types/lesson';
import { ExampleList } from './ExampleList';

type Props = {
  selection: SheetSelection | null;
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  onSpeak: (text: string, onError?: (error: Error) => void, contextText?: string) => void;
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
// прячутся за «Подробнее» и догружаются лениво (onLoadDetails). Реальная озвучка
// (onSpeak, дорожка урока) — только у заголовка и предложения; у сгенерированных
// строк (формы, примеры) её в аудиодорожке нет, поэтому там кнопка-стаб с тостом.
export function ExplanationSheet({
  selection,
  isOpen,
  onClose,
  onContinue,
  onSpeak,
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

  const showStubToast = () => showToast('Озвучивание будет добавлено позже');
  // Реальная озвучка (заголовок/предложение) может не найтись в аудиодорожке
  // урока (см. onError у narration.speakSelection) — показываем тост вместо
  // того, чтобы ронять весь плеер в состояние ошибки.
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
                onStub={showStubToast}
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
                    <button
                      className="icon-btn-sm"
                      type="button"
                      aria-label="Прослушать"
                      onClick={() => onSpeak(selection.word, showPlaybackErrorToast, selection.sentenceText)}
                    >
                      <SpeakerIcon />
                    </button>
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
  onSpeak: (text: string, onError?: (error: Error) => void, contextText?: string) => void;
  onStub: () => void;
  onPlaybackError: () => void;
  expanded: boolean;
  onMore: () => void;
  onRetryDetails: () => void;
};

function AnnotationView({
  selection,
  onClose,
  onSpeak,
  onStub,
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
            <button
              className="icon-btn-sm"
              type="button"
              aria-label="Прослушать"
              onClick={() => onSpeak(a.displayText, onPlaybackError, selection.sentenceText)}
            >
              <SpeakerIcon />
            </button>
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
          {a.baseForm && <FormLine label="Базовая форма" pair={a.baseForm} onStub={onStub} />}
          {a.formInText && <FormLine label="Форма в тексте" pair={a.formInText} onStub={onStub} />}
        </div>
      )}

      {a.type === 'phrase' && a.beginnerBreakdown && a.beginnerBreakdown.length > 0 && (
        <div className="sheet-body">
          <p className="sheet-section-title">Разберём по частям</p>
          {a.beginnerBreakdown.map((part: BreakdownPart) => (
            <div className="breakdown-part" key={part.text}>
              <div className="breakdown-part-head">
                <span className="fr">{part.text}</span>
                <StubSpeakerButton onStub={onStub} label={`Прослушать ${part.text}`} />
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
              <StubSpeakerButton onStub={onStub} label="Прослушать фразу" />
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

      {expanded && <DetailsView selection={selection} onStub={onStub} onRetryDetails={onRetryDetails} />}
    </>
  );
}

function DetailsView({
  selection,
  onStub,
  onRetryDetails,
}: {
  selection: Extract<SheetSelection, { kind: 'annotation' }>;
  onStub: () => void;
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
                <StubSpeakerButton onStub={onStub} label={`Прослушать ${variant.text}`} />
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

function FormLine({ label, pair, onStub }: { label: string; pair: FormPair; onStub: () => void }) {
  return (
    <div className="form-line">
      <div className="form-line-top">
        <span className="form-line-label">{label}</span>
        <span className="fr">{pair.text}</span>
        <StubSpeakerButton onStub={onStub} label={`Прослушать ${pair.text}`} />
      </div>
      <div className="ru">{pair.meaning}</div>
    </div>
  );
}

// Кнопка озвучки для сгенерированных строк, которых нет в аудиодорожке урока:
// вместо реального воспроизведения показывает тост-заглушку.
function StubSpeakerButton({ onStub, label }: { onStub: () => void; label: string }) {
  return (
    <button className="icon-btn-sm is-stub" type="button" aria-label={label} onClick={onStub}>
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
