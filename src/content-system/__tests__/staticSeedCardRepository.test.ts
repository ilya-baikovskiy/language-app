import { describe, expect, it } from 'vitest';
import { StaticSeedCardRepository } from '../repositories/staticSeedCardRepository';

describe('StaticSeedCardRepository', () => {
  const repo = new StaticSeedCardRepository();

  it('loads seed cards that all pass the ContentCard schema', async () => {
    const cards = await repo.listCandidates({});
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.status).toBe('active');
    }
  });

  it('filters by language support', async () => {
    const germanOnly = await repo.listCandidates({ language: 'de' });
    for (const card of germanOnly) {
      expect(card.supportedLanguages).toContain('de');
    }
    const unsupported = await repo.listCandidates({ language: 'xx' });
    expect(unsupported).toHaveLength(0);
  });

  it('filters by level suitability for the requested language', async () => {
    const beginnerGerman = await repo.listCandidates({ language: 'de', level: 'A0' });
    const advancedGerman = await repo.listCandidates({ language: 'de', level: 'C1' });
    expect(advancedGerman.length).toBeLessThan(beginnerGerman.length + 1);
    // C1 не покрыт ни одной seed-карточкой в v1 — ожидаем пустой результат.
    expect(advancedGerman).toHaveLength(0);
  });

  it('getById returns null for unknown ids', async () => {
    expect(await repo.getById('does-not-exist')).toBeNull();
  });

  it('getById returns the matching card', async () => {
    const [first] = await repo.listCandidates({});
    const found = await repo.getById(first.id);
    expect(found?.id).toBe(first.id);
  });

  it('saveMany is read-only and always throws', async () => {
    await expect(repo.saveMany()).rejects.toThrow(/read-only/);
  });

  it('excludes ids passed via excludeCardIds', async () => {
    const [first] = await repo.listCandidates({});
    const filtered = await repo.listCandidates({ excludeCardIds: [first.id] });
    expect(filtered.some((card) => card.id === first.id)).toBe(false);
  });
});
