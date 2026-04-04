import { useEffect, useId, useRef, useState } from "react";
import type { PlaceCandidate } from "@fly/contracts";
import { postPlaceSuggest } from "../api/placesClient";

type Props = {
  id: string;
  label: string;
  value: string;
  placeId: string;
  onChange: (next: { text: string; placeId: string }) => void;
  disabled?: boolean;
  validationId?: string;
  /** Marks the control invalid (e.g. form validation failed). */
  invalid?: boolean;
  required?: boolean;
};

const DEBOUNCE_MS = 350;

export function PlaceField({
  id,
  label,
  value,
  placeId,
  onChange,
  disabled,
  validationId,
  invalid,
  required,
}: Props) {
  const listId = useId();
  const hintId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceCandidate[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      acRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const runSuggest = (q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      acRef.current?.abort();
      const ac = new AbortController();
      acRef.current = ac;
      setLoading(true);
      try {
        const res = await postPlaceSuggest(q.trim(), ac.signal);
        setSuggestions(res.suggestions);
        setOpen(res.suggestions.length > 0);
      } catch {
        if (ac.signal.aborted) return;
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  };

  const describedBy =
    [hintId, validationId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="place-field" ref={containerRef}>
      <label className="flight-search-form__label" htmlFor={id}>
        {label}
      </label>
      <div className="place-field__input-wrap">
        <input
          id={id}
          type="text"
          autoComplete="off"
          maxLength={120}
          className="flight-search-form__input"
          value={value}
          disabled={disabled}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          role="combobox"
          onChange={(e) => {
            const text = e.target.value;
            onChange({ text, placeId: "" });
            runSuggest(text);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
        />
        {loading ? (
          <span className="place-field__spinner" aria-hidden="true" />
        ) : null}
      </div>
      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          className="place-field__list"
          role="listbox"
          aria-label={`${label} suggestions`}
        >
          {suggestions.map((s) => (
            <li key={`${s.placeId}-${s.label}`} role="none">
              <button
                type="button"
                role="option"
                className="place-field__option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({
                    text: s.label,
                    placeId: s.placeId,
                  });
                  setOpen(false);
                  setSuggestions([]);
                }}
              >
                <span className="place-field__option-label">{s.label}</span>
                {s.subtitle ? (
                  <span className="place-field__option-sub">{s.subtitle}</span>
                ) : null}
                <span className="place-field__option-kind">{s.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {placeId ? (
        <p id={hintId} className="place-field__resolved" aria-live="polite">
          Place selected for search.
        </p>
      ) : (
        <p id={hintId} className="place-field__hint">
          Type to search airports and cities; pick a row to lock the route.
        </p>
      )}
    </div>
  );
}
