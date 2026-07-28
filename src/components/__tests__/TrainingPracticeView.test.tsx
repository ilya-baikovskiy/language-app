// @vitest-environment jsdom
//
// Рабочий экран практики (2026-07-28, см. PROGRESS.md): клоуз, подсказка,
// объяснение соседних слов и сохранение SRS-расписания.
// Без @testing-library/jest-dom (не установлен в проекте) — getByText/
// getByRole сами бросают, если не нашли, этого достаточно как assertion;
// для "нет на экране" — queryBy* + toBeNull.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrainingPracticeView } from '../TrainingPracticeView';
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
    surfaceForm: 'κατασκευή',
    translation: 'конструкция',
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

describe('TrainingPracticeView', () => {
  it('вырезает целевое слово из сохранённого предложения в пропуск, а не показывает его целиком', () => {
    const { container } = render(<TrainingPracticeView words={[makeWord()]} onExit={vi.fn()} />);
    expect(screen.queryByText('κατασκευή')).toBeNull();
    expect(screen.getByPlaceholderText('?')).toBeTruthy();
    // Каждое слово — отдельный тапабельный <span>, поэтому сверяем по
    // текстовому содержимому всей фразы, а не по одному узлу.
    expect(container.querySelector('.training-cloze')?.textContent).toContain('βοηθά επίσης στην προστασία');
  });

  it('выделяет жирным перевод целевого слова в русском предложении, когда он реально найден', () => {
    render(<TrainingPracticeView words={[makeWord()]} onExit={vi.fn()} />);
    const bold = screen.getByText('конструкция', { selector: 'b' });
    expect(bold.tagName).toBe('B');
  });

  it('не выдумывает жирное слово, если перевод не встречается в предложении дословно (закрытый класс)', () => {
    const word = makeWord({
      surfaceForm: 'den',
      translation: 'артикль, дательный падеж, множественное число',
      contextSource: 'Sie kommt aus den Alpen in Österreich.',
      contextTranslation: 'Она из Альп в Австрии.',
      relatedSource: 'den Alpen',
      relatedTranslation: 'Альп',
      language: 'de',
    });
    render(<TrainingPracticeView words={[word]} onExit={vi.fn()} />);
    // relatedTranslation "Альп" реально есть в предложении — выделяем его, не грамматическую пометку.
    const bold = screen.getByText('Альп', { selector: 'b' });
    expect(bold.tagName).toBe('B');
  });

  it('тап по соседнему слову загружает перевод, не трогая пропуск', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === '/api/generate-annotation') {
          return new Response(
            JSON.stringify({
              displayForm: 'βοηθά',
              translation: 'помогает',
              audioText: 'βοηθά',
              hint: null,
              context: {
                source: 'Η κατασκευή τους βοηθά επίσης στην προστασία από τον δυνατό άνεμο.',
                translation: 'Их конструкция также помогает защититься от сильного ветра.',
                selectedSource: 'βοηθά',
                selectedTranslation: 'помогает',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ audioUrl: 'https://example.test/clip.mp3' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    render(<TrainingPracticeView words={[makeWord()]} onExit={vi.fn()} />);
    const neighbor = screen.getAllByText('βοηθά')[0];
    fireEvent.click(neighbor);
    expect(await screen.findByText(/помогает/)).toBeTruthy();
    expect(screen.getByPlaceholderText('?')).toBeTruthy();
  });

  it('раскрытие подсказки необратимо помечает попытку, даже после того как её снова спрятали', () => {
    render(<TrainingPracticeView words={[makeWord()]} onExit={vi.fn()} />);
    const hintBtn = screen.getByRole('button', { name: /Подсказка/ });
    fireEvent.click(hintBtn); // открыли
    expect(screen.getByText(/уже засчитано/i)).toBeTruthy();
    fireEvent.click(hintBtn); // спрятали обратно
    expect(screen.getByText(/уже засчитано/i)).toBeTruthy(); // пометка осталась

    fireEvent.change(screen.getByPlaceholderText('?'), { target: { value: 'κατασκευή' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText(/подсказка была раскрыта/i)).toBeTruthy();
  });

  it('точное совпадение формы — вердикт «Верно», расхождение — «Не совсем» с ожидаемым словом', () => {
    render(<TrainingPracticeView words={[makeWord()]} onExit={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('?'), { target: { value: 'κατασκευή' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('✓ Верно!')).toBeTruthy();
    expect(screen.getByText('Проговори фразу целиком')).toBeTruthy();
  });

  it('вердикт «Не совсем» называет ожидаемое слово', () => {
    render(<TrainingPracticeView words={[makeWord()]} onExit={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('?'), { target: { value: 'что-то другое' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('✕ Не совсем')).toBeTruthy();
    expect(screen.getByText(/Ожидалось «κατασκευή»/)).toBeTruthy();
  });

  it('«Дальше» на последней карточке выходит из практики (onExit), не на несуществующую следующую', () => {
    const onExit = vi.fn();
    render(<TrainingPracticeView words={[makeWord()]} onExit={onExit} />);
    fireEvent.change(screen.getByPlaceholderText('?'), { target: { value: 'κατασκευή' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    fireEvent.click(screen.getByRole('button', { name: /Дальше/ }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('без сохранённого предложения — запасной ввод по переводу без крэша', () => {
    render(<TrainingPracticeView words={[makeWord({ contextSource: undefined, contextTranslation: undefined })]} onExit={vi.fn()} />);
    expect(screen.getByText(/конструкция:/)).toBeTruthy();
    expect(screen.getByPlaceholderText('?')).toBeTruthy();
  });

  it('первая попытка сохраняет новое SRS-расписание', async () => {
    const onUpdateWord = vi.fn(async (nextWord: SavedWord) => nextWord);
    render(
      <TrainingPracticeView
        words={[makeWord({ contextSource: undefined, contextTranslation: undefined })]}
        onExit={vi.fn()}
        onUpdateWord={onUpdateWord}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('?'), { target: { value: 'κατασκευή' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));

    await waitFor(() => expect(onUpdateWord).toHaveBeenCalledTimes(1));
    const stored = onUpdateWord.mock.calls[0][0];
    expect(stored.review.repetitions).toBe(1);
    expect(stored.review.intervalDays).toBe(1);
    expect(stored.review.lastReviewedAt).toBeTruthy();
  });

  it('пустой список слов не крэшит экран', () => {
    render(<TrainingPracticeView words={[]} onExit={vi.fn()} />);
    expect(screen.getByText('Слов для тренировки нет.')).toBeTruthy();
  });
});
