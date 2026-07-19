import type { Token } from '../types/lesson';

type Props = {
  token: Token;
  isSelected: boolean;
  isSpeaking: boolean;
  onSelect: () => void;
};

export function InteractiveToken({ token, isSelected, isSpeaking, onSelect }: Props) {
  const className = ['tok', isSelected && 'is-selected', isSpeaking && 'is-speaking'].filter(Boolean).join(' ');
  return (
    <span className={className} onClick={onSelect}>
      {token.text}
    </span>
  );
}
