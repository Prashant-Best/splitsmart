import { useMe } from './api/queries';
import type { User } from './api/types';

/** The signed-in user. Only used below <RequireAuth>, which renders nothing until it exists. */
export function useCurrentUser(): User {
  const { data } = useMe();
  if (!data) throw new Error('useCurrentUser must be used inside RequireAuth');
  return data;
}

/** Only follow same-site paths after sign-in, never "//evil.example" (no open redirect). */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
