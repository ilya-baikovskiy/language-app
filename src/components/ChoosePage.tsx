// Экран «Выбрать» — см.
// docs/content-system-v1.2/16_APPROVED_MOBILE_UX_AND_NAVIGATION.md §5.
// Заголовок «Что почитаем?», секция «Подобрано для тебя», ровно 5 карточек
// (первая — hero, крупнее, без бейджа «Главная»), «Предложить другие».
// Явно убрано (16 §5): блок «Сегодня», «5 идей · до 3 минут», подзаголовок
// про «истории и короткие материалы», объяснения про генерацию, каталог тем
// на главном экране, mastery/streaks/проценты плана.
import { useFeed } from '../hooks/useFeed';
import { ContentCardTile } from './ContentCardTile';
import type { ContentCard, CEFRLevel } from '../content-system/types';
import type { LanguageCode } from '../../lib/pipeline/languageConfig';

type Props = {
  activeLanguage: LanguageCode;
  selectedLevel: CEFRLevel;
  enabledTopicIds: string[];
  enabledCountryOrRegionIds: string[];
  onRead: (card: ContentCard) => void;
};

export function ChoosePage({ activeLanguage, selectedLevel, enabledTopicIds, enabledCountryOrRegionIds, onRead }: Props) {
  const { items, loading, error, refresh } = useFeed({
    activeLanguage,
    selectedLevel,
    enabledTopicIds,
    enabledCountryOrRegionIds,
  });

  const [hero, ...rest] = items;

  return (
    <div className="shell">
      <h1 className="shell-title choose-title">Что почитаем?</h1>

      <div className="choose-section-head">
        <h2 className="choose-section-title">Подобрано для тебя</h2>
        <button type="button" className="btn ghost" onClick={refresh} disabled={loading}>
          Предложить другие
        </button>
      </div>

      {loading && items.length === 0 && <p className="empty-state">Подбираем материалы…</p>}

      {error && (
        <p className="empty-state" role="status">
          Не удалось загрузить ленту материалов.{' '}
          <button type="button" className="translation-retry" onClick={refresh}>
            Повторить
          </button>
        </p>
      )}

      {!error && !loading && items.length === 0 && (
        <p className="empty-state">
          Для этого языка/уровня пока нет подходящих карточек — попробуй изменить темы или страны в настройках.
        </p>
      )}

      {items.length > 0 && (
        <div className="content-feed">
          {hero && <ContentCardTile key={hero.card.id} card={hero.card} size="hero" onRead={onRead} />}
          {rest.map((item) => (
            <ContentCardTile key={item.card.id} card={item.card} onRead={onRead} />
          ))}
        </div>
      )}
    </div>
  );
}
