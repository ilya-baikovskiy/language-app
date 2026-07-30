import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { SheetSelection } from '../hooks/useSelectedAnnotation';
import type { Annotation, DetailSection } from '../types/lesson';
import { findWordAlignedIndex } from '../lib/wordAlign';
import { SpeakerButton } from './ui/controls';

type SpeakFn = (text: string, onError?: (error: Error) => void, contextText?: string) => void;
type IsLoadingFn = (text: string) => boolean;

type Props = {
  selection: SheetSelection | null;
  isOpen: boolean;
  onClose: () => void;
  // Необязательные — «Продолжить отсюда» и сохранение имеют смысл только в
  // ридере. Раздел «Учить» переиспользует этот же шит для карточки
  // сохранённого слова (см. LearnWordCard.tsx) и передаёт вместо них свой
  // футер: там слово уже сохранено, а продолжать чтение неоткуда.
  onContinue?: () => void;
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
  isSaved?: boolean;
  onToggleSave?: () => void;
  // Подключаемая строка действий: если передана, полностью заменяет
  // стандартный футер «сохранить + продолжить отсюда».
  footer?: ReactNode;
  // Блок под разбором, внутри той же прокрутки — сюда «Учить» кладёт статус,
  // прогресс и свои действия.
  children?: ReactNode;
};

// Bottom Sheet v2 (см. AI_PIPELINE.md, greek-bottom-sheet-handoff/). Контент не
// размонтируется при закрытии (иначе во время анимации сворачивания панель на
// миг станет пустой) — только isOpen переключает видимость через CSS-класс.
//
// Двухтировый контент: короткое summary (что значит ЗДЕСЬ, без грамматических
// терминов) виден сразу; типизированные секции details (тир 2) прячутся за
// «Подробнее» и догружаются лениво (onLoadDetails).
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
  footer,
  children,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const annotationId = selection?.kind === 'annotation' ? selection.annotation.id : null;

  // Смена слова — сбрасываем локальное «Подробнее» и тост, чтобы новая панель
  // открывалась в свёрнутом виде (раздел 2 хэндоффа, п.6).
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

            {selection?.kind === 'annotation' && children}

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
          </div>

          {toast && (
            <div className="sheet-toast" role="status" aria-live="polite">
              {toast}
            </div>
          )}

          {/* Футер эталона — ровно два элемента: сохранение иконкой слева и
              широкое основное действие справа. Раздел «Учить» подменяет его
              целиком через проп footer. */}
          {footer ?? (
            <div className="sheet-footer">
              {selection?.kind === 'annotation' && onToggleSave && (
                <button
                  className={`act-btn icon-only save${isSaved ? ' is-saved' : ''}`}
                  type="button"
                  aria-pressed={isSaved}
                  aria-label={isSaved ? 'Убрать из сохранённого' : 'Сохранить слово'}
                  onClick={onToggleSave}
                >
                  <BookmarkIcon filled={Boolean(isSaved)} />
                </button>
              )}
              {onContinue && (
                <button className="act-btn primary wide" type="button" onClick={onContinue}>
                  Продолжить отсюда
                </button>
              )}
            </div>
          )}
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
  const { summary } = selection.annotation;
  const { context } = summary;

  return (
    <>
      <div className="sheet-top">
        <div>
          {summary.partOfSpeech && <p className="sheet-pos">{summary.partOfSpeech}</p>}
          <div className="sheet-head-row">
            <div className="sheet-head">{summary.displayForm}</div>
            <UnitSpeakerButton
              text={summary.audioText}
              contextText={selection.sentenceText}
              onSpeakUnit={onSpeakUnit}
              isUnitLoading={isUnitLoading}
              onPlaybackError={onPlaybackError}
              label={`Прослушать ${summary.audioText}`}
            />
          </div>
        </div>
        <CloseButton onClose={onClose} />
      </div>

      <p className="sheet-translation">{summary.translation}</p>

      {summary.hint && (
        <div className="sheet-hint">
          <p className="sheet-hint-label">{summary.hint.label}</p>
          <p className="sheet-hint-row">
            <span className="foreign">{summary.hint.source}</span>
            <span className="sheet-hint-arrow" aria-hidden="true">
              →
            </span>
            <span className="native">{summary.hint.translation}</span>
          </p>
        </div>
      )}

      <hr className="sheet-divider" />

      <div className="sheet-body">
        {/* Кнопка стоит вплотную к заголовку, а не улетает к правому краю:
            прижатая к краю она читалась как отдельный плавающий элемент,
            не связанный с блоком контекста. */}
        <div className="sheet-section-row">
          <p className="sheet-section-title">В контексте</p>
          <SpeakerButton
            label="Прослушать предложение"
            onClick={() => onSpeak(context.source, onPlaybackError)}
          />
        </div>
        <div className="sheet-context-card">
          <p className="sheet-sentence">{highlightContext(context.source, context.selectedSource, context.relatedSource)}</p>
          <p className="sheet-context-translation">
            {highlightContext(context.translation, context.selectedTranslation, context.relatedTranslation)}
          </p>
        </div>
      </div>

      {!expanded && (
        <button className="sheet-more-toggle" type="button" aria-expanded={false} onClick={onMore}>
          <span className="sheet-more-text">
            <span className="sheet-more-title">Подробнее</span>
            <span className="sheet-more-sub">объяснение, формы и грамматика</span>
          </span>
          <ChevronDownIcon />
        </button>
      )}

      {expanded && (
        <DetailsView
          annotation={selection.annotation}
          detailsStatus={selection.detailsStatus}
          onRetryDetails={onRetryDetails}
        />
      )}
    </>
  );
}

function DetailsView({
  annotation,
  detailsStatus,
  onRetryDetails,
}: {
  annotation: Annotation;
  detailsStatus: Extract<SheetSelection, { kind: 'annotation' }>['detailsStatus'];
  onRetryDetails: () => void;
}) {
  if (detailsStatus === 'loading') {
    return (
      <div className="sheet-body sheet-loading" role="status" aria-live="polite">
        <span className="sheet-loading-spinner" aria-hidden="true">
          <SpinnerIcon />
        </span>
        <p>Готовим подробности…</p>
      </div>
    );
  }

  if (detailsStatus === 'error') {
    return (
      <div className="sheet-body">
        <p className="fallback-note">Не удалось загрузить детали — попробуй ещё раз.</p>
        <button className="act-btn" type="button" onClick={onRetryDetails}>
          Повторить
        </button>
      </div>
    );
  }

  const sections = annotation.details?.sections ?? [];

  return (
    <>
      {sections.map((section, index) => (
        <DetailSectionView key={index} section={section} />
      ))}
    </>
  );
}

function DetailSectionView({ section }: { section: DetailSection }) {
  if (section.type === 'explanation') {
    return (
      <div className="sheet-body">
        {section.title && <p className="sheet-section-title">{section.title}</p>}
        <p>{section.body}</p>
      </div>
    );
  }

  // Шапки колонок нет намеренно: в эталоне первая ячейка строки сама работает
  // ярлыком («я», «сейчас / обычно», «вопрос»), отдельной строки заголовков нет.
  if (section.type === 'table') {
    return (
      <div className="sheet-body">
        {section.title && <p className="sheet-section-title">{section.title}</p>}
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <tbody>
              {section.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className={ci === 0 ? 'sheet-table-label' : undefined}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {section.note && <p className="sheet-table-note">{section.note}</p>}
      </div>
    );
  }

  if (section.type === 'bilingualPairs') {
    return (
      <div className="sheet-body">
        {section.title && <p className="sheet-section-title">{section.title}</p>}
        {section.pairs.map((pair, i) => (
          <div className="bilingual-pair" key={i}>
            <div className="foreign">{pair.source}</div>
            <div className="native">
              {pair.translation}
              {pair.note && <span className="bilingual-pair-note"> · {pair.note}</span>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // grammarNote — закрывающая реплика обычным абзацем, без плашки.
  return (
    <div className="sheet-body">
      <p className="sheet-note">{section.body}</p>
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
    <SpeakerButton
      label={label}
      loading={loading}
      onClick={() => onSpeakUnit(text, onPlaybackError, contextText)}
    />
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button className="sheet-close" type="button" aria-label="Закрыть" onClick={onClose}>
      <CloseIcon />
    </button>
  );
}

// Первое вхождение target, НЕ являющееся куском более длинного слова.
// Наивный indexOf здесь давал реальный баг: перевод «в» у предлога στην
// подсвечивался внутри «ресторано[в]». \b не годится — он ASCII-only, а тут
// греческий и кириллица; поэтому границы проверяем через \p{L}/\p{N} вручную.
// Подсветка первого вхождения target внутри text (без учёта регистра, по
// границам слова). Если не нашли — текст показывается как есть.
function highlightTarget(text: string, target: string): ReactNode {
  const idx = findWordAlignedIndex(text, target);
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + target.length);
  const after = text.slice(idx + target.length);
  return (
    <>
      {before}
      <mark className="sheet-target">{match}</mark>
      {after}
    </>
  );
}

// Двухтировая подсветка для «В контексте» (раздел 3 хэндоффа): если есть
// related — выбранное слово получает свой акцентный блок, а остаток фразы
// (слово, с которым оно грамматически связано) — отдельный мягкий серый блок;
// между ними сохраняется обычный пробел, чтобы они читались как два разных
// слова, а не один слитный кусок. Без related — просто акцентный highlight
// выбранного слова, как highlightTarget.
function highlightContext(text: string, selected: string, related?: string | null): ReactNode {
  if (!related) return highlightTarget(text, selected);

  const idx = findWordAlignedIndex(text, related);
  if (idx === -1) return highlightTarget(text, selected);

  const before = text.slice(0, idx);
  const relatedMatch = text.slice(idx, idx + related.length);
  const after = text.slice(idx + related.length);

  const selIdx = findWordAlignedIndex(relatedMatch, selected);
  if (selIdx === -1) {
    return (
      <>
        {before}
        <span className="sheet-related-inline">{relatedMatch}</span>
        {after}
      </>
    );
  }

  const relBefore = relatedMatch.slice(0, selIdx);
  const relSelected = relatedMatch.slice(selIdx, selIdx + selected.length);
  const relAfter = relatedMatch.slice(selIdx + selected.length);

  // Пробел между словами остаётся снаружи блоков — иначе серый фон и акцент
  // сливаются в одну сплошную плашку без видимого зазора между словами.
  const relBeforeTrimmed = relBefore.trimEnd();
  const relBeforeGap = relBefore.slice(relBeforeTrimmed.length);
  const relAfterGapMatch = relAfter.match(/^\s*/);
  const relAfterGap = relAfterGapMatch ? relAfterGapMatch[0] : '';
  const relAfterTrimmed = relAfter.slice(relAfterGap.length);

  return (
    <>
      {before}
      {relBeforeTrimmed && <span className="sheet-related-inline">{relBeforeTrimmed}</span>}
      {relBeforeGap}
      <mark className="sheet-target">{relSelected}</mark>
      {relAfterGap}
      {relAfterTrimmed && <span className="sheet-related-inline">{relAfterTrimmed}</span>}
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

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
