import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { ApiError } from './api/client';
import { keys } from './api/queries';
import './index.css';
import { router } from './router';

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    // A 401 from any request means the session ended: forget the user, which shows sign-in.
    onError: (error, query) => {
      if (error instanceof ApiError && error.status === 401 && query.queryKey[0] !== 'me') {
        queryClient.setQueryData(keys.me, null);
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry network and server errors, not 4xx answers that will not change.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  </StrictMode>,
);
