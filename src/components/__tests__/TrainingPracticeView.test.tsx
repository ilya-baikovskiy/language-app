// @vitest-environment jsdom
//
// Рабочий экран практики (2026-07-28, см. PROGRESS.md): клоуз, подсказка,
// объяснение соседних слов и сохранение SRS-расписания.
// Без @testing-library/jest-dom (не установлен в проекте) — getByText/
// getByRole сами бросают, если не нашли, этого достаточно как assertion;
// для "нет на экране" — queryBy* + toBeNull.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingPracticeView } from '../TrainingPracticeView';
import type { SavedWord } from '../../content-system/savedWord';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// jsdom не реализует canvas 2D-контекст (нет пакета `canvas`), а TextInput
// с autoSize меряет ширину именно через canvas.measureText (см.
// components/ui/controls.tsx — заменили эвристику по "ch", которая резала
// текст в реальном браузере для непропорциональных греческих слов). Без
// стаба getContext('2d') шумит в консоли "Not implemented" и ширина всегда
// падает на нижний предел — стаб делает измерение детерминированным
// (8px на символ), чтобы тест реально проверял "длиннее слово — шире поле".
const MOCK_PX_PER_CHAR = 8;
beforeEach(() => {
  // restoreAllMocks() в afterEach снимает и этот стаб — восстанавливаем на
  // каждый тест, а не один раз при загрузке модуля.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((contextId: string) => {
    if (contextId !== '2d') return null;
    return { measureText: (text: string) => ({ width: text.length * MOCK_PX_PER_CHAR }) };
  }) as typeof HTMLCanvasElement.prototype.getContext);
});

function autoSizeWidthPx(text: string): number {
  const floor = Math.max(3, 0) * MOCK_PX_PER_CHAR; // AUTO_SIZE_MIN_CHARS.length === 3
  const content = text.length * MOCK_PX_PER_CHAR;
  const horizontalPadding = 11 * 2 + 1 * 2 + 4;
  return Math.max(floor, content) + horizontalPadding;
}

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
    const input = screen.getByRole('textbox', { name: /Пропущенное слово/ }) as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.getAttribute('placeholder')).toBeNull();
    // Ширина обёртки отмерена canvas.measureText от ожидаемого слова (пока поле пустое).
    const shell = container.querySelector<HTMLElement>('.training-answer-shell');
    expect(shell?.style.width).toBe(`${autoSizeWidthPx('κατασκευή')}px`);
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
    expect(screen.getByRole('textbox', { name: /Пропущенное слово/ })).toBeTruthy();
  });

  it('подсказка влияет на попытку без служебной надписи на рабочем экране', () => {
    render(<TrainingPracticeView words={[makeWord()]} onExit={vi.fn()} />);
    const hintBtn = screen.getByRole('button', { name: /Подсказка/ });
    fireEvent.click(hintBtn); // открыли
    expect(screen.getByText('κατασκευή', { selector: 'b' })).toBeTruthy();
    expect(screen.queryByText(/уже засчитано/i)).toBeNull();
    fireEvent.click(hintBtn); // спрятали обратно
    expect(screen.queryByText(/уже засчитано/i)).toBeNull();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'κατασκευή' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Ответ показан — повторим слово позже.')).toBeTruthy();
  });

  it('точное совпадение формы — вердикт «Верно», расхождение — «Не совсем» с ожидаемым словом', () => {
    render(<TrainingPracticeView words={[makeWord()]} onExit={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'κατασκευή' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('✓ Верно')).toBeTruthy();
    expect(screen.getByText('Проговори фразу целиком')).toBeTruthy();
    expect(screen.getByText('Твой ответ')).toBeTruthy();
    expect(screen.getByText('Правильно')).toBeTruthy();
  });

  it('русский перевод остаётся виден и после ответа, а не пропадает вместе с упражнением', () => {
    const { container } = render(<TrainingPracticeView words={[makeWord()]} onExit={vi.fn()} />);
    const ruText = () => container.querySelector('.training-ru-sentence')?.textContent;
    expect(ruText()).toBe('Их конструкция также помогает защититься от сильного ветра.');

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'κατασκευή' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));

    expect(screen.getByText('✓ Верно')).toBeTruthy();
    // Тот же перевод — не подсказка постфактум (попытка уже оценена), а
    // способ убедиться, что ответ, угаданный или расслышанный голосом,
    // реально понят, а не просто случайно совпал по буквам.
    expect(ruText()).toBe('Их конструкция также помогает защититься от сильного ветра.');
  });

  it('вердикт «Не совсем» показывает ответ ученика и ожидаемое слово', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('offline', { status: 503 })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<TrainingPracticeView words={[makeWord()]} onExit={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'что-то другое' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('✕ Не совсем')).toBeTruthy();
    expect(screen.getByText('что-то другое', { selector: '.training-answer-value' })).toBeTruthy();
    expect(screen.getByText('κατασκευή', { selector: '.training-answer-value' })).toBeTruthy();
    expect(await screen.findByText(/В этом контексте нужна форма/)).toBeTruthy();
  });

  it('«Дальше» на последней карточке выходит из практики (onExit), не на несуществующую следующую', () => {
    const onExit = vi.fn();
    render(<TrainingPracticeView words={[makeWord()]} onExit={onExit} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'κατασκευή' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    fireEvent.click(screen.getByRole('button', { name: /Дальше/ }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('без сохранённого предложения — запасной ввод по переводу без крэша', () => {
    render(<TrainingPracticeView words={[makeWord({ contextSource: undefined, contextTranslation: undefined })]} onExit={vi.fn()} />);
    expect(screen.getByText('конструкция', { selector: '.training-fallback-label' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Переведи: конструкция' })).toBeTruthy();
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

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'κατασκευή' } });
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

  it('source-режим выбирает точное предложение с целевой словоформой и не генерирует фразу', () => {
    const fetchSpy = vi.fn(async (
      _input: string | URL | Request,
      _init?: RequestInit,
    ) => new Response(
      JSON.stringify({ audioUrl: 'https://example.test/clip.mp3' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchSpy);
    const word = makeWord({
      contextSource: 'Πρώτη πρόταση. Η κατασκευή είναι λευκή. Τρίτη πρόταση.',
      contextTranslation: 'Первое предложение. Конструкция белая. Третье предложение.',
    });

    const { container } = render(
      <TrainingPracticeView words={[word]} phraseMode="source" onExit={vi.fn()} />,
    );

    expect(container.querySelector('.training-ru-sentence')?.textContent).toBe('Конструкция белая.');
    // Целевое слово блокируется в пустое поле ввода, а не показывается текстом.
    expect(container.querySelector('.training-cloze')?.textContent).toContain('είναι λευκή.');
    expect(container.querySelector('.training-cloze')?.textContent).not.toContain('κατασκευή');
    expect(container.querySelector('.training-cloze')?.textContent).not.toContain('Πρώτη πρόταση');
    const generatedPhraseRequest = fetchSpy.mock.calls.find(([, init]) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      return body.mode === 'practice-phrase';
    });
    expect(generatedPhraseRequest).toBeUndefined();
  });

  it('AI-режим использует сохранённую practicePhrase и не меняет её на source', () => {
    const word = makeWord({
      practicePhrase: {
        source: 'Αυτή είναι μια κατασκευή.',
        translation: 'Это конструкция.',
        promptVersion: 1,
        generatedAt: new Date().toISOString(),
      },
    });
    const { container } = render(
      <TrainingPracticeView words={[word]} phraseMode="ai" onExit={vi.fn()} />,
    );
    expect(container.querySelector('.training-cloze')?.textContent).toContain('Αυτή είναι μια ');
    expect(container.querySelector('.training-cloze')?.textContent).not.toContain('βοηθά');
  });

  it('AI-режим не показывает временный source, пока сохраняет отсутствующую фразу', async () => {
    let resolvePhrase!: (response: Response) => void;
    const phraseResponse = new Promise<Response>((resolve) => {
      resolvePhrase = resolve;
    });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      if (String(input) === '/api/generate-annotation' && body.mode === 'practice-phrase') {
        return phraseResponse;
      }
      return new Response(
        JSON.stringify({ audioUrl: 'https://example.test/clip.mp3' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }));
    const onUpdateWord = vi.fn(async (word: SavedWord) => word);
    const { container } = render(
      <TrainingPracticeView
        words={[makeWord()]}
        phraseMode="ai"
        onExit={vi.fn()}
        onUpdateWord={onUpdateWord}
      />,
    );

    expect(screen.getByText('Готовим упражнение')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(container.textContent).not.toContain('Η κατασκευή τους βοηθά');

    resolvePhrase(new Response(
      JSON.stringify({
        source: 'Αυτή είναι μια κατασκευή.',
        translation: 'Это конструкция.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));

    expect(await screen.findByRole('textbox', { name: /Пропущенное слово/ })).toBeTruthy();
    expect(container.querySelector('.training-cloze')?.textContent).toContain('Αυτή είναι μια ');
    expect(container.querySelector('.training-cloze')?.textContent).not.toContain('κατασκευή');
    expect(onUpdateWord).toHaveBeenCalledTimes(1);
  });

  it('длинная форма задаёт широкое поле, короткая — падает на нижний предел', () => {
    const longWord = makeWord({
      surfaceForm: 'κατασκευάζονται',
      translation: 'строятся',
      contextSource: 'Τα σπίτια κατασκευάζονται εδώ.',
      contextTranslation: 'Дома строятся здесь.',
    });
    const { container: longContainer } = render(<TrainingPracticeView words={[longWord]} onExit={vi.fn()} />);
    const longShell = longContainer.querySelector<HTMLElement>('.training-answer-shell');
    expect(longShell?.style.width).toBe(`${autoSizeWidthPx('κατασκευάζονται')}px`);

    const shortWord = makeWord({ surfaceForm: 'το', translation: 'это' });
    const { container: shortContainer } = render(<TrainingPracticeView words={[shortWord]} onExit={vi.fn()} />);
    const shortShell = shortContainer.querySelector<HTMLElement>('.training-answer-shell');
    // 2-буквенное слово короче нижнего предела (см. controls.tsx:
    // AUTO_SIZE_MIN_CHARS='000', 3 символа) — падает на пол, а не сжимается сильнее.
    expect(shortShell?.style.width).toBe(`${autoSizeWidthPx('το')}px`);
  });

  // Пословное правило SRS (см. LEARN_SECTION_PLAN.md, этап A): расписание
  // обновляется только у слов, которые были к повтору на старте сессии. Это
  // заменило прежний сессионный флаг freePractice.
  it('не обновляет расписание у слова, которое не к повтору', async () => {
    const onUpdateWord = vi.fn(async (nextWord: SavedWord) => nextWord);
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const notDue = makeWord({
      contextSource: undefined,
      contextTranslation: undefined,
      review: { easeFactor: 2.5, intervalDays: 5, repetitions: 2, dueAt: future, lapses: 0 },
    });
    render(<TrainingPracticeView words={[notDue]} onExit={vi.fn()} onUpdateWord={onUpdateWord} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'κατασκευή' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));

    expect(screen.getByText('✓ Верно')).toBeTruthy();
    expect(await screen.findByText('Вне расписания — расписание не изменилось.')).toBeTruthy();
    expect(onUpdateWord).not.toHaveBeenCalled();
  });

  it('в одной сессии обновляет расписание только у тех слов, что к повтору', async () => {
    const onUpdateWord = vi.fn(async (nextWord: SavedWord) => nextWord);
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const dueWord = makeWord({ id: 'lesson-1:due', tokenId: 'due', contextSource: undefined, contextTranslation: undefined });
    const notDueWord = makeWord({
      id: 'lesson-1:later',
      tokenId: 'later',
      contextSource: undefined,
      contextTranslation: undefined,
      review: { easeFactor: 2.5, intervalDays: 5, repetitions: 2, dueAt: future, lapses: 0 },
    });
    render(
      <TrainingPracticeView words={[dueWord, notDueWord]} onExit={vi.fn()} onUpdateWord={onUpdateWord} />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'κατασκευή' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    await waitFor(() => expect(onUpdateWord).toHaveBeenCalledTimes(1));
    expect(onUpdateWord.mock.calls[0][0].id).toBe('lesson-1:due');

    fireEvent.click(screen.getByRole('button', { name: /Дальше/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'κατασκευή' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));

    expect(await screen.findByText('Вне расписания — расписание не изменилось.')).toBeTruthy();
    // Второе слово расписание не тронуло — вызов остался единственным.
    expect(onUpdateWord).toHaveBeenCalledTimes(1);
  });

  // Этап B плана: экран итогов вместо молчаливого выхода.
  it('после последней карточки показывает итоги со счётом и записью расписания', async () => {
    const onUpdateWord = vi.fn(async (nextWord: SavedWord) => nextWord);
    const onExit = vi.fn();
    const first = makeWord({ id: 'lesson-1:a', tokenId: 'a', contextSource: undefined, contextTranslation: undefined });
    const second = makeWord({
      id: 'lesson-1:b',
      tokenId: 'b',
      surfaceForm: 'άνετα',
      translation: 'комфортно',
      contextSource: undefined,
      contextTranslation: undefined,
    });
    render(<TrainingPracticeView words={[first, second]} onExit={onExit} onUpdateWord={onUpdateWord} />);

    // Первое — верно, второе — мимо.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'κατασκευή' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    await waitFor(() => expect(onUpdateWord).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /Дальше/ }));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'мимо' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    await waitFor(() => expect(onUpdateWord).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: /Дальше/ }));

    expect(screen.getByText('Сессия завершена')).toBeTruthy();
    expect(screen.getByText('из 2 верно')).toBeTruthy();
    expect(screen.getByText('1', { selector: '.training-summary-score b' })).toBeTruthy();
    expect(screen.getByText('Расписание обновлено для всех слов сессии')).toBeTruthy();
    // Выход из итогов — только по «Готово», не автоматически.
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('«Повторить ошибки» берёт только неверные и не меняет расписание второй раз', async () => {
    const onUpdateWord = vi.fn(async (nextWord: SavedWord) => nextWord);
    const first = makeWord({ id: 'lesson-1:a', tokenId: 'a', contextSource: undefined, contextTranslation: undefined });
    const second = makeWord({
      id: 'lesson-1:b',
      tokenId: 'b',
      surfaceForm: 'άνετα',
      translation: 'комфортно',
      contextSource: undefined,
      contextTranslation: undefined,
    });
    render(<TrainingPracticeView words={[first, second]} onExit={vi.fn()} onUpdateWord={onUpdateWord} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'κατασκευή' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    await waitFor(() => expect(onUpdateWord).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /Дальше/ }));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'мимо' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    await waitFor(() => expect(onUpdateWord).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: /Дальше/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Повторить ошибки (1)' }));

    // Мини-сессия ровно из одного слова — того, что не далось.
    expect(screen.getByText('1/1', { selector: '.training-progress-label' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /Переведи: комфортно/ })).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'άνετα' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));

    // dueAt уже уехал в будущее первой попыткой — расписание не трогаем.
    expect(await screen.findByText('Вне расписания — расписание не изменилось.')).toBeTruthy();
    expect(onUpdateWord).toHaveBeenCalledTimes(2);
  });
});
