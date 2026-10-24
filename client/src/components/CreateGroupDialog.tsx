import { CURRENCIES } from '@domain';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '../api/client';
import { useCreateGroup } from '../api/queries';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Field, Input, Select } from './ui/Field';

export function CreateGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<string>('INR');
  const create = useCreateGroup();
  const navigate = useNavigate();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      { name, currency },
      {
        onSuccess: (group) => {
          toast.success(`Created ${group.name}. Invite your friends next.`);
          onOpenChange(false);
          setName('');
          void navigate(`/groups/${group.id}`);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New group"
      description="A trip, a flat, a team lunch: anything you share costs in."
      size="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Group name"
          htmlFor="group-name"
          error={create.error ? errorMessage(create.error) : null}
        >
          <Input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Goa trip, Flat 302…"
            maxLength={60}
            autoFocus
            required
          />
        </Field>
        <Field
          label="Currency"
          htmlFor="group-currency"
          hint="UPI payments are available for INR groups."
        >
          <Select
            id="group-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
            Create group
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
