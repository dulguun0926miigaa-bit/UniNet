import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

function normalizeOptions(options = []) {
  return options.map(option => {
    if (typeof option === "string" || typeof option === "number") {
      return { value: String(option), label: String(option), disabled: false };
    }
    return {
      value: String(option.value),
      label: String(option.label ?? option.value),
      disabled: Boolean(option.disabled),
    };
  });
}

export default function StyledSelect({
  label,
  value,
  onChange,
  options = [],
  placeholder = "Сонгох",
  disabled = false,
  className = "",
  buttonClassName = "",
  menuClassName = "",
  ariaLabel,
}) {
  const id = useId();
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const optionRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalized = useMemo(() => normalizeOptions(options), [options]);
  const selectedIndex = normalized.findIndex(option => option.value === String(value ?? ""));
  const selected = selectedIndex >= 0 ? normalized[selectedIndex] : null;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onEscape = event => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const nextIndex = selectedIndex >= 0 ? selectedIndex : normalized.findIndex(option => !option.disabled);
    const frame = window.requestAnimationFrame(() => {
      setActiveIndex(nextIndex);
      optionRefs.current[nextIndex]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, selectedIndex, normalized]);

  const choose = option => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  };

  const move = direction => {
    if (!normalized.length) return;
    let index = activeIndex;
    for (let attempts = 0; attempts < normalized.length; attempts += 1) {
      index = (index + direction + normalized.length) % normalized.length;
      if (!normalized[index].disabled) {
        setActiveIndex(index);
        optionRefs.current[index]?.focus();
        return;
      }
    }
  };

  return (
    <div ref={rootRef} className={`relative min-w-[150px] ${open ? "z-[300]" : "z-20"} ${className}`}>
      {label && (
        <label id={`${id}-label`} className="mb-1.5 block text-[11px] font-bold text-slate-600">
          {label}
        </label>
      )}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={label ? `${id}-label ${id}-value` : undefined}
        aria-label={!label ? ariaLabel : undefined}
        onClick={() => setOpen(current => !current)}
        onKeyDown={event => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            if (!open) setOpen(true);
            else if (event.key === "ArrowDown") move(1);
            else if (event.key === "ArrowUp") move(-1);
            else if (activeIndex >= 0) choose(normalized[activeIndex]);
          }
        }}
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm font-semibold text-slate-700 shadow-[0_4px_14px_rgba(15,23,42,0.07)] outline-none transition hover:border-sky-300 hover:shadow-md focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${buttonClassName}`}
      >
        <span id={`${id}-value`} className="min-w-0 truncate">{selected?.label || placeholder}</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className={`absolute left-0 right-0 z-[310] mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.22)] ${menuClassName}`}>
          <div role="listbox" aria-labelledby={label ? `${id}-label` : undefined} className="max-h-64 overflow-y-auto py-0.5">
            {normalized.map((option, index) => {
              const isSelected = option.value === String(value ?? "");
              return (
                <button
                  key={`${option.value}-${index}`}
                  ref={node => { optionRefs.current[index] = node; }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  tabIndex={index === activeIndex ? 0 : -1}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onKeyDown={event => {
                    if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
                    if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
                    if (["Enter", " "].includes(event.key)) { event.preventDefault(); choose(option); }
                    if (event.key === "Tab") setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${isSelected ? "bg-sky-500 text-white" : "text-slate-700 hover:bg-sky-50 hover:text-sky-700"} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <Check aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
