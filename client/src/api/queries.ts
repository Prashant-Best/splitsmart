// TanStack Query hooks: one place for every request, cache key and invalidation rule.
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api, ApiError } from './client';
import type {
  Activity,
  BalanceSummary,
  Expense,
  ExpenseInput,
  Group,
  GroupSummary,
  InvitePreview,
  Page,
  PaymentMethod,
  Settlement,
  Stats,
  User,
} from './types';

export const keys = {
  me: ['me'] as const,
  groups: ['groups'] as const,
  activity: ['activity'] as const,
  group: (id: string) => ['group', id] as const,
  expenses: (id: string, filters: ExpenseFilters) => ['group', id, 'expenses', filters] as const,
  expense: (groupId: string, expenseId: string) =>
    ['group', groupId, 'expense', expenseId] as const,
  balances: (id: string) => ['group', id, 'balances'] as const,
  settlements: (id: string) => ['group', id, 'settlements'] as const,
  groupActivity: (id: string) => ['group', id, 'activity'] as const,
  stats: (id: string, months: number) => ['group', id, 'stats', months] as const,
  invite: (code: string) => ['invite', code] as const,
};

export interface ExpenseFilters {
  category?: string;
  search?: string;
}

const query = (params: Record<string, string | undefined | null>) => {
  const entries = Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]));
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
};

/** Anything that changes money in a group refreshes that group, the group list and the feed. */
async function refreshGroup(queryClient: QueryClient, groupId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.group(groupId) }),
    queryClient.invalidateQueries({ queryKey: keys.groups }),
    queryClient.invalidateQueries({ queryKey: keys.activity }),
  ]);
}

// ---- Session -------------------------------------------------------------------------------

/** The signed-in user, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>('/auth/me')).user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.post<{ user: User }>('/auth/login', input).then((r) => r.user),
    onSuccess: (user) => {
      queryClient.clear();
      queryClient.setQueryData(keys.me, user);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; email: string; password: string }) =>
      api.post<{ user: User }>('/auth/register', input).then((r) => r.user),
    onSuccess: (user) => {
      queryClient.clear();
      queryClient.setQueryData(keys.me, user);
    },
  });
}

export function useLogout(everywhere = false) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>(everywhere ? '/auth/logout-all' : '/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(keys.me, null);
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; upiId?: string | null; emailReminders?: boolean }) =>
      api.patch<{ user: User }>('/auth/me', input).then((r) => r.user),
    onSuccess: async (user) => {
      queryClient.setQueryData(keys.me, user);
      // Names and UPI IDs appear inside every group.
      await queryClient.invalidateQueries({ queryKey: ['group'] });
    },
  });
}

// ---- Groups --------------------------------------------------------------------------------

export const useGroups = () =>
  useQuery({
    queryKey: keys.groups,
    queryFn: () => api.get<{ groups: GroupSummary[] }>('/groups').then((r) => r.groups),
  });

export const useGroup = (groupId: string) =>
  useQuery({
    queryKey: keys.group(groupId),
    queryFn: () => api.get<{ group: Group }>(`/groups/${groupId}`).then((r) => r.group),
  });

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; currency: string }) =>
      api.post<{ group: Group }>('/groups', input).then((r) => r.group),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.groups }),
  });
}

export function useRenameGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.patch<{ group: Group }>(`/groups/${groupId}`, { name }),
    onSuccess: () => refreshGroup(queryClient, groupId),
  });
}

export function useResetInvite(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ inviteCode: string }>(`/groups/${groupId}/invite/reset`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.group(groupId) }),
  });
}

export const useInvite = (code: string) =>
  useQuery({
    queryKey: keys.invite(code),
    queryFn: () => api.get<InvitePreview>(`/invites/${code}`),
    retry: false,
  });

export function useJoinGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      api.post<{ groupId: string; joined: boolean }>(`/invites/${code}/join`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.groups }),
  });
}

export const useBalances = (groupId: string) =>
  useQuery({
    queryKey: keys.balances(groupId),
    queryFn: () => api.get<BalanceSummary>(`/groups/${groupId}/balances`),
  });

export const useStats = (groupId: string, months: number) =>
  useQuery({
    queryKey: keys.stats(groupId, months),
    queryFn: () => api.get<Stats>(`/groups/${groupId}/stats?months=${months}`),
    placeholderData: (previous) => previous, // keep the old charts on screen while refetching
  });

// ---- Activity ------------------------------------------------------------------------------

function activityQuery(path: string, queryKey: readonly unknown[]) {
  return {
    queryKey,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      api.get<Page<Activity>>(`${path}${query({ limit: '20', cursor: pageParam })}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last: Page<Activity>) => last.nextCursor,
  };
}

export const useActivity = () => useInfiniteQuery(activityQuery('/activity', keys.activity));

export const useGroupActivity = (groupId: string) =>
  useInfiniteQuery(activityQuery(`/groups/${groupId}/activity`, keys.groupActivity(groupId)));

// ---- Expenses ------------------------------------------------------------------------------

export const useExpenses = (groupId: string, filters: ExpenseFilters) =>
  useInfiniteQuery({
    queryKey: keys.expenses(groupId, filters),
    queryFn: ({ pageParam }) =>
      api.get<Page<Expense>>(
        `/groups/${groupId}/expenses${query({ limit: '30', cursor: pageParam, ...filters })}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: (previous) => previous,
  });

export const useExpense = (groupId: string, expenseId: string | null) =>
  useQuery({
    queryKey: keys.expense(groupId, expenseId ?? ''),
    queryFn: () =>
      api
        .get<{ expense: Expense }>(`/groups/${groupId}/expenses/${expenseId}`)
        .then((r) => r.expense),
    enabled: expenseId !== null,
  });

export function useSaveExpense(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, input }: { id?: string; version?: number; input: ExpenseInput }) =>
      (id
        ? api.put<{ expense: Expense }>(`/groups/${groupId}/expenses/${id}`, { ...input, version })
        : api.post<{ expense: Expense }>(`/groups/${groupId}/expenses`, input)
      ).then((r) => r.expense),
    onSuccess: () => refreshGroup(queryClient, groupId),
  });
}

export function useDeleteExpense(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) => api.delete(`/groups/${groupId}/expenses/${expenseId}`),
    onSuccess: () => refreshGroup(queryClient, groupId),
  });
}

export function useUploadReceipt(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ expenseId, file }: { expenseId: string; file: File }) => {
      const form = new FormData();
      form.append('receipt', file);
      return api.post<{ expense: Expense }>(
        `/groups/${groupId}/expenses/${expenseId}/receipt`,
        form,
      );
    },
    onSuccess: () => refreshGroup(queryClient, groupId),
  });
}

export function useRemoveReceipt(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) =>
      api.delete(`/groups/${groupId}/expenses/${expenseId}/receipt`),
    onSuccess: () => refreshGroup(queryClient, groupId),
  });
}

export const receiptUrl = (groupId: string, expenseId: string) =>
  `/api/groups/${groupId}/expenses/${expenseId}/receipt`;

// ---- Settlements ---------------------------------------------------------------------------

export const useSettlements = (groupId: string) =>
  useQuery({
    queryKey: keys.settlements(groupId),
    queryFn: () =>
      api.get<{ items: Settlement[] }>(`/groups/${groupId}/settlements`).then((r) => r.items),
  });

export function useRecordPayment(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      from: string;
      to: string;
      amount: number;
      method: PaymentMethod;
      note?: string;
    }) => api.post<{ settlement: Settlement }>(`/groups/${groupId}/settlements`, input),
    onSuccess: () => refreshGroup(queryClient, groupId),
  });
}

export function useUndoPayment(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settlementId: string) =>
      api.delete(`/groups/${groupId}/settlements/${settlementId}`),
    onSuccess: () => refreshGroup(queryClient, groupId),
  });
}
