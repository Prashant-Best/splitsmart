import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { group, mockFetch, renderWithApp, sentBody } from '../test/render';
import { SettleUpDialog } from './SettleUpDialog';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettleUpDialog', () => {
  it('builds a UPI link and QR code for the suggested payment, then records it', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({ settlement: { id: 's1' } }, 201);
    const onOpenChange = vi.fn();
    renderWithApp(
      <SettleUpDialog
        open
        onOpenChange={onOpenChange}
        group={group}
        initial={{ from: 'a1', to: 'b2', amount: 125_050 }}
      />,
    );

    expect(screen.getByTestId('upi-link')).toHaveAttribute(
      'href',
      'upi://pay?pa=bala@okhdfcbank&pn=Bala%20Iyer&am=1250.50&cu=INR&tn=SplitSmart%3A%20Goa%20Trip',
    );
    expect(screen.getByTitle('UPI QR code to pay Bala Iyer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/groups/g1/settlements');
    expect(sentBody(fetchMock)).toEqual({ from: 'a1', to: 'b2', amount: 125_050, method: 'upi' });
  });

  it('explains when the receiver has no UPI ID and defaults to cash', () => {
    mockFetch({});
    renderWithApp(
      <SettleUpDialog
        open
        onOpenChange={vi.fn()}
        group={group}
        initial={{ from: 'a1', to: 'c3', amount: 5_000 }}
      />,
    );
    expect(screen.queryByTestId('upi-link')).not.toBeInTheDocument();
    expect(screen.getByText(/Chirag Das has not added a UPI ID yet/)).toBeInTheDocument();
    expect(screen.getByLabelText('Paid with')).toHaveValue('cash');
  });
});
