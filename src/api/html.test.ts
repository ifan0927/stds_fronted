import { describe, expect, it, vi } from 'vitest';
import { openHtmlDocumentPreview } from './html';

describe('openHtmlDocumentPreview', () => {
  it('writes backend-owned HTML into the provided preview window', () => {
    const previewWindow = {
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
      },
      focus: vi.fn(),
    };

    expect(
      openHtmlDocumentPreview(
        {
          html: '<!doctype html><title>收據</title>',
          contentType: 'text/html; charset=utf-8',
          contentDisposition: null,
          filename: null,
        },
        previewWindow,
      ),
    ).toEqual({ ok: true });
    expect(previewWindow.document.write).toHaveBeenCalledWith('<!doctype html><title>收據</title>');
    expect(previewWindow.focus).toHaveBeenCalled();
  });

  it('reports blocked preview windows without throwing', () => {
    expect(
      openHtmlDocumentPreview(
        {
          html: '<!doctype html>',
          contentType: 'text/html',
          contentDisposition: null,
          filename: null,
        },
        null,
      ),
    ).toEqual({ ok: false, reason: 'popup-blocked' });
  });

  it('rejects non-HTML documents so PDF conversion stays a later explicit issue', () => {
    expect(
      openHtmlDocumentPreview(
        {
          html: '%PDF-1.4',
          contentType: 'application/pdf',
          contentDisposition: null,
          filename: 'receipt.pdf',
        },
        null,
      ),
    ).toEqual({ ok: false, reason: 'unsupported-document' });
  });
});
