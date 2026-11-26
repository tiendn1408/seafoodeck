import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUSY, errorStatus, errorBody } from './errors';

test('the Errors filter maps every serialization conflict to 409 with a retry message', () => {
  // `code: 'BUSY'` tells clients this 409 is transient (retry with the same key); every
  // other 409 (ConflictException) has no code and is final.
  const busy = { message: 'Hệ thống đang bận, vui lòng thử lại.', code: 'BUSY' };
  assert.equal(BUSY, busy.message);
  const adapter = Object.assign(new Error('write conflict'), {
    cause: { kind: 'TransactionWriteConflict', originalCode: '40001' },
  });
  const p2034 = Object.assign(new Error('conflict'), { code: 'P2034' });
  for (const e of [adapter, p2034]) {
    assert.equal(errorStatus(e), 409);
    assert.deepEqual(errorBody(e), busy);
  }
  assert.equal(errorStatus(Object.assign(new Error('dup'), { code: 'P2002' })), 409);
  assert.equal(errorStatus(Object.assign(new Error('gone'), { code: 'P2025' })), 404);
  assert.equal(errorStatus(Object.assign(new Error('down'), { code: 'P1001' })), 503);
  assert.equal(errorStatus(new Error('boom')), 500);
  assert.deepEqual(errorBody(new Error('boom')), {
    message: 'Lỗi máy chủ. Thử lại sau.',
  });
});
