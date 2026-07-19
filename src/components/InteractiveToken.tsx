import type { Token } from '../types/lesson';

type Props = {
  token: Token;
};

// Этап 1: чисто визуальный токен, без обработчиков клика — клик и подсветка
// состояний (is-speaking / is-selected) появятся в Этапе 2–3.
export function InteractiveToken({ token }: Props) {
  return <span className="tok">{token.text}</span>;
}
