import type { Category } from '@domain';
import { cn } from '../lib/cn';
import { CATEGORY_ICONS, CATEGORY_LABELS } from '../lib/categories';

/** Category glyph in a neutral tile; the icon and the name carry the meaning, not color. */
export function CategoryIcon({ category, className }: { category: Category; className?: string }) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <span
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600',
        className,
      )}
      title={CATEGORY_LABELS[category]}
    >
      <Icon className="size-5" aria-hidden />
    </span>
  );
}
