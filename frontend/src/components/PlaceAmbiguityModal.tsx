import type { PlaceCandidate } from "@fly/contracts";

type Props = {
  fieldLabel: string;
  candidates: PlaceCandidate[];
  onPick: (placeId: string) => void;
  onDismiss: () => void;
};

export function PlaceAmbiguityModal({
  fieldLabel,
  candidates,
  onPick,
  onDismiss,
}: Props) {
  return (
    <div
      className="place-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="place-modal-title"
    >
      <div className="place-modal">
        <h2 id="place-modal-title" className="place-modal__title">
          Multiple matches for {fieldLabel}
        </h2>
        <p className="place-modal__body">
          Pick the airport or city you mean to continue the flight search.
        </p>
        <ul className="place-modal__list">
          {candidates.map((c) => (
            <li key={c.placeId}>
              <button
                type="button"
                className="place-modal__choice"
                onClick={() => onPick(c.placeId)}
              >
                <span className="place-modal__choice-label">{c.label}</span>
                {c.subtitle ? (
                  <span className="place-modal__choice-sub">{c.subtitle}</span>
                ) : null}
                <span className="place-modal__kind">{c.kind}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="place-modal__dismiss" onClick={onDismiss}>
          Cancel
        </button>
      </div>
    </div>
  );
}
