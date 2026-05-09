export type HtmlDocumentResponse = {
  html: string;
  contentType: string;
  contentDisposition: string | null;
  filename: string | null;
};

export function parseContentDispositionFilename(contentDisposition: string | null) {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  return plainMatch?.[1]?.trim() ?? null;
}

export type HtmlPreviewWindow = {
  document: Pick<Document, 'open' | 'write' | 'close'>;
  focus: () => void;
};

export type OpenHtmlDocumentPreviewResult =
  | { ok: true }
  | { ok: false; reason: 'popup-blocked' | 'unsupported-document' };

export function openHtmlDocumentPreview(
  documentResponse: HtmlDocumentResponse,
  previewWindow: HtmlPreviewWindow | null,
): OpenHtmlDocumentPreviewResult {
  if (!documentResponse.contentType.toLowerCase().includes('text/html')) {
    return { ok: false, reason: 'unsupported-document' };
  }

  if (!previewWindow) {
    return { ok: false, reason: 'popup-blocked' };
  }

  previewWindow.document.open();
  previewWindow.document.write(documentResponse.html);
  previewWindow.document.close();
  previewWindow.focus();

  return { ok: true };
}
