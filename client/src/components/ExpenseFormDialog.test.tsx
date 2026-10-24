import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { group, mockFetch, renderWithApp, sentBody } from '../test/render';
import { ExpenseFormDialog } from './ExpenseFormDialog';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ExpenseFormDialog', () => {
  it('previews shares live and sends integer paise to the API', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({ expense: { id: 'e1', description: 'Dinner' } }, 201);
    const onOpenChange = vi.fn();
    renderWithApp(<ExpenseFormDialog open onOpenChange={onOpenChange} group={group} />);

    await user.type(screen.getByLabelText('Description'), 'Dinner');
    await user.type(screen.getByLabelText('Amount'), '1000');

    const split = screen.getByRole('list', { name: 'Split between' });
    expect(within(split).getByLabelText("Asha Rao's share")).toHaveTextContent('₹333.34');
    expect(within(split).getByLabelText("Bala Iyer's share")).toHaveTextContent('₹333.33');
    expect(screen.getByRole('status')).toHaveTextContent('Adds up to ₹1,000.00 across 3 people');

    // Leave Chirag out: two people, ₹500 each.
    await user.click(screen.getByLabelText('Include Chirag Das'));
    expect(within(split).getByLabelText("Bala Iyer's share")).toHaveTextContent('₹500.00');

    await user.click(screen.getByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/groups/g1/expenses');
    expect(sentBody(fetchMock)).toEqual({
      description: 'Dinner',
      amount: 100_000,
      category: 'food',
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      notes: '',
      payers: [{ user: 'a1', amount: 100_000 }],
      split: { type: 'equal', participants: ['a1', 'b2'] },
    });
  });

  it('blocks saving until exact amounts add up', async () => {
    const user = userEvent.setup();
    mockFetch({});
    renderWithApp(<ExpenseFormDialog open onOpenChange={vi.fn()} group={group} />);

    await user.type(screen.getByLabelText('Description'), 'Cab');
    await user.type(screen.getByLabelText('Amount'), '900');
    await user.click(screen.getByRole('radio', { name: 'Exact amounts' }));
    await user.type(screen.getByLabelText('Exact amount for Asha Rao'), '500');
    await user.type(screen.getByLabelText('Exact amount for Bala Iyer'), '300');

    expect(screen.getByRole('status')).toHaveTextContent('₹100.00 left to assign');
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled();

    await user.type(screen.getByLabelText('Exact amount for Chirag Das'), '100');
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeEnabled();
  });

  it('shows the API error when saving fails', async () => {
    const user = userEvent.setup();
    mockFetch(
      {
        error: {
          code: 'NOT_A_MEMBER',
          message: 'Everyone in an expense must be a member of the group',
        },
      },
      400,
    );
    renderWithApp(<ExpenseFormDialog open onOpenChange={vi.fn()} group={group} />);

    await user.type(screen.getByLabelText('Description'), 'Snacks');
    await user.type(screen.getByLabelText('Amount'), '90');
    await user.click(screen.getByRole('button', { name: 'Add expense' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Everyone in an expense must be a member of the group',
    );
  });
});
