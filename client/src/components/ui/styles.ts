import { cn } from '../../lib/cn';

const variants = {
  primary: 'bg-teal-600 text-white shadow-sm hover:bg-teal-700',
  secondary: 'border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50',
  ghost: 'text-slate-700 hover:bg-slate-100',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
  'danger-ghost': 'text-rose-700 hover:bg-rose-50',
} as const;

const sizes = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-base',
  icon: 'h-9 w-9',
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

/** Button look, shared by <button> and router links styled as buttons. */
export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
) {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  );
}

export const inputClass =
  'block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-xs ' +
  'placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:outline-none ' +
  'disabled:bg-slate-50 disabled:text-slate-500 aria-invalid:border-rose-500';

/** Text color for a balance: teal when you get money back, rose when you owe. */
export function balanceTone(amount: number) {
  return amount > 0 ? 'text-teal-700' : amount < 0 ? 'text-rose-700' : 'text-slate-500';
}
