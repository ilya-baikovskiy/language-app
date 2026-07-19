import type { Token } from '../types/lesson';

type Props = {
  token: Token;
  isSelected: boolean;
  onSelect: () => void;
};

export function InteractiveToken({ token, isSelected, onSelect }: Props) {
  return (
    <span className={`tok${isSelected ? ' is-selected' : ''}`} onClick={onSelect}>
      {token.text}
    </span>
  );
}
