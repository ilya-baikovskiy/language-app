import type { Example } from '../types/lesson';

type Props = {
  examples?: Example[];
};

export function ExampleList({ examples }: Props) {
  if (!examples || examples.length === 0) return null;

  return (
    <div className="sheet-body">
      <p className="sheet-section-title">Примеры</p>
      {examples.map((example) => (
        <div className="example" key={example.targetText}>
          <div className="fr">{example.targetText}</div>
          <div className="ru">{example.translation}</div>
        </div>
      ))}
    </div>
  );
}
