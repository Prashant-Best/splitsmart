import { useRef, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';

interface Option<T extends string> {
  value: T;
  label: string;
}

/**
 * A row of mutually exclusive options. As "tabs" it switches page sections; as "radio" it is a
 * form choice. Arrow keys move between options, like native controls.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  role = 'radio',
  className,
  idPrefix,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  role?: 'radio' | 'tab';
  className?: string;
  idPrefix?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role={role === 'tab' ? 'tablist' : 'radiogroup'}
      aria-label={label}
      className={cn('inline-flex rounded-xl bg-slate-100 p-1', className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role={role}
            id={idPrefix ? `${idPrefix}-${option.value}` : undefined}
            aria-selected={role === 'tab' ? selected : undefined}
            aria-checked={role === 'radio' ? selected : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
              selected
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
