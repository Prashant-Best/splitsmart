import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { keys } from '../api/queries';
import type { Group, Member, User } from '../api/types';

export const me: User = {
  id: 'a1',
  name: 'Asha Rao',
  email: 'asha@example.com',
  upiId: 'asha@okaxis',
  emailReminders: true,
};

const member = (id: string, name: string, upiId: string | null): Member => ({
  id,
  name,
  email: `${id}@example.com`,
  upiId,
  role: 'member',
  balance: 0,
  joinedAt: '2026-10-01T00:00:00.000Z',
});

export const group: Group = {
  id: 'g1',
  name: 'Goa Trip',
  currency: 'INR',
  inviteCode: 'invite-code-1',
  createdBy: 'a1',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  members: [
    member('a1', 'Asha Rao', 'asha@okaxis'),
    member('b2', 'Bala Iyer', 'bala@okhdfcbank'),
    member('c3', 'Chirag Das', null),
  ],
};

/** Renders inside the app's providers with a signed-in user. */
export function renderWithApp(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(keys.me, me);
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Replaces fetch with a stub that answers every request with `body`. */
export function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The JSON body of the n-th fetch call. */
export function sentBody(fetchMock: ReturnType<typeof mockFetch>, call = 0): unknown {
  return JSON.parse(String(fetchMock.mock.calls[call]?.[1]?.body));
}
