import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, sanitizeLogContext } from './logger';

describe('sanitizeLogContext', () => {
  it('redacts sensitive keys and omits non-primitive values', () => {
    expect(
      sanitizeLogContext({
        requestId: 'req-1',
        propertyName: '忠孝館',
        token: 'secret-token',
        tenantName: '王小明',
        payload: { raw: true },
      }),
    ).toEqual({
      requestId: 'req-1',
      propertyName: '[redacted]',
      token: '[redacted]',
      tenantName: '[redacted]',
      payload: '[omitted]',
    });
  });
});

describe('createLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not write logs when disabled for production safety', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    createLogger({ enabled: false }).info('message', { requestId: 'req-1' });

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('writes sanitized context when enabled', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    createLogger({ enabled: true }).warn('message', { authorization: 'Bearer token' });

    expect(warnSpy).toHaveBeenCalledWith('message', { authorization: '[redacted]' });
  });
});
