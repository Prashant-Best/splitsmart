import { Compass, TriangleAlert } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Card, EmptyState } from '../components/ui/Misc';
import { buttonClass } from '../components/ui/styles';

export function NotFoundPage() {
  return (
    <Card className="mx-auto max-w-md">
      <EmptyState
        icon={Compass}
        title="Page not found"
        action={
          <Link to="/" className={buttonClass('secondary')}>
            Go to your groups
          </Link>
        }
      >
        The link may be wrong or the page may have moved.
      </EmptyState>
    </Card>
  );
}

/** Shown when rendering a route throws, instead of a blank screen. */
export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="max-w-md">
        <EmptyState
          icon={TriangleAlert}
          title="Something went wrong"
          action={
            <a href="/" className={buttonClass('secondary')}>
              Reload SplitSmart
            </a>
          }
        >
          {message}
        </EmptyState>
      </Card>
    </div>
  );
}
