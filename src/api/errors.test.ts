import { describe, expect, it } from 'vitest';
import { ApiError, classifyApiErrorForUi, getFormErrorState } from './errors';

function apiError(status: number, errorCode: string | null = null) {
  return new ApiError({
    status,
    errorCode,
    message: 'backend error',
    details: null,
    response: new Response(null, { status }),
  });
}

describe('classifyApiErrorForUi', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [409, 'conflict'],
    [422, 'validation'],
    [500, 'retryable'],
  ] as const)('maps HTTP %s to %s', (status, kind) => {
    expect(classifyApiErrorForUi(apiError(status))).toMatchObject({ kind });
  });

  it('treats network failures as retryable without exposing transport details', () => {
    expect(classifyApiErrorForUi(new TypeError('Failed to fetch'))).toMatchObject({
      kind: 'retryable',
      title: '暫時無法完成操作',
    });
  });

  it('treats aborted requests as cancelled operations', () => {
    expect(classifyApiErrorForUi(new DOMException('Aborted', 'AbortError'))).toMatchObject({
      kind: 'cancelled',
      retryable: false,
    });
  });
});

describe('getFormErrorState', () => {
  it('maps known validation error codes to configured fields', () => {
    expect(
      getFormErrorState(apiError(422, 'VALIDATION_EMAIL_REQUIRED'), {
        VALIDATION_EMAIL_REQUIRED: 'email',
      }),
    ).toEqual({
      message: '請確認表單內容後再送出。',
      fields: [{
        name: 'email',
        errors: ['請確認表單內容後再送出。'],
      }],
    });
  });

  it('falls back to a form-level message when no field map exists', () => {
    expect(getFormErrorState(apiError(422, 'BUSINESS_RULE'))).toEqual({
      message: '請確認表單內容後再送出。',
      fields: [],
    });
  });
});
