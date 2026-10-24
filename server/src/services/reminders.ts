import { config } from '../config';
import { buildUpiLink, formatMoney, isValidUpiId, simplifyDebts, type Currency } from '../domain';
import { logger } from '../logger';
import {
  Group,
  isDuplicateKeyError,
  ReminderLog,
  User,
  type GroupDoc,
  type UserDoc,
} from '../models';
import type { MailMessage, Mailer } from './mailer';

/** ISO-8601 week of `date` in `timeZone`, e.g. "2026-W43" (weeks start on Monday). */
export function isoWeek(date: Date, timeZone: string): string {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .split('-')
    .map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d));
  // The ISO year and week are those of the Thursday in the same week.
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

export interface Debt {
  groupId: string;
  groupName: string;
  currency: Currency;
  toName: string;
  toUpiId?: string;
  amount: number;
}

/** The weekly email for one person: whom to pay in each group, with UPI links where possible. */
export function buildReminderEmail(
  user: { name: string; email: string },
  debts: Debt[],
  appUrl: string,
): MailMessage {
  const totals = new Map<Currency, number>();
  for (const debt of debts)
    totals.set(debt.currency, (totals.get(debt.currency) ?? 0) + debt.amount);
  const totalText = [...totals]
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(' + ');
  const groupCount = new Set(debts.map((d) => d.groupId)).size;
  const subject = `Reminder: you owe ${totalText} in ${groupCount} SplitSmart group${groupCount > 1 ? 's' : ''}`;

  const upiLink = (debt: Debt) =>
    debt.currency === 'INR' && debt.toUpiId && isValidUpiId(debt.toUpiId)
      ? buildUpiLink({
          upiId: debt.toUpiId,
          payeeName: debt.toName,
          amount: debt.amount,
          note: `SplitSmart: ${debt.groupName}`,
        })
      : null;

  const rows = debts
    .map((debt) => {
      const link = upiLink(debt);
      const groupUrl = `${appUrl}/groups/${debt.groupId}?tab=balances`;
      const action = link
        ? `<a href="${escapeHtml(link)}" style="color:#0f766e;font-weight:600">Pay with UPI</a> &middot; <a href="${groupUrl}" style="color:#0f766e">Open group</a>`
        : `<a href="${groupUrl}" style="color:#0f766e;font-weight:600">Settle up</a>`;
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">${escapeHtml(debt.groupName)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">Pay ${escapeHtml(debt.toName)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;text-align:right">${formatMoney(debt.amount, debt.currency)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">${action}</td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
    <h1 style="margin:0 0 4px;font-size:20px;color:#0f766e">SplitSmart</h1>
    <p style="margin:0 0 16px">Hi ${escapeHtml(user.name)}, here is what you still owe. Settling up takes a minute.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr style="text-align:left;color:#475569">
        <th style="padding:8px 12px">Group</th><th style="padding:8px 12px">Payment</th>
        <th style="padding:8px 12px;text-align:right">Amount</th><th style="padding:8px 12px"></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:16px 0 0;font-size:14px">Total: <strong>${totalText}</strong></p>
    <p style="margin:24px 0 0;font-size:12px;color:#64748b">You get this weekly email because you have unsettled balances.
      <a href="${appUrl}/settings" style="color:#64748b">Turn reminders off</a>.</p>
  </div>
</body></html>`;

  const text = [
    `Hi ${user.name}, here is what you still owe on SplitSmart:`,
    '',
    ...debts.map((debt) => {
      const link = upiLink(debt);
      return `- ${debt.groupName}: pay ${debt.toName} ${formatMoney(debt.amount, debt.currency)}${link ? ` (UPI: ${link})` : ''}`;
    }),
    '',
    `Total: ${totalText}`,
    `Settle up: ${appUrl}`,
    `Turn reminders off: ${appUrl}/settings`,
  ].join('\n');

  return { to: user.email, subject, html, text };
}

/**
 * The weekly reminder job. For every group where someone owes money, it takes the simplified
 * settle-up plan and emails each debtor whom to pay. A unique (user, week) log row is inserted
 * before sending, so each person gets at most one email per week even if the job runs twice or
 * on two servers; if sending fails the row is removed so the next run retries.
 */
export async function sendWeeklyReminders(options: {
  mailer: Mailer;
  now?: Date;
  minAmount?: number;
}) {
  const now = options.now ?? new Date();
  const minAmount = options.minAmount ?? 100; // ignore debts below ₹1
  const period = isoWeek(now, config.remindersTimezone);

  const groups = await Group.find({
    members: { $elemMatch: { balance: { $lte: -minAmount } } },
  }).lean<GroupDoc[]>();
  const memberIds = [...new Set(groups.flatMap((g) => g.members.map((m) => m.user.toString())))];
  const users = new Map(
    (
      await User.find({ _id: { $in: memberIds } })
        .select('name email upiId emailReminders')
        .lean<Pick<UserDoc, '_id' | 'name' | 'email' | 'upiId' | 'emailReminders'>[]>()
    ).map((u) => [u._id.toString(), u]),
  );

  const debtsByUser = new Map<string, Debt[]>();
  for (const group of groups) {
    const plan = simplifyDebts(group.members.map((m) => [m.user.toString(), m.balance] as const));
    for (const payment of plan) {
      if (payment.amount < minAmount) continue;
      const receiver = users.get(payment.to);
      const debts = debtsByUser.get(payment.from) ?? [];
      debts.push({
        groupId: group._id.toString(),
        groupName: group.name,
        currency: group.currency,
        toName: receiver?.name ?? 'a group member',
        toUpiId: receiver?.upiId,
        amount: payment.amount,
      });
      debtsByUser.set(payment.from, debts);
    }
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const [userId, debts] of debtsByUser) {
    const user = users.get(userId);
    if (!user || !user.emailReminders) {
      skipped++;
      continue;
    }
    try {
      await ReminderLog.create({
        user: userId,
        period,
        totalOwed: debts.reduce((sum, d) => sum + d.amount, 0),
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        skipped++; // already reminded this week
        continue;
      }
      throw err;
    }
    try {
      await options.mailer.send(buildReminderEmail(user, debts, config.appUrl));
      sent++;
    } catch (err) {
      failed++;
      await ReminderLog.deleteOne({ user: userId, period });
      logger.error({ err, userId }, 'Reminder email failed');
    }
  }
  return { period, groups: groups.length, sent, skipped, failed };
}
