/**
 * A binary heap (priority queue) stored in an array.
 *
 * `before(a, b)` returns true when `a` should come out before `b`, so the same class is a
 * max-heap or a min-heap depending on the comparator. Element i has children 2i+1 and 2i+2.
 *
 * push and pop are O(log n); building from an existing list is O(n) (bottom-up heapify).
 */
export class BinaryHeap<T> {
  private readonly items: T[];
  private readonly before: (a: T, b: T) => boolean;

  constructor(before: (a: T, b: T) => boolean, initial: Iterable<T> = []) {
    this.before = before;
    this.items = [...initial];
    for (let i = (this.items.length >> 1) - 1; i >= 0; i--) this.siftDown(i);
  }

  get size(): number {
    return this.items.length;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  push(item: T): void {
    this.items.push(item);
    this.siftUp(this.items.length - 1);
  }

  pop(): T | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop() as T;
    if (items.length > 0) {
      items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(index: number): void {
    const items = this.items;
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(items[i] as T, items[parent] as T)) return;
      this.swap(i, parent);
      i = parent;
    }
  }

  private siftDown(index: number): void {
    const items = this.items;
    const n = items.length;
    let i = index;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let best = i;
      if (left < n && this.before(items[left] as T, items[best] as T)) best = left;
      if (right < n && this.before(items[right] as T, items[best] as T)) best = right;
      if (best === i) return;
      this.swap(i, best);
      i = best;
    }
  }

  private swap(i: number, j: number): void {
    const items = this.items;
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
}
