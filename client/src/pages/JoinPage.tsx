import { Link2Off, Users } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '../api/client';
import { useInvite, useJoinGroup } from '../api/queries';
import { Button } from '../components/ui/Button';
import { Card, EmptyState, Spinner } from '../components/ui/Misc';
import { buttonClass } from '../components/ui/styles';

export function JoinPage() {
  const { code = '' } = useParams();
  const invite = useInvite(code);
  const join = useJoinGroup();
  const navigate = useNavigate();

  if (invite.isPending) return <Spinner />;
  if (invite.error || !invite.data) {
    return (
      <Card className="mx-auto max-w-md">
        <EmptyState
          icon={Link2Off}
          title="This invite link does not work"
          action={
            <Link to="/" className={buttonClass('secondary')}>
              Go to your groups
            </Link>
          }
        >
          The group owner may have reset it. Ask them for a new link.
        </EmptyState>
      </Card>
    );
  }

  const { group, alreadyMember } = invite.data;
  return (
    <Card className="mx-auto max-w-md p-8 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-teal-50 text-teal-700">
        <Users className="size-7" aria-hidden />
      </span>
      <p className="mt-4 text-sm text-slate-500">You are invited to join</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{group.name}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'} · {group.currency}
      </p>
      {alreadyMember ? (
        <Link to={`/groups/${group.id}`} className={buttonClass('primary', 'lg', 'mt-6 w-full')}>
          You are already a member. Open the group
        </Link>
      ) : (
        <Button
          size="lg"
          className="mt-6 w-full"
          loading={join.isPending}
          onClick={() =>
            join.mutate(code, {
              onSuccess: (result) => {
                toast.success(`You joined ${group.name}`);
                void navigate(`/groups/${result.groupId}`, { replace: true });
              },
              onError: (error) => toast.error(errorMessage(error)),
            })
          }
        >
          Join group
        </Button>
      )}
    </Card>
  );
}
