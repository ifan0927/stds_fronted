import { ApiError } from './errors';
import { apiRequest, type AccessTokenProvider } from './client';
import type { components } from './generated/schema';

export type Attachment = components['schemas']['AttachmentResponse'];
export type AttachmentList = components['schemas']['AttachmentListResponse'];
export type AttachmentUploadURLRequest = components['schemas']['AttachmentUploadURLRequest'];
export type AttachmentUploadURLResponse = components['schemas']['AttachmentUploadURLResponse'];
export type AttachmentDownloadURLResponse = components['schemas']['AttachmentDownloadURLResponse'];
export type AttachmentUploadUrlRequest = AttachmentUploadURLRequest;
export type AttachmentUploadUrlResponse = AttachmentUploadURLResponse;
export type AttachmentDownloadUrlResponse = AttachmentDownloadURLResponse;
export type RegisterAttachmentRequest = components['schemas']['RegisterAttachmentRequest'];
type GeneratedRegisterRepairRequestAttachmentRequest = components['schemas']['RegisterRepairRequestAttachmentRequest'];
export type RegisterRepairRequestAttachmentRequest = Omit<
  GeneratedRegisterRepairRequestAttachmentRequest,
  'sort_order'
> & {
  sort_order?: GeneratedRegisterRepairRequestAttachmentRequest['sort_order'];
};
export type RegisterRepairAttachmentRequest = RegisterRepairRequestAttachmentRequest;
export type AttachmentResourceType = AttachmentUploadURLRequest['resource_type'];
export type AttachmentContentType = AttachmentUploadURLRequest['content_type'];

type ApiHelperOptions = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
};

type DirectUploadOptions = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
};

function attachmentPath(attachmentId: string) {
  return `/attachments/${encodeURIComponent(attachmentId)}`;
}

function roomAttachmentPath(roomId: string) {
  return `/rooms/${encodeURIComponent(roomId)}/attachments`;
}

function repairRequestAttachmentPath(repairRequestId: string) {
  return `/repair-requests/${encodeURIComponent(repairRequestId)}/attachments`;
}

export function createAttachmentUploadURL(
  body: AttachmentUploadURLRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<AttachmentUploadURLResponse>({
    method: 'POST',
    path: '/attachments/upload-url',
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export const createAttachmentUploadUrl = createAttachmentUploadURL;

export function createAttachmentDownloadURL(
  attachmentId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<AttachmentDownloadURLResponse>({
    method: 'POST',
    path: `${attachmentPath(attachmentId)}/download-url`,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export const createAttachmentDownloadUrl = createAttachmentDownloadURL;

export async function directUploadAttachmentFile(
  uploadUrl: string,
  file: File,
  contentType: AttachmentContentType,
  options: DirectUploadOptions = {},
) {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: file,
    signal: options.signal,
  });

  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      message: response.statusText || 'Upload failed',
      errorCode: null,
      details: null,
      response,
    });
  }
}

export const uploadAttachmentFile = directUploadAttachmentFile;

export function deleteAttachment(
  attachmentId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest({
    method: 'DELETE',
    path: attachmentPath(attachmentId),
    responseType: 'void',
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function listRoomAttachments(
  roomId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<AttachmentList>({
    path: roomAttachmentPath(roomId),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function createRoomAttachment(
  roomId: string,
  body: RegisterAttachmentRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<Attachment>({
    method: 'POST',
    path: roomAttachmentPath(roomId),
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export const registerRoomAttachment = createRoomAttachment;

export function listRepairRequestAttachments(
  repairRequestId: string,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<AttachmentList>({
    path: repairRequestAttachmentPath(repairRequestId),
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export function createRepairRequestAttachment(
  repairRequestId: string,
  body: RegisterRepairAttachmentRequest,
  tokenProvider: AccessTokenProvider,
  options: ApiHelperOptions = {},
) {
  return apiRequest<Attachment>({
    method: 'POST',
    path: repairRequestAttachmentPath(repairRequestId),
    body,
    tokenProvider,
    signal: options.signal,
    fetcher: options.fetcher,
  });
}

export const registerRepairRequestAttachment = createRepairRequestAttachment;
