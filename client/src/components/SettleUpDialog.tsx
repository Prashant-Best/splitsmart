import { buildUpiLink, isValidUpiId } from '@domain';
import { Copy, ExternalLink, Info } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../api/client';
import { useRecordPayment } from '../api/queries';
import type { Group, PaymentMethod, Transfer } from '../api/types';
import { useCurrentUser } from '../auth';
import { currencySymbol, formatMoney, parseDecimal2, toDecimalString } from '../lib/format';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Field, MoneyInput, Select } from './ui/Field';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
];

export function SettleUpDialog({
  open,
  onOpenChange,
  group,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Group;
  /** A suggested payment from the simplified plan. */
  initial?: Transfer;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Settle up"
      description="Pay through any UPI app, then record the payment so balances update for everyone."
    >
      <SettleUpForm group={group} initial={initial} onDone={() => onOpenChange(false)} />
    </Dialog>
  );
}

function SettleUpForm({
  group,
  initial,
  onDone,
}: {
  group: Group;
  initial?: Transfer;
  onDone: () => void;
}) {
  const me = useCurrentUser();
  const others = group.members.filter((m) => m.id !== me.id);
  const [from, setFrom] = useState(initial?.from ?? me.id);
  const [to, setTo] = useState(initial?.to ?? others[0]?.id ?? '');
  const [amount, setAmount] = useState(initial ? toDecimalString(initial.amount) : '');
  const record = useRecordPayment(group.id);

  const receiver = group.members.find((m) => m.id === to);
  const payer = group.members.find((m) => m.id === from);
  const paise = parseDecimal2(amount);
  const valid = paise !== null && paise > 0 && from !== to;
  const upiReady = group.currency === 'INR' && receiver?.upiId && isValidUpiId(receiver.upiId);
  const upiLink =
    valid && upiReady && receiver?.upiId
      ? buildUpiLink({
          upiId: receiver.upiId,
          payeeName: receiver.name,
          amount: paise,
          note: `SplitSmart: ${group.name}`,
        })
      : null;
  const [method, setMethod] = useState<PaymentMethod>(upiReady ? 'upi' : 'cash');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || paise === null) return;
    record.mutate(
      { from, to, amount: paise, method },
      {
        onSuccess: () => {
          toast.success(
            `Recorded: ${payer?.name} paid ${receiver?.name} ${formatMoney(paise, group.currency)}`,
          );
          onDone();
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From" htmlFor="settle-from">
          <Select id="settle-from" value={from} onChange={(e) => setFrom(e.target.value)}>
            {group.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === me.id ? `${m.name} (you)` : m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="To"
          htmlFor="settle-to"
          error={from === to ? 'Choose two different people' : null}
        >
          <Select id="settle-to" value={to} onChange={(e) => setTo(e.target.value)}>
            {group.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === me.id ? `${m.name} (you)` : m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" htmlFor="settle-amount">
          <MoneyInput
            id="settle-amount"
            symbol={currencySymbol(group.currency)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Paid with" htmlFor="settle-method">
          <Select
            id="settle-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {upiLink && receiver?.upiId ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-start">
          <div className="rounded-xl bg-white p-2 shadow-xs">
            <QRCodeSVG
              value={upiLink}
              size={156}
              level="M"
              marginSize={1}
              title={`UPI QR code to pay ${receiver.name}`}
            />
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-slate-900">
              Pay {receiver.name} {formatMoney(paise ?? 0, group.currency)} with UPI
            </p>
            <p className="mt-1 text-slate-600">
              Scan with GPay, PhonePe, Paytm or any UPI app, or open the link on your phone. Then
              record the payment below.
            </p>
            <p className="mt-2 flex items-center gap-2 text-slate-600">
              UPI ID{' '}
              <code className="rounded bg-white px-1.5 py-0.5 text-slate-900">
                {receiver.upiId}
              </code>
              <button
                type="button"
                className="text-slate-500 hover:text-teal-700"
                aria-label="Copy UPI ID"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(receiver.upiId ?? '')
                    .then(() => toast.success('UPI ID copied'))
                }
              >
                <Copy className="size-4" />
              </button>
            </p>
            <a
              href={upiLink}
              className="mt-3 inline-flex items-center gap-1.5 font-medium text-teal-700 hover:underline"
              data-testid="upi-link"
            >
              Open in UPI app <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </div>
      ) : (
        receiver &&
        group.currency === 'INR' &&
        !upiReady && (
          <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {receiver.name} has not added a UPI ID yet, so there is no UPI link. You can still
            record a cash or bank payment.
          </p>
        )
      )}

      {record.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {errorMessage(record.error)}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid} loading={record.isPending}>
          Record payment
        </Button>
      </div>
    </form>
  );
}
