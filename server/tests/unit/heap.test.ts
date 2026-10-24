import fc from 'fast-check';
import { BinaryHeap } from '../../src/domain';
import { RUNS } from '../helpers/arbitraries';

const maxFirst = (a: number, b: number): boolean => a > b;

function drain(heap: BinaryHeap<number>): number[] {
  const out: number[] = [];
  while (heap.size > 0) out.push(heap.pop()!);
  return out;
}

describe('BinaryHeap', () => {
  it('returns undefined when empty', () => {
    const heap = new BinaryHeap(maxFirst);
    expect(heap.size).toBe(0);
    expect(heap.peek()).toBeUndefined();
    expect(heap.pop()).toBeUndefined();
  });

  it('works as a min-heap with the opposite comparator', () => {
    const heap = new BinaryHeap<number>((a, b) => a < b, [5, 1, 4, 2, 3]);
    expect(heap.peek()).toBe(1);
    expect(drain(heap)).toEqual([1, 2, 3, 4, 5]);
  });

  it('pops pushed values in sorted order', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (values) => {
        const heap = new BinaryHeap(maxFirst);
        values.forEach((v) => heap.push(v));
        expect(drain(heap)).toEqual([...values].sort((a, b) => b - a));
      }),
      { numRuns: RUNS },
    );
  });

  it('heapifies an initial array in place (O(n) build)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (values) => {
        expect(drain(new BinaryHeap(maxFirst, values))).toEqual([...values].sort((a, b) => b - a));
      }),
      { numRuns: RUNS },
    );
  });

  it('matches a sorted-array model under any mix of pushes and pops', () => {
    const op = fc.oneof(
      fc.integer().map((v) => ({ push: v })),
      fc.constant({ push: null }),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 200 }), (ops) => {
        const heap = new BinaryHeap(maxFirst);
        const model: number[] = [];
        for (const { push } of ops) {
          if (push === null) {
            model.sort((a, b) => b - a);
            expect(heap.pop()).toBe(model.shift());
          } else {
            heap.push(push);
            model.push(push);
          }
          expect(heap.size).toBe(model.length);
        }
      }),
      { numRuns: RUNS },
    );
  });
});
