// Карточка материала в ленте «Выбрать» — см.
// docs/content-system-v1.2/16_APPROVED_MOBILE_UX_AND_NAVIGATION.md §6-7 и
// 02_CONTENT_CATALOG_AND_CARD_SYSTEM.md §7 (что показывать/не показывать).
//
// Ровно: изображение(-placeholder) → 2 чипсы поверх → русский заголовок →
// русское описание (уже включает «В тексте: ...» одним абзацем, см. seed
// JSON) → CTA «Читать». Никаких дополнительных бейджей (страна/уровень/язык/
// формат/score/«Главная») — язык и уровень читаются из глобального selector
// в TopBar, не дублируются на карточке.
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

// Нейтральные нецветокодированные placeholder-градиенты вместо AI-изображений
// (16 §7 — «до AI image pipeline допустимы нейтральные placeholders», «не
// копировать декоративные символы прототипа как финальные изображения»).
// Детерминированный выбор по id карточки — не случайный (стабильный внешний
// вид одной и той же карточки между рендерами), но и не смысловое
// цветокодирование темы/страны (что запрещено PLAN.md вне explicit
// interaction states) — только визуальное разнообразие плейсхолдеров.
const PLACEHOLDER_GRADIENTS = [
  'linear-gradient(145deg, #6b7280, #9ca3af)',
  'linear-gradient(145deg, #57534e, #a8a29e)',
  'linear-gradient(145deg, #44403c, #78716c)',
  'linear-gradient(145deg, #52525b, #a1a1aa)',
];

function placeholderFor(cardId: string): string {
  let hash = 0;
  for (let i = 0; i < cardId.length; i += 1) hash = (hash * 31 + cardId.charCodeAt(i)) >>> 0;
  return PLACEHOLDER_GRADIENTS[hash % PLACEHOLDER_GRADIENTS.length];
}

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
      <div className="content-card-visual" style={{ background: placeholderFor(card.id) }}>
        <div className="content-card-chips">
          <span className="content-card-chip">{PROVENANCE_LABELS[card.provenanceType]}</span>
          <span className="content-card-chip">{durationLabel(card.estimatedReadingSeconds)}</span>
        </div>
      </div>
      <div className="content-card-body">
        <h3 className="content-card-title">{card.editorialTitleRu}</h3>
        <p className="content-card-description">{card.editorialDescriptionRu}</p>
        <div className="content-card-footer">
          <button type="button" className="btn primary" onClick={() => onRead(card)}>
            Читать
          </button>
        </div>
      </div>
    </article>
  );
}
