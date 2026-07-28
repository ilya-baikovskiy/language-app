// Экран практики — каркас без логики (см. PROGRESS.md, 2026-07-28: сначала
// вёрстка по утверждённым артефактам docs/training-plan/03-cloze-practice-screen.html,
// SM-2/AI-шаг короткой фразы/голос/реальный тап-по-слову — отдельным шагом).
//
// Фраза для клоуза — вариант C из docs/training-plan/02-phrase-source-variants.html
// (предложение как в уроке, целиком, без AI-сокращения) — временно, до
// отдельной задачи на AI-переписывание в короткую естественную фразу.
import { useMemo, useState } from 'react';
import type { SavedWord } from '../content-system/savedWord';
import { findWordAlignedIndex } from '../lib/wordAlign';

type Props = {
  words: SavedWord[];
  onExit: () => void;
};

type Verdict = 'good' | 'bad' | 'hinted';

// Слово/пунктуация/пробел раздельно — не искажает исходные пробелы при рендере.
function tokenize(text: string): string[] {
  return text.match(/[\p{L}\p{M}'’-]+|\s+|[^\s]/gu) ?? [];
}
const WORD_TOKEN = /[\p{L}\p{M}]/u;

function buildCloze(word: SavedWord): { before: string; blank: string; after: string } | null {
  if (!word.contextSource) return null;
  const idx = findWordAlignedIndex(word.contextSource, word.surfaceForm);
  if (idx === -1) return null;
  return {
    before: word.contextSource.slice(0, idx),
    blank: word.contextSource.slice(idx, idx + word.surfaceForm.length),
    after: word.contextSource.slice(idx + word.surfaceForm.length),
  };
}

// Честная попытка выделить перевод целевого слова в русском предложении —
// не подсвечиваем, если реально не нашли (для слов закрытого класса
// translation — грамматическая пометка, не перевод, там пробуем
// relatedTranslation; если и это не нашлось, просто показываем перевод как
// есть, без выдуманного жирного слова).
function boldRussian(contextTranslation: string, candidates: (string | null | undefined)[]): { before: string; bold: string; after: string } | null {
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

function ClozeWords({ text, onTapWord }: { text: string; onTapWord: (w: string) => void }) {
  const tokens = useMemo(() => tokenize(text), [text]);
  return (
    <>
      {tokens.map((t, i) =>
        WORD_TOKEN.test(t) ? (
          <span key={i} className="cw" onClick={() => onTapWord(t)}>
            {t}
          </span>
        ) : (
          <span key={i}>{t}</span>
        ),
      )}
    </>
  );
}

export function TrainingPracticeView({ words, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [answered, setAnswered] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [tappedWord, setTappedWord] = useState<string | null>(null);

  const word = words[index];
  const cloze = useMemo(() => (word ? buildCloze(word) : null), [word]);
  const ruBold = useMemo(
    () => (word?.contextTranslation ? boldRussian(word.contextTranslation, [word.translation, word.relatedTranslation]) : null),
    [word],
  );

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

  function resetForNextCard() {
    setInput('');
    setAnswered(false);
    setVerdict(null);
    setHintOpen(false);
    setHintUsed(false);
    setTappedWord(null);
  }

  function handleHintToggle() {
    if (answered) return;
    setHintOpen((open) => !open);
    setHintUsed(true); // необратимо для этой попытки, даже если снова спрятать
  }

  function handleCheck() {
    if (answered || !input.trim()) return;
    setAnswered(true);
    // Сверка строки — сравнение точь-в-точь с сохранённой формой слова.
    // Настоящую SRS-оценку (repetitions/easeFactor/lapses) сюда пока не
    // подключаем, см. docs/training-plan/04-srs-verdict-mapping.html.
    if (hintUsed) {
      setVerdict('hinted');
    } else if (input.trim().toLowerCase() === word.surfaceForm.toLowerCase()) {
      setVerdict('good');
    } else {
      setVerdict('bad');
    }
  }

  function handleSkip() {
    // Каркас: просто следующая карточка в этом же проходе. Финальное
    // поведение («откладывается на следующую сессию практики целиком») —
    // см. PROGRESS.md — реализуется вместе с SM-2, не здесь.
    goNext();
  }

  function goNext() {
    if (index + 1 >= words.length) {
      onExit();
      return;
    }
    setIndex((i) => i + 1);
    resetForNextCard();
  }

  return (
    <div className="shell training-shell">
      <div className="training-top">
        <button className="icon-btn" type="button" aria-label="Назад" onClick={onExit}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="training-progress-track">
          <div className="training-progress-fill" style={{ width: `${(index / words.length) * 100}%` }} />
        </div>
        <span className="training-progress-label">
          {index + 1}/{words.length}
        </span>
      </div>

      <div className="training-card">
        {word.contextTranslation && (
          <p className="training-ru-sentence">
            {ruBold ? (
              <>
                {ruBold.before}
                <b>{ruBold.bold}</b>
                {ruBold.after}
              </>
            ) : (
              word.contextTranslation
            )}
          </p>
        )}

        <p className="training-eyebrow">Впиши пропущенное слово</p>

        <p className="training-cloze">
          {cloze ? (
            <>
              <ClozeWords text={cloze.before} onTapWord={setTappedWord} />
              <input
                className="training-blank"
                value={input}
                disabled={answered}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !answered && input.trim()) handleCheck();
                }}
                placeholder="?"
                autoComplete="off"
                autoFocus
              />
              <ClozeWords text={cloze.after} onTapWord={setTappedWord} />
            </>
          ) : (
            // Не нашли слово в сохранённом предложении дословно — честный
            // запасной вариант без клоуза, просто просим перевести само слово.
            <span>{word.contextSource ?? word.surfaceForm}</span>
          )}
        </p>

        {tappedWord && (
          <div className="training-gloss-pop">
            <span>
              <b>{tappedWord}</b> — перевод и озвучка появятся здесь (отдельная задача, см. PROGRESS.md)
            </span>
            <button className="training-gloss-close" type="button" onClick={() => setTappedWord(null)} aria-label="Закрыть">
              ✕
            </button>
          </div>
        )}

        <button className={`training-hint-toggle ${hintOpen ? 'is-open' : ''}`} type="button" onClick={handleHintToggle} disabled={answered}>
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
          </div>
        )}

        {!answered && (
          <div className="training-action-row">
            <button className="btn primary training-check-btn" type="button" onClick={handleCheck} disabled={!input.trim()}>
              Проверить
            </button>
            <button className="btn training-voice-btn" type="button" disabled title="Голосовой ввод — отдельная задача">
              Голос
            </button>
          </div>
        )}
        {!answered && (
          <button className="training-skip-btn" type="button" onClick={handleSkip}>
            Пропустить это слово
          </button>
        )}

        {answered && verdict && (
          <>
            <div className={`training-verdict training-verdict-${verdict === 'good' ? 'good' : 'bad'}`}>
              <p className="training-verdict-head">
                {verdict === 'good' ? '✓ Верно!' : verdict === 'hinted' ? '~ Подсказка была открыта' : '✕ Не совсем'}
              </p>
              <p className="training-verdict-body">
                {verdict === 'good'
                  ? 'Форма слова совпала.'
                  : verdict === 'hinted'
                    ? 'Засчитано как «не помню» — подсказка была раскрыта в этой попытке.'
                    : `Ожидалось «${word.surfaceForm}» — сверься с фразой целиком ниже.`}
              </p>
            </div>
            {word.contextSource && (
              <div className="training-say-aloud">
                <p className="training-say-aloud-label">Проговори фразу целиком</p>
                <p className="training-say-aloud-text">{word.contextSource}</p>
              </div>
            )}
            <button className="btn primary training-next-btn" type="button" onClick={goNext}>
              Дальше →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
