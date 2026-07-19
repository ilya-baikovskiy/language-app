type Props = {
  details: string;
};

export function GrammarDetails({ details }: Props) {
  return (
    <details className="sheet-more">
      <summary>Подробнее про эту грамматику</summary>
      <div className="sheet-more-body">
        <p>{details}</p>
      </div>
    </details>
  );
}
