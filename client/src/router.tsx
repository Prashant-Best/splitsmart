import { createBrowserRouter } from 'react-router';
import { AppShell, RequireAuth } from './components/AppShell';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { GroupPage } from './pages/GroupPage';
import { JoinPage } from './pages/JoinPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage, RouteErrorPage } from './pages/StatusPages';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorPage /> },
  { path: '/register', element: <RegisterPage />, errorElement: <RouteErrorPage /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'groups/:groupId', element: <GroupPage /> },
          { path: 'join/:code', element: <JoinPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
