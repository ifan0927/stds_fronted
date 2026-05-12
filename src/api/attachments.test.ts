import { describe, expect, it, vi } from 'vitest';
import {
  createAttachmentDownloadUrl,
  createAttachmentUploadUrl,
  deleteAttachment,
  listLeaseAttachments,
  listRepairRequestAttachments,
  listRoomAttachments,
  listTenantAttachments,
  registerLeaseAttachment,
  registerRepairRequestAttachment,
  registerRoomAttachment,
  registerTenantAttachment,
  uploadAttachmentFile,
  type AttachmentUploadUrlRequest,
  type RegisterRepairRequestAttachmentRequest,
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

  it('creates download URLs by encoded attachment id', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        download_url: 'https://files.example.com/attachments/download?token=masked',
        expires_at: '2026-05-11T10:15:00Z',
      }),
    );

    const result = await createAttachmentDownloadUrl(
      'attachment/with/slash',
      () => 'firebase-id-token',
      { fetcher },
    );

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/attachments/attachment%2Fwith%2Fslash/download-url');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(result.download_url).toBe('https://files.example.com/attachments/download?token=masked');
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

  it('lists tenant attachments by encoded tenant id', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'attachment-1',
            object_path: 'attachments/tenants/tenant-1/id-card.jpg',
            file_name: '身分證.jpg',
            uploaded_by: 'user-1',
            created_at: '2026-05-11T10:00:00Z',
            sort_order: null,
            photo_stage: null,
          },
        ],
      }),
    );

    const result = await listTenantAttachments('tenant/with/slash', () => 'firebase-id-token', { fetcher });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/tenants/tenant%2Fwith%2Fslash/attachments');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(result.data?.[0]?.file_name).toBe('身分證.jpg');
  });

  it('registers tenant attachments with nonce and file name only', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'attachment-1',
        object_path: 'attachments/tenants/tenant-1/id-card.jpg',
        file_name: '身分證.jpg',
        uploaded_by: 'user-1',
        created_at: '2026-05-11T10:00:00Z',
        sort_order: null,
        photo_stage: null,
      }, { status: 201 }),
    );
    const body = {
      nonce: 'nonce-1',
      file_name: '身分證.jpg',
    } satisfies RegisterAttachmentRequest;

    await registerTenantAttachment('tenant/with/slash', body, () => 'firebase-id-token', { fetcher });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/tenants/tenant%2Fwith%2Fslash/attachments');
    expect(init?.method).toBe('POST');
    expect(await new Response(init?.body).json()).toEqual({
      nonce: 'nonce-1',
      file_name: '身分證.jpg',
    });
  });

  it('lists lease attachments by encoded lease id', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'attachment-1',
            object_path: 'attachments/leases/lease-1/contract.pdf',
            file_name: '租約.pdf',
            uploaded_by: 'user-1',
            created_at: '2026-05-11T10:00:00Z',
            sort_order: null,
            photo_stage: null,
          },
        ],
      }),
    );

    const result = await listLeaseAttachments('lease/with/slash', () => 'firebase-id-token', { fetcher });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/leases/lease%2Fwith%2Fslash/attachments');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(result.data?.[0]?.file_name).toBe('租約.pdf');
  });

  it('registers lease attachments with nonce and file name only', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'attachment-1',
        object_path: 'attachments/leases/lease-1/contract.pdf',
        file_name: '租約.pdf',
        uploaded_by: 'user-1',
        created_at: '2026-05-11T10:00:00Z',
        sort_order: null,
        photo_stage: null,
      }, { status: 201 }),
    );
    const body = {
      nonce: 'nonce-1',
      file_name: '租約.pdf',
    } satisfies RegisterAttachmentRequest;

    await registerLeaseAttachment('lease/with/slash', body, () => 'firebase-id-token', { fetcher });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/leases/lease%2Fwith%2Fslash/attachments');
    expect(init?.method).toBe('POST');
    expect(await new Response(init?.body).json()).toEqual({
      nonce: 'nonce-1',
      file_name: '租約.pdf',
    });
  });

  it('lists repair request attachments by encoded repair request id', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'attachment-1',
            object_path: 'attachments/repairs/repair-1/before.jpg',
            file_name: '施工前.jpg',
            uploaded_by: 'user-1',
            created_at: '2026-05-11T10:00:00Z',
            sort_order: 1,
            photo_stage: 'before',
          },
        ],
      }),
    );

    const result = await listRepairRequestAttachments('repair/with/slash', () => 'firebase-id-token', { fetcher });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/repair-requests/repair%2Fwith%2Fslash/attachments');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    expect(result.data?.[0]?.photo_stage).toBe('before');
  });

  it('registers repair photo attachments with nonce, file name, photo stage, and sort order', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'attachment-1',
        object_path: 'attachments/repairs/repair-1/before.jpg',
        file_name: '施工前.jpg',
        uploaded_by: 'user-1',
        created_at: '2026-05-11T10:00:00Z',
        sort_order: 1,
        photo_stage: 'before',
      }, { status: 201 }),
    );
    const body = {
      nonce: 'nonce-1',
      file_name: '施工前.jpg',
      photo_stage: 'before',
      sort_order: 1,
    } satisfies RegisterRepairRequestAttachmentRequest;

    await registerRepairRequestAttachment('repair/with/slash', body, () => 'firebase-id-token', { fetcher });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/repair-requests/repair%2Fwith%2Fslash/attachments');
    expect(init?.method).toBe('POST');
    expect(await new Response(init?.body).json()).toEqual({
      nonce: 'nonce-1',
      file_name: '施工前.jpg',
      photo_stage: 'before',
      sort_order: 1,
    });
  });

  it('registers repair document attachments without photo stage or sort order metadata', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'attachment-1',
        object_path: 'attachments/repairs/repair-1/quote.pdf',
        file_name: '估價單.pdf',
        uploaded_by: 'user-1',
        created_at: '2026-05-11T10:00:00Z',
        sort_order: null,
        photo_stage: null,
      }, { status: 201 }),
    );
    const body = {
      nonce: 'nonce-1',
      file_name: '估價單.pdf',
    } satisfies RegisterRepairRequestAttachmentRequest;

    await registerRepairRequestAttachment('repair/with/slash', body, () => 'firebase-id-token', { fetcher });

    const [, init] = fetcher.mock.calls[0];
    expect(await new Response(init?.body).json()).toEqual({
      nonce: 'nonce-1',
      file_name: '估價單.pdf',
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
