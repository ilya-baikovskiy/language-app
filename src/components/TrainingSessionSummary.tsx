// Экран итогов тренировки — см. docs/training-plan/LEARN_SECTION_PLAN.md
// (этап B) и мокап 07-session-summary.html. Показывается после последней
// карточки вместо молчаливого выхода в хаб.
//
// Никакой геймификации по решению пользователя: только факты сессии. «Верно»
// считает ровно точные попадания — «почти» стоит отдельной цифрой, чтобы
// счёт не льстил.

import type { ReviewVerdict, WordStatus } from '../content-system/srs';
import { Button } from './ui/controls';

export type SessionOutcome = {
  wordId: string;
  surfaceForm: string;
  translation: string;
  verdict: ReviewVerdict;
  // Расписание реально записано (слово было к повтору и запись прошла) — не то
  // же самое, что «есть вердикт».
  scheduleUpdated: boolean;
  // Статус, в который слово перешло именно этой сессией, иначе null.
  promotedTo: WordStatus | null;
};

const STATUS_LABELS: Record<WordStatus, string> = {
  new: 'Новое',
  learning: 'Учу',
  known: 'Знаю',
};

const VERDICT_MARKS: Record<ReviewVerdict, { mark: string; tone: 'good' | 'warn' | 'bad'; label: string }> = {
  good: { mark: '✓', tone: 'good', label: 'верно' },
  almost: { mark: '≈', tone: 'warn', label: 'почти' },
  again: { mark: '✕', tone: 'bad', label: 'не совсем' },
};

function pluralWords(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'слова';
  return 'слов';
}

type Props = {
  outcomes: SessionOutcome[];
  onRepeatMistakes: () => void;
  onDone: () => void;
};

export function TrainingSessionSummary({ outcomes, onRepeatMistakes, onDone }: Props) {
  const total = outcomes.length;
  const good = outcomes.filter((o) => o.verdict === 'good').length;
  const almost = outcomes.filter((o) => o.verdict === 'almost').length;
  const again = outcomes.filter((o) => o.verdict === 'again').length;
  const mistakes = almost + again;
  const scheduled = outcomes.filter((o) => o.scheduleUpdated).length;

  return (
    <div className="shell training-shell">
      <section className="training-card training-summary">
        <header className="training-summary-head">
          <p className="training-summary-kicker">Сессия завершена</p>
          {scheduled === 0 && (
            <p className="training-summary-badge">Вне расписания — прогресс не менялся</p>
          )}
          <p className="training-summary-score">
            <b>{good}</b> из {total} верно
          </p>
          <div className="training-summary-chips">
            <span className="training-vchip is-good">✓ {good}</span>
            {almost > 0 && <span className="training-vchip is-warn">≈ {almost}</span>}
            {again > 0 && <span className="training-vchip is-bad">✕ {again}</span>}
          </div>
          {scheduled > 0 && (
            <p className="training-summary-scheduled">
              {scheduled === total
                ? 'Расписание обновлено для всех слов сессии'
                : `Расписание обновлено для ${scheduled} ${pluralWords(scheduled)} из ${total}`}
            </p>
          )}
        </header>

        <ul className="training-summary-list">
          {outcomes.map((outcome) => {
            const verdict = VERDICT_MARKS[outcome.verdict];
            return (
              <li key={outcome.wordId} className="training-summary-row">
                <span className="training-summary-word">
                  <span className="training-summary-target">{outcome.surfaceForm}</span>
                  <span className="training-summary-translation">{outcome.translation}</span>
                </span>
                <span className="training-summary-meta">
                  {outcome.promotedTo && (
                    <span className="training-summary-promote">→ {STATUS_LABELS[outcome.promotedTo]}</span>
                  )}
                  <span
                    className={`training-summary-verdict is-${verdict.tone}`}
                    role="img"
                    aria-label={verdict.label}
                  >
                    {verdict.mark}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        {mistakes > 0 && (
          <Button variant="primary" size="lg" fullWidth onClick={onRepeatMistakes}>
            Повторить ошибки ({mistakes})
          </Button>
        )}
        <Button fullWidth className="training-summary-done" onClick={onDone}>
          Готово
        </Button>
      </section>
    </div>
  );
}
