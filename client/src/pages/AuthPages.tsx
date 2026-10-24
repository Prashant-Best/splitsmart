import { ArrowRight, Network, QrCode, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ApiError, errorMessage } from '../api/client';
import { useLogin, useMe, useRegister } from '../api/queries';
import { safeNext } from '../auth';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { Logo } from '../components/ui/Misc';

// Seeded by `npm run seed`; the button only fills the form.
const DEMO = { email: 'prashant@example.com', password: 'splitsmart-demo' };

function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-teal-700 p-12 text-teal-50 lg:flex lg:flex-col">
        <div
          className="absolute -top-24 -right-24 size-96 rounded-full bg-teal-600/50"
          aria-hidden
        />
        <div
          className="absolute -bottom-32 -left-20 size-96 rounded-full bg-teal-800/60"
          aria-hidden
        />
        <div className="relative flex items-center gap-2">
          <svg viewBox="0 0 32 32" className="size-9" aria-hidden>
            <rect width="32" height="32" rx="8" fill="#ffffff" />
            <path d="M14.5 7.5a8.5 8.5 0 0 0 0 17z" fill="#0d9488" />
            <path d="M17.5 7.5a8.5 8.5 0 0 1 0 17z" fill="#0d9488" fillOpacity="0.55" />
          </svg>
          <span className="text-xl font-semibold text-white">SplitSmart</span>
        </div>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl leading-tight font-semibold text-white">
            Split bills with friends. Settle up in fewer payments.
          </h2>
          <ul className="mt-8 space-y-4 text-teal-50/90">
            <li className="flex gap-3">
              <Network className="mt-0.5 size-5 shrink-0" aria-hidden />
              <span>Debt simplification turns a tangle of IOUs into at most n−1 payments.</span>
            </li>
            <li className="flex gap-3">
              <QrCode className="mt-0.5 size-5 shrink-0" aria-hidden />
              <span>Pay your share with a UPI link or QR code in one tap.</span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
              <span>Every paisa accounted for: balances always add up to exactly zero.</span>
            </li>
          </ul>
        </div>
      </aside>
      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <Logo className="mb-8 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

function fieldError(error: unknown, field: string): string | null {
  return error instanceof ApiError
    ? (error.details.find((d) => d.path === field)?.message ?? null)
    : null;
}

export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const me = useMe();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (me.data) return <Navigate to={next} replace />;

  const submit = (event: FormEvent, credentials = { email, password }) => {
    event.preventDefault();
    login.mutate(credentials, { onSuccess: () => void navigate(next, { replace: true }) });
  };
  const formError =
    login.error && !(login.error instanceof ApiError && login.error.details.length)
      ? errorMessage(login.error)
      : null;

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={
        <>
          New here?{' '}
          <Link
            to={`/register?next=${encodeURIComponent(next)}`}
            className="font-medium text-teal-700 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={fieldError(login.error, 'email')}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Password" htmlFor="password" error={fieldError(login.error, 'password')}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {formError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {formError}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
          Sign in <ArrowRight className="size-4" aria-hidden />
        </Button>
      </form>
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
        <p>
          Just looking? Sign in as <span className="font-medium text-slate-900">Prashant</span> to
          explore a seeded Goa trip, a shared flat and a lunch club.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={(e) => {
            setEmail(DEMO.email);
            setPassword(DEMO.password);
            submit(e, DEMO);
          }}
        >
          Use the demo account
        </Button>
      </div>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const me = useMe();
  const register = useRegister();
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  if (me.data) return <Navigate to={next} replace />;

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    register.mutate(form, { onSuccess: () => void navigate(next, { replace: true }) });
  };
  const formError =
    register.error && !(register.error instanceof ApiError && register.error.details.length)
      ? errorMessage(register.error)
      : null;

  return (
    <AuthLayout
      title="Create your account"
      subtitle={
        <>
          Already have one?{' '}
          <Link
            to={`/login?next=${encodeURIComponent(next)}`}
            className="font-medium text-teal-700 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name" htmlFor="name" error={fieldError(register.error, 'name')}>
          <Input id="name" autoComplete="name" value={form.name} onChange={set('name')} required />
        </Field>
        <Field label="Email" htmlFor="email" error={fieldError(register.error, 'email')}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={set('email')}
            required
          />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          hint="At least 8 characters."
          error={fieldError(register.error, 'password')}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            required
          />
        </Field>
        {formError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {formError}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={register.isPending}>
          Create account <ArrowRight className="size-4" aria-hidden />
        </Button>
      </form>
    </AuthLayout>
  );
}
