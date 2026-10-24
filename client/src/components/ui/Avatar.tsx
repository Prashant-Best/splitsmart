import { cn } from '../../lib/cn';

// Soft background + dark ink pairs; picked by a hash of the user id so a person keeps the same
// avatar everywhere. Decoration only: names are always shown next to avatars.
const TONES = [
  'bg-sky-100 text-sky-800',
  'bg-amber-100 text-amber-800',
  'bg-violet-100 text-violet-800',
  'bg-emerald-100 text-emerald-800',
  'bg-pink-100 text-pink-800',
  'bg-lime-100 text-lime-800',
  'bg-orange-100 text-orange-800',
  'bg-indigo-100 text-indigo-800',
];

function hash(text: string): number {
  let h = 0;
  for (const char of text) h = (h * 31 + char.charCodeAt(0)) >>> 0;
  return h;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');

const sizes = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
};

export function Avatar({
  id,
  name,
  size = 'sm',
  className,
}: {
  id: string;
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        TONES[hash(id) % TONES.length],
        sizes[size],
        className,
      )}
      title={name}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 5,
  size = 'sm',
}: {
  people: { id: string; name: string }[];
  max?: number;
  size?: keyof typeof sizes;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex -space-x-1" aria-label={people.map((p) => p.name).join(', ')}>
      {shown.map((p) => (
        <Avatar key={p.id} id={p.id} name={p.name} size={size} className="ring-2 ring-white" />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-600 ring-2 ring-white',
            sizes[size],
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
