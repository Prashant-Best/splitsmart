import { isValidUpiId } from '@domain';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ApiError, errorMessage } from '../api/client';
import { useLogout, useUpdateProfile } from '../api/queries';
import { useCurrentUser } from '../auth';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { Card, CardHeader } from '../components/ui/Misc';

export function SettingsPage() {
  const user = useCurrentUser();
  const update = useUpdateProfile();
  const logoutAll = useLogout(true);
  const [name, setName] = useState(user.name);
  const [upiId, setUpiId] = useState(user.upiId ?? '');

  const upiError =
    upiId.trim() && !isValidUpiId(upiId.trim()) ? 'Enter a UPI ID like name@okhdfcbank' : null;
  const serverError = (field: string) =>
    update.error instanceof ApiError
      ? (update.error.details.find((d) => d.path === field)?.message ?? null)
      : null;
  const dirty = name.trim() !== user.name || upiId.trim() !== (user.upiId ?? '');

  const saveProfile = (event: FormEvent) => {
    event.preventDefault();
    update.mutate(
      { name: name.trim(), upiId: upiId.trim() || null },
      { onSuccess: () => toast.success('Profile saved') },
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader title="Profile" description={`Signed in as ${user.email}`} />
        <form onSubmit={saveProfile} className="space-y-4 p-5">
          <Field label="Name" htmlFor="settings-name" error={serverError('name')}>
            <Input
              id="settings-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
          </Field>
          <Field
            label="UPI ID"
            htmlFor="settings-upi"
            hint="Friends who owe you get a UPI link and QR code that pays this ID."
            error={upiError ?? serverError('upiId')}
          >
            <Input
              id="settings-upi"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="yourname@okicici"
              aria-invalid={Boolean(upiError)}
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!dirty || Boolean(upiError) || !name.trim()}
              loading={update.isPending}
            >
              Save profile
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Email reminders" />
        <label className="flex items-start gap-3 p-5">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-teal-600"
            checked={user.emailReminders}
            onChange={(e) =>
              update.mutate(
                { emailReminders: e.target.checked },
                {
                  onSuccess: (u) =>
                    toast.success(
                      u.emailReminders ? 'Weekly reminders on' : 'Weekly reminders off',
                    ),
                  onError: (error) => toast.error(errorMessage(error)),
                },
              )
            }
          />
          <span className="text-sm">
            <span className="font-medium text-slate-900">Weekly email when I owe money</span>
            <span className="mt-0.5 block text-slate-500">
              Every Monday morning: whom to pay in each group, with UPI links. Nothing is sent when
              you are settled up.
            </span>
          </span>
        </label>
      </Card>

      <Card>
        <CardHeader title="Security" />
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-slate-600">
            Lost a phone or used a shared computer? Sign out of every device at once.
          </p>
          <Button
            variant="secondary"
            loading={logoutAll.isPending}
            onClick={() =>
              logoutAll.mutate(undefined, { onError: (error) => toast.error(errorMessage(error)) })
            }
          >
            Sign out everywhere
          </Button>
        </div>
      </Card>
    </div>
  );
}
