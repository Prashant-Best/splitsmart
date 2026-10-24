import { LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { formatMoney } from '../../lib/format';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <div
      className={cn('flex items-center justify-center py-12 text-slate-400', className)}
      role="status"
    >
      <LoaderCircle className="size-6 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn('rounded-2xl border border-slate-200 bg-white shadow-xs', className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
        <Icon className="size-6" aria-hidden />
      </span>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Money({
  value,
  currency,
  className,
}: {
  value: number;
  currency: string;
  className?: string;
}) {
  return <span className={cn('tabular', className)}>{formatMoney(value, currency)}</span>;
}

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#0d9488" />
        <path d="M14.5 7.5a8.5 8.5 0 0 0 0 17z" fill="#fff" />
        <path d="M17.5 7.5a8.5 8.5 0 0 1 0 17z" fill="#fff" fillOpacity="0.55" />
      </svg>
      {withText && <span className="text-lg text-slate-900">SplitSmart</span>}
    </span>
  );
}
