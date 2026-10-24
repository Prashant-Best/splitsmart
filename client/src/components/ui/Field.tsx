import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';
import { inputClass } from './styles';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputClass, 'pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, 'h-auto min-h-20 py-2', className)} {...props} />;
}

/** An amount input with the currency symbol inside the box. */
export function MoneyInput({
  symbol,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { symbol: string }) {
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">
        {symbol}
      </span>
      <input
        inputMode="decimal"
        autoComplete="off"
        className={cn(inputClass, 'tabular pl-7 text-right')}
        {...props}
      />
    </div>
  );
}
