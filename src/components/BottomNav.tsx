// Glass floating bottom nav — см.
// docs/content-system-v1.2/16_APPROVED_MOBILE_UX_AND_NAVIGATION.md §3.
// Touch target ≥44px, aria-current="page" на активной вкладке, безопасная
// зона снизу через env(safe-area-inset-bottom) (в CSS). Не показывается в
// Reader — см. App.tsx (реальная вкладка убирается на уровне рендера, не
// display:none, чтобы не оставлять fixed-элемент в DOM поверх Reader).

import type { ReactNode } from 'react';

export type BottomNavTab = 'choose' | 'library' | 'learn';

const TABS: { tab: BottomNavTab; label: string }[] = [
  { tab: 'choose', label: 'Выбрать' },
  { tab: 'library', label: 'Мои тексты' },
  { tab: 'learn', label: 'Учить' },
];

const ICONS: Record<BottomNavTab, ReactNode> = {
  choose: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 19.5A2.5 2.5 0 016.5 17H20"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  library: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="7" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.65" />
      <rect x="14" y="4" width="7" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.65" />
    </svg>
  ),
  learn: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5c-1.7-1.3-4-2-6-2-1 0-2 .15-3 .5v14c1-.35 2-.5 3-.5 2 0 4.3.7 6 2 1.7-1.3 4-2 6-2 1 0 2 .15 3 .5V3.5C20 3.15 19 3 18 3c-2 0-4.3.7-6 2z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 5v14" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
    </svg>
  ),
};

type Props = {
  active: BottomNavTab;
  onSelect: (tab: BottomNavTab) => void;
};

export function BottomNav({ active, onSelect }: Props) {
  return (
    <nav className="bottom-nav-shell" aria-label="Основные разделы">
      <div className="glass-nav">
        {TABS.map(({ tab, label }) => (
          <button
            key={tab}
            type="button"
            className={`nav-item ${tab === active ? 'active' : ''}`}
            aria-current={tab === active ? 'page' : undefined}
            onClick={() => onSelect(tab)}
          >
            <span className="nav-icon">{ICONS[tab]}</span>
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
