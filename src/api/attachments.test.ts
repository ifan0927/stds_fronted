import { describe, expect, it, vi } from 'vitest';
import {
  createAttachmentUploadUrl,
  deleteAttachment,
  listRoomAttachments,
  registerRoomAttachment,
  uploadAttachmentFile,
  type AttachmentUploadUrlRequest,
  type RegisterAttachmentRequest,
} from './attachments';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

describe('attachment API helpers', () => {
  it('creates upload URLs with the generated request payload shape', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        upload_url: 'https://storage.example/upload?signature=masked',
        nonce: 'nonce-1',
        expires_at: '2026-05-11T10:00:00Z',
      }),
    );
    const body = {
      resource_type: 'room',
      resource_id: 'room/with/slash',
      file_name: '合約.pdf',
      content_type: 'application/pdf',
      file_size: 1024,
    } satisfies AttachmentUploadUrlRequest;

    const result = await createAttachmentUploadUrl(body, () => 'firebase-id-token', { fetcher });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/attachments/upload-url');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(await new Response(init?.body).json()).toEqual(body);
    expect(result.nonce).toBe('nonce-1');
  });

  it('lists room attachments by encoded room id', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'attachment-1',
            object_path: 'attachments/rooms/room-1/file.pdf',
            file_name: '合約.pdf',
            uploaded_by: 'user-1',
            created_at: '2026-05-11T10:00:00Z',
            sort_order: null,
            photo_stage: null,
          },
        ],
      }),
    );

    const result = await listRoomAttachments('room/with/slash', () => 'firebase-id-token', { fetcher });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/rooms/room%2Fwith%2Fslash/attachments');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(result.data?.[0]?.file_name).toBe('合約.pdf');
  });

  it('registers room attachments with nonce and file name only', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'attachment-1',
        object_path: 'attachments/rooms/room-1/file.pdf',
        file_name: '合約.pdf',
        uploaded_by: 'user-1',
        created_at: '2026-05-11T10:00:00Z',
        sort_order: null,
        photo_stage: null,
      }, { status: 201 }),
    );
    const body = {
      nonce: 'nonce-1',
      file_name: '合約.pdf',
    } satisfies RegisterAttachmentRequest;

    await registerRoomAttachment('room/with/slash', body, () => 'firebase-id-token', { fetcher });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/rooms/room%2Fwith%2Fslash/attachments');
    expect(init?.method).toBe('POST');
    expect(await new Response(init?.body).json()).toEqual({
      nonce: 'nonce-1',
      file_name: '合約.pdf',
    });
  });

  it('deletes attachments by encoded attachment id with a void response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteAttachment('attachment/with/slash', () => 'firebase-id-token', { fetcher }))
      .resolves.toBeUndefined();

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/attachments/attachment%2Fwith%2Fslash');
    expect(init?.method).toBe('DELETE');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
  });
});

describe('direct attachment upload helper', () => {
  it.each([200, 201, 204, 299])('treats HTTP %i as upload success', async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    const file = new File(['raw file bytes'], '合約.pdf', { type: 'application/pdf' });

    await expect(uploadAttachmentFile(
      'https://storage.example/upload?signature=masked',
      file,
      'application/pdf',
      { fetcher },
    )).resolves.toBeUndefined();

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://storage.example/upload?signature=masked');
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe(file);
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/pdf');
  });

  it('throws on non-2xx direct upload responses', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('denied', { status: 403 }));
    const file = new File(['raw file bytes'], '照片.png', { type: 'image/png' });

    await expect(uploadAttachmentFile(
      'https://storage.example/upload?signature=masked',
      file,
      'image/png',
      { fetcher },
    )).rejects.toThrow(/upload/i);
  });
});
