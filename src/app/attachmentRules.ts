import type { AttachmentContentType } from '../api';

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const allowedContentTypes = new Set<AttachmentContentType>([
  'image/jpeg',
  'image/png',
  'image/heic',
  'application/pdf',
]);

export type AttachmentValidationResult =
  | { valid: true; contentType: AttachmentContentType }
  | { valid: false; message: string };

export function validateAttachmentFile(file: File): AttachmentValidationResult {
  if (!allowedContentTypes.has(file.type as AttachmentContentType)) {
    return {
      valid: false,
      message: '檔案格式不支援，請上傳 JPG、PNG、HEIC 或 PDF。',
    };
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      valid: false,
      message: '檔案大小不可超過 20MB。',
    };
  }

  return {
    valid: true,
    contentType: file.type as AttachmentContentType,
  };
}

export function getAttachmentUploadErrorCopy(errorKind: string) {
  if (errorKind === 'forbidden') {
    return '目前角色或物業授權範圍不能上傳此附件。';
  }

  if (errorKind === 'not-found') {
    return '找不到要附加的資料，請重新整理後再試。';
  }

  if (errorKind === 'validation') {
    return '附件資料未通過檢查，請確認檔案格式與大小後再試。';
  }

  if (errorKind === 'retryable') {
    return '附件服務暫時無法完成上傳，請稍後重試。';
  }

  return '附件上傳失敗，請稍後再試。';
}

export function getAttachmentDeleteErrorCopy(errorKind: string) {
  if (errorKind === 'forbidden') {
    return '目前角色或物業授權範圍不能刪除此附件。';
  }

  if (errorKind === 'not-found') {
    return '找不到附件，可能已被刪除，請重新整理列表。';
  }

  if (errorKind === 'retryable') {
    return '附件服務暫時無法完成刪除，請稍後重試。';
  }

  return '附件刪除失敗，請稍後再試。';
}

export function getAttachmentDownloadErrorCopy(errorKind: string) {
  if (errorKind === 'forbidden') {
    return '目前角色或物業授權範圍不能開啟此附件。';
  }

  if (errorKind === 'not-found') {
    return '找不到附件，可能已被刪除，請重新整理列表。';
  }

  if (errorKind === 'retryable') {
    return '附件服務暫時無法開啟檔案，請稍後重試。';
  }

  return '附件開啟失敗，請稍後再試。';
}
