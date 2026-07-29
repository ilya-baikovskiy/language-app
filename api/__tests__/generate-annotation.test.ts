import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../generate-annotation';

const originalApiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalApiKey;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function feedbackRequest(feedback?: Record<string, unknown>) {
  return new Request('https://example.test/api/generate-annotation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'practice-feedback',
      language: 'el',
      level: 'A2',
      feedback,
    }),
  });
}

describe('/api/generate-annotation practice-feedback', () => {
  it('требует payload для режима разбора', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const response = await POST(feedbackRequest());
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('feedback payload is required');
  });

  it('возвращает строгий JSON с коротким объяснением и не меняет verdict', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchSpy = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(body.messages[0].content).toContain('Do not change');
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"explanation":"Нужно окончание -ονται."}' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchSpy);

    const response = await POST(feedbackRequest({
      surfaceForm: 'κατασκευάζονται',
      translation: 'строятся',
      learnerAnswer: 'κατασκευάζο',
      source: 'Τα σπίτια κατασκευάζονται εδώ.',
      sourceTranslation: 'Дома строятся здесь.',
      verdict: 'almost',
      level: 'A2',
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ explanation: 'Нужно окончание -ονται.' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
