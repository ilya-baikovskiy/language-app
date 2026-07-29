// Экран «Учить» — хаб раздела, см. docs/training-plan/LEARN_SECTION_PLAN.md
// (этап A) и мокап 05-learn-hub.html. Показывает только слова activeLanguage.
//
// useSavedWords (см. hooks/useSavedWords.ts) хранит language прямо на
// SavedWord — фильтр по activeLanguage прямой, без join через
// lessonId → languageCode, который был нужен старому useSavedUnits.
import { useEffect, useMemo, useState } from 'react';
import { useSavedWords } from '../hooks/useSavedWords';
import { TrainingPracticeView } from './TrainingPracticeView';
import {
  isDue,
  isLeech,
  isNewWord,
  selectPracticeQueue,
  wordStatus,
  type WordStatus,
} from '../content-system/srs';
import type { SavedWord } from '../content-system/savedWord';
import type { TrainingPhraseMode } from '../content-system/userTypes';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';
import { Button } from './ui/controls';

type Props = {
  activeLanguage: LanguageCode;
  trainingPhraseMode: TrainingPhraseMode;
};

type PracticeSession = {
  words: SavedWord[];
  phraseMode: TrainingPhraseMode;
};

// 'all' — не статус, а «фильтр выключен», поэтому отдельным значением, а не
// частью WordStatus.
type StatusFilter = 'all' | WordStatus;

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'Все',
  new: 'Новые',
  learning: 'Учу',
  known: 'Знаю',
};

const FILTER_ORDER: StatusFilter[] = ['all', 'new', 'learning', 'known'];

// Порция для «+5 новых слов» на пустой очереди — жест «хочу ещё чуть», а не
// смена дневной нормы (та живёт в настройках, см. этап D плана).
const EXTRA_NEW_WORDS = 5;

function formatDue(word: SavedWord, now: Date): string {
  const due = new Date(word.review.dueAt);
  if (due.getTime() <= now.getTime()) return 'сегодня';

  // Разница в календарных днях, а не в миллисекундах: «завтра» должно
  // означать следующую дату, а не «через 24 часа».
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const days = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);

  if (days <= 1) return 'завтра';
  if (days <= 7) return `через ${days} дн.`;
  return due.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function nextReviewHint(words: SavedWord[], now: Date): string | null {
  const upcoming = words
    .filter((word) => !isDue(word, now))
    .sort((a, b) => a.review.dueAt.localeCompare(b.review.dueAt));
  if (upcoming.length === 0) return null;

  const soonest = upcoming[0];
  const when = formatDue(soonest, now);
  const sameDay = upcoming.filter(
    (word) => new Date(word.review.dueAt).toDateString() === new Date(soonest.review.dueAt).toDateString(),
  ).length;
  return `Ближайший повтор — ${when}, ${sameDay} ${pluralWords(sameDay)}.`;
}

function pluralWords(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'слово';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'слова';
  return 'слов';
}

export function LearnPage({ activeLanguage, trainingPhraseMode }: Props) {
  const { savedWords, loading, updateWord } = useSavedWords();
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');

  // Одна временная точка на все производные значения: иначе счётчики, даты и
  // очередь могут разъехаться на границе суток. Обновляется при перезагрузке
  // списка слов — держать её в состоянии дешевле, чем пересоздавать Date на
  // каждый рендер и тем самым инвалидировать все useMemo ниже.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(new Date());
  }, [savedWords]);

  const languageWords = useMemo(
    () => savedWords.filter((word) => word.language === activeLanguage),
    [savedWords, activeLanguage],
  );
  const dueWords = useMemo(() => selectPracticeQueue(languageWords, now), [languageWords, now]);

  const counts = useMemo(() => {
    const byStatus: Record<StatusFilter, number> = { all: languageWords.length, new: 0, learning: 0, known: 0 };
    for (const word of languageWords) byStatus[wordStatus(word)] += 1;
    return byStatus;
  }, [languageWords]);

  const visibleWords = useMemo(() => {
    const matching = filter === 'all' ? languageWords : languageWords.filter((word) => wordStatus(word) === filter);
    // Сортировка по ближайшему повтору: то, что нужно сегодня, наверху.
    return [...matching].sort((a, b) => a.review.dueAt.localeCompare(b.review.dueAt));
  }, [languageWords, filter]);

  const untouchedNew = useMemo(
    () => languageWords.filter(isNewWord).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [languageWords],
  );

  function startSession(words: SavedWord[]) {
    if (words.length === 0) return;
    setPracticeSession({ words, phraseMode: trainingPhraseMode });
  }

  if (practiceSession) {
    return (
      <TrainingPracticeView
        words={practiceSession.words}
        phraseMode={practiceSession.phraseMode}
        onExit={() => setPracticeSession(null)}
        onUpdateWord={updateWord}
      />
    );
  }

  const newInQueue = dueWords.filter(isNewWord).length;
  const queueEmpty = dueWords.length === 0;
  // Сколько из отфильтрованных реально обновят расписание — тренировка решает
  // это пословно, поэтому кнопка не должна обещать больше, чем произойдёт.
  const dueInFilter = visibleWords.filter((word) => isDue(word, now)).length;

  return (
    <div className="shell">
      <h1 className="shell-title">Учить</h1>

      {loading ? (
        <div className="learn-today">
          <p className="learn-today-count">Загружаем слова…</p>
        </div>
      ) : queueEmpty && languageWords.length > 0 ? (
        <div className="learn-today-block">
          <p className="learn-today-count">
            <span className="learn-done-check" aria-hidden="true">✓</span> На сегодня всё
          </p>
          <p className="learn-today-hint">
            {nextReviewHint(languageWords, now) ?? 'Новых повторов пока не запланировано.'}
          </p>
          {untouchedNew.length > 0 && (
            <Button fullWidth onClick={() => startSession(untouchedNew.slice(0, EXTRA_NEW_WORDS))}>
              +{Math.min(EXTRA_NEW_WORDS, untouchedNew.length)} новых{' '}
              {pluralWords(Math.min(EXTRA_NEW_WORDS, untouchedNew.length))}
            </Button>
          )}
          <Button fullWidth onClick={() => startSession([...languageWords])}>
            Повторить без расписания
          </Button>
        </div>
      ) : (
        <div className="learn-today">
          <div className="learn-today-text">
            <p className="learn-today-count">{dueWords.length} на сегодня</p>
            <p className="learn-today-hint">
              {newInQueue > 0 && `из них новых: ${newInQueue} · `}
              всего сохранено {languageWords.length}
            </p>
          </div>
          <Button variant="primary" disabled={queueEmpty} onClick={() => startSession([...dueWords])}>
            Начать
          </Button>
        </div>
      )}

      {!loading && languageWords.length === 0 ? (
        <p className="empty-state">
          Пока нет сохранённых слов и фраз для этого языка — сохраняй их прямо из чтения, нажимая на слово.
        </p>
      ) : (
        !loading && (
          <>
            <div className="learn-filters" role="group" aria-label="Фильтр по статусу">
              {FILTER_ORDER.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`learn-chip ${filter === value ? 'is-active' : ''}`}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {value !== 'all' && <span className={`learn-dot is-${value}`} aria-hidden="true" />}
                  {FILTER_LABELS[value]} <span className="learn-chip-count">{counts[value]}</span>
                </button>
              ))}
            </div>

            {filter !== 'all' && visibleWords.length > 0 && (
              <div className="learn-filter-action">
                <Button onClick={() => startSession([...visibleWords])}>
                  Тренировать ({visibleWords.length})
                </Button>
                <p className="learn-filter-note">
                  {dueInFilter === 0
                    ? 'Ни одно не к повтору — расписание не изменится'
                    : dueInFilter === visibleWords.length
                      ? 'Все к повтору — расписание обновится'
                      : `К повтору ${dueInFilter} из ${visibleWords.length} — расписание обновится только у них`}
                </p>
              </div>
            )}

            <ul className="learn-saved-list">
              {visibleWords.map((word) => {
                const status = wordStatus(word);
                const due = isDue(word, now);
                return (
                  <li key={word.id} className="learn-saved-item">
                    <span className="learn-saved-main">
                      <span className="learn-saved-target">{word.surfaceForm}</span>
                      <span className="learn-saved-translation">{word.translation}</span>
                    </span>
                    <span className="learn-saved-meta">
                      {isLeech(word) && <span className="learn-badge-hard">сложное</span>}
                      <span className={due ? 'learn-due-now' : undefined}>{formatDue(word, now)}</span>
                      <span
                        className={`learn-dot is-${status}`}
                        title={FILTER_LABELS[status]}
                        aria-label={FILTER_LABELS[status]}
                        role="img"
                      />
                    </span>
                  </li>
                );
              })}
            </ul>

            {visibleWords.length === 0 && (
              <p className="empty-state">В этой группе пока нет слов.</p>
            )}
          </>
        )
      )}
    </div>
  );
}
