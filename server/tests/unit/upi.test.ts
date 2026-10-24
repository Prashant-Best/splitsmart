import { buildUpiLink, isValidUpiId } from '../../src/domain';

describe('UPI links', () => {
  it('builds a upi://pay link with the amount in rupees and an encoded name', () => {
    expect(buildUpiLink({ upiId: 'meera@okaxis', payeeName: 'Meera Iyer', amount: 125_050 })).toBe(
      'upi://pay?pa=meera@okaxis&pn=Meera%20Iyer&am=1250.50&cu=INR',
    );
  });

  it('adds a short note and encodes special characters', () => {
    const link = buildUpiLink({
      upiId: '9876543210@ybl',
      payeeName: 'Rohan',
      amount: 99,
      note: 'SplitSmart: Goa & Gokarna',
    });
    expect(link).toBe(
      'upi://pay?pa=9876543210@ybl&pn=Rohan&am=0.99&cu=INR&tn=SplitSmart%3A%20Goa%20%26%20Gokarna',
    );
  });

  it.each(['meera@okaxis', 'first.last-1@oksbi', '9876543210@paytm'])('accepts %p', (id) => {
    expect(isValidUpiId(id)).toBe(true);
  });

  it.each(['meera', '@okaxis', 'meera@', 'meera@ok axis', 'a@b', 'x@1bank'])('rejects %p', (id) => {
    expect(isValidUpiId(id)).toBe(false);
  });

  it('refuses invalid amounts and UPI IDs', () => {
    expect(() => buildUpiLink({ upiId: 'meera@okaxis', payeeName: 'M', amount: 0 })).toThrow();
    expect(() => buildUpiLink({ upiId: 'meera@okaxis', payeeName: 'M', amount: 1.5 })).toThrow();
    expect(() => buildUpiLink({ upiId: 'not-an-id', payeeName: 'M', amount: 100 })).toThrow();
  });
});
