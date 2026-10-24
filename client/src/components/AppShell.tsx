import { LogOut } from 'lucide-react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '../api/client';
import { useLogout, useMe } from '../api/queries';
import { useCurrentUser } from '../auth';
import { cn } from '../lib/cn';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Logo, Spinner } from './ui/Misc';

/** Renders its children only for a signed-in user; otherwise sends them to sign in first. */
export function RequireAuth() {
  const { data: user, isPending, isError, refetch } = useMe();
  const location = useLocation();
  if (isPending) return <Spinner className="min-h-dvh" />;
  if (isError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-slate-600">
        <p>Could not reach the server.</p>
        <Button variant="secondary" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900',
  );

export function AppShell() {
  const user = useCurrentUser();
  const logout = useLogout();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link to="/" aria-label="SplitSmart home">
            <Logo />
          </Link>
          <nav className="ml-2 hidden items-center gap-1 sm:flex" aria-label="Main">
            <NavLink to="/" end className={navClass}>
              Dashboard
            </NavLink>
            <NavLink to="/settings" className={navClass}>
              Settings
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Link
              to="/settings"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100"
              title="Profile and settings"
            >
              <Avatar id={user.id} name={user.name} />
              <span className="hidden text-sm font-medium text-slate-700 md:inline">
                {user.name}
              </span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              title="Sign out"
              loading={logout.isPending}
              onClick={() =>
                logout.mutate(undefined, { onError: (error) => toast.error(errorMessage(error)) })
              }
            >
              {!logout.isPending && <LogOut className="size-4" />}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
