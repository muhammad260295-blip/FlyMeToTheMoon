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

/** Single-character queries call the API (backend allows min 1). */
const MIN_QUERY_LEN = 1;
const DEBOUNCE_MS = 200;

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
  const statusId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceCandidate[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  /** True between scheduling a fetch and the debounced callback running (typing pause). */
  const [debouncePending, setDebouncePending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acRef = useRef<AbortController | null>(null);
  /** Monotonic id so stale responses / aborted requests never clobber UI or loading state. */
  const requestSeqRef = useRef(0);
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
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      acRef.current?.abort();
      requestSeqRef.current += 1;
      setSuggestions([]);
      setSuggestError(null);
      setDebouncePending(false);
      setOpen(false);
      setLoading(false);
      return;
    }
    setOpen(true);
    setDebouncePending(true);
    timerRef.current = setTimeout(async () => {
      setDebouncePending(false);
      acRef.current?.abort();
      const ac = new AbortController();
      acRef.current = ac;
      const seq = (requestSeqRef.current += 1);
      setLoading(true);
      setSuggestError(null);
      setSuggestions([]);
      try {
        const res = await postPlaceSuggest(trimmed, ac.signal);
        if (seq !== requestSeqRef.current) return;
        setSuggestions(res.suggestions);
        setSuggestError(null);
        setOpen(true);
      } catch (e) {
        if (ac.signal.aborted || seq !== requestSeqRef.current) return;
        setSuggestions([]);
        setSuggestError(
          e instanceof Error ? e.message : "Could not load suggestions.",
        );
        setOpen(true);
      } finally {
        if (seq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);
  };

  const describedBy =
    [hintId, statusId, validationId].filter(Boolean).join(" ") || undefined;
  const showList =
    open &&
    (debouncePending ||
      loading ||
      suggestError !== null ||
      suggestions.length > 0);

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
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-haspopup="listbox"
          aria-busy={debouncePending || loading || undefined}
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
            const t = value.trim();
            if (t.length >= MIN_QUERY_LEN) {
              setOpen(true);
              runSuggest(value);
            }
          }}
        />
        {loading ? (
          <span className="place-field__spinner" aria-hidden="true" />
        ) : null}
      </div>
      {showList ? (
        <ul
          id={listId}
          className="place-field__list"
          role="listbox"
          aria-label={`${label} suggestions`}
        >
          {(debouncePending || loading) &&
          suggestions.length === 0 &&
          !suggestError ? (
            <li className="place-field__status" role="presentation">
              <span className="place-field__status-text">Searching…</span>
            </li>
          ) : null}
          {suggestError ? (
            <li className="place-field__status" role="alert">
              <span className="place-field__status-text place-field__status-text--error">
                {suggestError}
              </span>
            </li>
          ) : null}
          {!debouncePending &&
          !loading &&
          !suggestError &&
          suggestions.length === 0 ? (
            <li className="place-field__status" role="presentation">
              <span className="place-field__status-text">
                No matching places. Try another spelling or airport code.
              </span>
            </li>
          ) : null}
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
                  setSuggestError(null);
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
      <p id={statusId} className="sr-only" aria-live="polite">
        {debouncePending || loading
          ? "Loading place suggestions."
          : suggestError
            ? suggestError
            : suggestions.length > 0
              ? `${suggestions.length} suggestions.`
              : ""}
      </p>
      {placeId ? (
        <p id={hintId} className="place-field__resolved" aria-live="polite">
          Place selected for search.
        </p>
      ) : (
        <p id={hintId} className="place-field__hint">
          Type from the first letter; pick a row to lock the route.
        </p>
      )}
    </div>
  );
}
