// @vitest-environment jsdom
//
// Этап C плана: карточка слова переиспользует ExplanationSheet ридера.
// Главное, что проверяем — разбор собирается ИЗ СОХРАНЁННОГО СЛОВА, без
// загрузки урока, и специфичные для «Учить» статус/прогресс/действия
// появляются под ним.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearnWordCard } from '../LearnWordCard';
import type { SavedWord } from '../../content-system/savedWord';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeWord(overrides: Partial<SavedWord> = {}): SavedWord {
  const now = new Date().toISOString();
  return {
    id: 'lesson-1:t1',
    userId: 'local-user',
    language: 'el',
    level: 'A2',
    surfaceForm: 'κατασκευή',
    partOfSpeech: 'существительное',
    translation: 'конструкция',
    audioText: 'κατασκευή',
    contextSource: 'Η κατασκευή τους βοηθά επίσης στην προστασία από τον δυνατό άνεμο.',
    contextTranslation: 'Их конструкция также помогает защититься от сильного ветра.',
    relatedSource: null,
    relatedTranslation: null,
    lessonId: 'lesson-1',
    tokenId: 't1',
    review: { easeFactor: 2.5, intervalDays: 0, repetitions: 0, dueAt: now, lapses: 0 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function noopProps() {
  return {
    onClose: vi.fn(),
    onTrain: vi.fn(),
    onUpdateWord: vi.fn(async (word: SavedWord) => word),
    onDelete: vi.fn(),
  };
}

describe('LearnWordCard', () => {
  it('рисует разбор из сохранённого слова, не загружая урок', () => {
    const fetchSpy = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const { container } = render(<LearnWordCard word={makeWord()} {...noopProps()} />);

    expect(container.querySelector('.sheet-pos')?.textContent).toBe('существительное');
    expect(container.querySelector('.sheet-head')?.textContent).toBe('κατασκευή');
    expect(container.querySelector('.sheet-translation')?.textContent).toBe('конструкция');
    expect(container.querySelector('.sheet-sentence')?.textContent).toContain('βοηθά επίσης');
    // Ни одного сетевого запроса при открытии: ни за уроком, ни за аннотацией.
    expect(fetchSpy.mock.calls.filter(([url]) => String(url).includes('/api/lessons'))).toHaveLength(0);
    expect(fetchSpy.mock.calls.filter(([url]) => String(url).includes('generate-annotation'))).toHaveLength(0);
  });

  it('показывает слот-подсказку, когда она сохранена, и молчит, когда её нет', () => {
    const withHint = makeWord({
      hint: { label: 'в этой фразе', source: 'η κατασκευή', translation: 'конструкция' },
    });
    const { container, unmount } = render(<LearnWordCard word={withHint} {...noopProps()} />);
    expect(container.querySelector('.sheet-hint-label')?.textContent).toBe('в этой фразе');
    unmount();

    // Слова, сохранённые до появления поля hint, просто не имеют этой строки.
    const { container: without } = render(<LearnWordCard word={makeWord()} {...noopProps()} />);
    expect(without.querySelector('.sheet-hint')).toBeNull();
  });

  it('«Подробнее» догружает тир 2 по локально токенизированному предложению', async () => {
    const fetchSpy = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      expect(body.tier).toBe('details');
      // Цель адресуется внутри переданного предложения — урок не участвует.
      expect(body.target.sentence.tokens.some((t: { text: string }) => t.text === 'κατασκευή')).toBe(true);
      return new Response(
        JSON.stringify({ sections: [{ type: 'explanation', title: 'Форма', body: 'Именительный падеж.' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchSpy);

    render(<LearnWordCard word={makeWord()} {...noopProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Подробнее/ }));

    expect(await screen.findByText('Именительный падеж.')).toBeTruthy();
  });

  it('статус и подпись действия честно зависят от того, к повтору ли слово', () => {
    const { unmount } = render(<LearnWordCard word={makeWord()} {...noopProps()} />);
    expect(screen.getByText('Новое')).toBeTruthy();
    expect(screen.getByText('повтор сегодня')).toBeTruthy();
    expect(screen.getByText('слово в сегодняшней очереди — тренировка засчитается')).toBeTruthy();
    unmount();

    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    render(
      <LearnWordCard
        word={makeWord({
          review: { easeFactor: 2.5, intervalDays: 3, repetitions: 2, dueAt: future, lapses: 1, lastReviewedAt: new Date().toISOString() },
        })}
        {...noopProps()}
      />,
    );
    expect(screen.getByText('Учу')).toBeTruthy();
    expect(screen.getByText('вне расписания — прогресс не изменится')).toBeTruthy();
    expect(screen.getByText('2 верных повтора подряд · 1 ошибка')).toBeTruthy();
  });

  it('помечает сложное слово и подсказывает, что делать', () => {
    render(
      <LearnWordCard
        word={makeWord({
          review: { easeFactor: 1.8, intervalDays: 1, repetitions: 1, dueAt: new Date().toISOString(), lapses: 5, lastReviewedAt: new Date().toISOString() },
        })}
        {...noopProps()}
      />,
    );
    expect(screen.getByText('сложное')).toBeTruthy();
    expect(screen.getByText(/не даётся, попробуй сбросить или удалить/)).toBeTruthy();
  });

  it('сброс прогресса требует подтверждения и возвращает слово в начальное состояние', async () => {
    const props = noopProps();
    const word = makeWord({
      review: { easeFactor: 2.6, intervalDays: 30, repetitions: 5, dueAt: new Date().toISOString(), lapses: 1, lastReviewedAt: new Date().toISOString() },
    });
    render(<LearnWordCard word={word} {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить прогресс' }));
    expect(props.onUpdateWord).not.toHaveBeenCalled();
    expect(screen.getByText(/Слово снова станет «Новым»/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
    await waitFor(() => expect(props.onUpdateWord).toHaveBeenCalledTimes(1));
    const stored = props.onUpdateWord.mock.calls[0][0];
    expect(stored.review.repetitions).toBe(0);
    expect(stored.review.intervalDays).toBe(0);
    expect(stored.review.lapses).toBe(0);
  });

  it('удаление требует подтверждения', () => {
    const props = noopProps();
    render(<LearnWordCard word={makeWord()} {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Удалить слово' }));
    expect(props.onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it('не показывает читательские действия — «Продолжить отсюда» тут не при чём', () => {
    render(<LearnWordCard word={makeWord()} {...noopProps()} />);
    expect(screen.queryByText('Продолжить отсюда')).toBeNull();
    expect(screen.getByRole('button', { name: 'Тренировать сейчас' })).toBeTruthy();
  });
});
