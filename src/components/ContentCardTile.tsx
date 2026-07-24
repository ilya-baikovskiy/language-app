// Карточка материала в ленте «Выбрать».
//
// Без изображения/градиента-плейсхолдера (сознательно — не тратим на поиск
// или генерацию картинок, см. решение по ленте): чипсы → заголовок с
// эмодзи (тема+страна) встроенным в начало → русское описание (уже включает
// «В тексте: ...» одним абзацем, см. seed JSON) → CTA «Читать» слева.
// Никаких дополнительных бейджей (страна/уровень/язык/формат/score/
// «Главная») — язык и уровень читаются из глобального selector в TopBar, не
// дублируются на карточке.
import { useEffect, useRef } from 'react';
import { track } from '../content-system/analytics/eventClient';
import type { ContentCard, FeedSlot, ProvenanceType } from '../content-system/types';

const PROVENANCE_LABELS: Record<ProvenanceType, string> = {
  ai_fiction: 'AI-история',
  source_based_explainer: 'На основе фактов',
  adapted_article: 'На основе источников',
  current_event: 'На основе источников',
  user_text: 'На основе источников',
};

function durationLabel(estimatedReadingSeconds: number): string {
  const minutes = Math.max(1, Math.round(estimatedReadingSeconds / 60));
  return `${minutes} мин`;
}

type Props = {
  card: ContentCard;
  position: number;
  slot: FeedSlot;
  size?: 'hero' | 'default';
  onRead: (card: ContentCard) => void;
};

export function ContentCardTile({ card, position, slot, size = 'default', onRead }: Props) {
  const articleRef = useRef<HTMLElement>(null);
  const impressionSentRef = useRef(false);

  // card_impression (05 §6): "отправлять только при реальной видимости" —
  // real IntersectionObserver visibility, not just mount, and only once per
  // card/slot occupying this tile (re-armed if the tile gets reused for a
  // different card after "Предложить другие").
  useEffect(() => {
    impressionSentRef.current = false;
    const node = articleRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !impressionSentRef.current) {
            impressionSentRef.current = true;
            track('card_impression', { position, slot, isHero: size === 'hero' }, { cardId: card.id });
            observer.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [card.id, position, slot, size]);

  return (
    <article ref={articleRef} className={`content-card ${size === 'hero' ? 'content-card-hero' : ''}`}>
      <div className="content-card-chips">
        <span className="content-card-chip">{PROVENANCE_LABELS[card.provenanceType]}</span>
        <span className="content-card-chip">{durationLabel(card.estimatedReadingSeconds)}</span>
      </div>
      <h3 className="content-card-title">
        <span className="content-card-title-emoji" aria-hidden="true">
          {card.emoji}
        </span>
        {card.editorialTitleRu}
      </h3>
      <p className="content-card-description">{card.editorialDescriptionRu}</p>
      <div className="content-card-footer">
        <button type="button" className="btn primary" onClick={() => onRead(card)}>
          Читать
        </button>
      </div>
    </article>
  );
}
