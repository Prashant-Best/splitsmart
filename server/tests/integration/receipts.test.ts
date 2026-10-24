import { readdir } from 'node:fs/promises';
import { config } from '../../src/config';
import { equalExpense, makeGroup, signUp, useTestDb, type TestUser } from '../helpers/api';

useTestDb();

// A tiny PNG (the server identifies it by its 8-byte signature).
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d49444154789c636000020000050001e9fadcd80000000049454e44ae426082',
  'hex',
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');

let asha: TestUser;
let bala: TestUser;
let receiptUrl: string;

beforeEach(async () => {
  asha = await signUp('Asha');
  bala = await signUp('Bala');
  const { id } = await makeGroup(asha, [bala]);
  const res = await asha.agent
    .post(`/api/groups/${id}/expenses`)
    .send(equalExpense(asha, [asha, bala], 50_000, 'Groceries'))
    .expect(201);
  receiptUrl = `/api/groups/${id}/expenses/${res.body.expense.id}/receipt`;
});

const filesOnDisk = async () => (await readdir(config.uploadDir).catch(() => [])).length;

describe('receipts', () => {
  it('uploads a photo and serves it back to group members only', async () => {
    const upload = await asha.agent
      .post(receiptUrl)
      .attach('receipt', PNG, { filename: 'bill.png', contentType: 'image/png' })
      .expect(201);
    expect(upload.body.expense.receipt).toMatchObject({ mimeType: 'image/png', size: PNG.length });
    expect(JSON.stringify(upload.body)).not.toMatch(/key/);

    const download = await bala.agent.get(receiptUrl).buffer(true).expect(200);
    expect(download.headers['content-type']).toBe('image/png');
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(download.body as Buffer, PNG)).toBe(0);

    const eve = await signUp('Eve');
    await eve.agent.get(receiptUrl).expect(404);
  });

  it('identifies files by their bytes, not by name or Content-Type', async () => {
    const fake = await asha.agent
      .post(receiptUrl)
      .attach('receipt', Buffer.from('<script>alert(1)</script>'), {
        filename: 'bill.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(fake.body.error.code).toBe('UNSUPPORTED_FILE');

    const pdf = await asha.agent
      .post(receiptUrl)
      .attach('receipt', PDF, { filename: 'invoice', contentType: 'application/octet-stream' })
      .expect(201);
    expect(pdf.body.expense.receipt.mimeType).toBe('application/pdf');
  });

  it('rejects files over the size limit', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(config.maxReceiptBytes)]);
    const res = await asha.agent
      .post(receiptUrl)
      .attach('receipt', big, { filename: 'huge.png', contentType: 'image/png' })
      .expect(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('replaces and removes receipts without leaving files behind', async () => {
    const before = await filesOnDisk();
    await asha.agent.post(receiptUrl).attach('receipt', PNG, 'one.png').expect(201);
    await asha.agent.post(receiptUrl).attach('receipt', PDF, 'two.pdf').expect(201);
    expect(await filesOnDisk()).toBe(before + 1);

    await bala.agent.delete(receiptUrl).expect(204);
    expect(await filesOnDisk()).toBe(before);
    await bala.agent.get(receiptUrl).expect(404);
    await bala.agent.delete(receiptUrl).expect(404);
  });

  it('requires a file in the "receipt" field', async () => {
    await asha.agent.post(receiptUrl).field('note', 'no file').expect(400);
  });
});
