import { toDecimalString } from './money';

/** A UPI ID (virtual payment address), e.g. "prashant@okicici" or "9876543210@ybl". */
export const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

export function isValidUpiId(value: string): boolean {
  return UPI_ID_PATTERN.test(value);
}

export interface UpiPayment {
  /** The receiver's UPI ID. */
  upiId: string;
  /** The receiver's name, shown by the UPI app. */
  payeeName: string;
  /** Amount in paise. */
  amount: number;
  /** Optional note shown in the payment, e.g. "SplitSmart: Goa Trip". */
  note?: string;
}

/**
 * Builds a `upi://pay` deep link (NPCI's UPI linking format). Opened on a phone it launches
 * GPay, PhonePe, Paytm or BHIM with the receiver and amount filled in; shown as a QR code it
 * can be scanned from a laptop screen.
 *
 * Values are percent-encoded with encodeURIComponent rather than URLSearchParams, because some
 * UPI apps do not decode "+" as a space. The "@" in the UPI ID is left readable.
 */
export function buildUpiLink({ upiId, payeeName, amount, note }: UpiPayment): string {
  if (!isValidUpiId(upiId)) throw new RangeError('Invalid UPI ID');
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError('The amount must be a positive number of paise');
  }
  const params: [string, string][] = [
    ['pa', upiId],
    ['pn', payeeName.slice(0, 50)],
    ['am', toDecimalString(amount)],
    ['cu', 'INR'],
  ];
  if (note) params.push(['tn', note.slice(0, 80)]);
  const query = params
    .map(([key, value]) => `${key}=${encodeURIComponent(value).replace(/%40/g, '@')}`)
    .join('&');
  return `upi://pay?${query}`;
}
