import { Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '../api/client';
import { useResetInvite } from '../api/queries';
import type { Group } from '../api/types';
import { useCurrentUser } from '../auth';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Input } from './ui/Field';

export function InviteDialog({
  open,
  onOpenChange,
  group,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Group;
}) {
  const me = useCurrentUser();
  const reset = useResetInvite(group.id);
  const isOwner = group.members.some((m) => m.id === me.id && m.role === 'owner');
  const link = `${window.location.origin}/join/${group.inviteCode}`;

  const copy = () =>
    void navigator.clipboard.writeText(link).then(
      () => toast.success('Invite link copied'),
      () => toast.error('Could not copy. Select the link and copy it manually.'),
    );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Invite people to ${group.name}`}
      description="Anyone with this link can join after signing in."
      size="sm"
    >
      <div className="flex gap-2">
        <Input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.target.select()} />
        <Button onClick={copy} aria-label="Copy invite link">
          <Copy className="size-4" aria-hidden /> Copy
        </Button>
      </div>
      {isOwner && (
        <div className="mt-6 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-600">
            Shared the link with the wrong people? Reset it so the old link stops working.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            loading={reset.isPending}
            onClick={() =>
              reset.mutate(undefined, {
                onSuccess: () => toast.success('New invite link created'),
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            <RefreshCw className="size-4" aria-hidden /> Reset link
          </Button>
        </div>
      )}
    </Dialog>
  );
}
