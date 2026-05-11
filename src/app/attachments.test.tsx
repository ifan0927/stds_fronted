// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAttachmentUploadUrl,
  deleteAttachment,
  listRoomAttachments,
  registerRoomAttachment,
  uploadAttachmentFile,
} from '../api';
import { AttachmentManager } from './AttachmentManager';

const authMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(() => 'firebase-token'),
}));

const modalMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
}));

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');

  return {
    ...actual,
    Modal: {
      ...actual.Modal,
      useModal: () => [modalMocks, null],
    },
  };
});

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');

  return {
    ...actual,
    createAttachmentUploadUrl: vi.fn(),
    deleteAttachment: vi.fn(),
    listRoomAttachments: vi.fn(),
    registerRoomAttachment: vi.fn(),
    uploadAttachmentFile: vi.fn(),
  };
});

vi.mock('../auth', () => ({
  useAuth: () => ({
    getAccessToken: authMocks.getAccessToken,
  }),
}));

function mockAttachmentList() {
  vi.mocked(listRoomAttachments).mockResolvedValue({
    data: [
      {
        id: 'attachment-1',
        object_path: 'gs://private-bucket/attachments/rooms/room-1/secret.pdf',
        file_name: '合約.pdf',
        uploaded_by: 'user-1',
        created_at: '2026-05-11T10:00:00Z',
        sort_order: null,
        photo_stage: null,
      },
    ],
  });
}

function getFileInput(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]');

  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Expected attachment file input');
  }

  return input;
}

function renderRoomAttachmentManager() {
  return render(<AttachmentManager resourceType="room" resourceId="room/with/slash" />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RoomAttachmentManager', () => {
  it('uploads raw file bytes, registers the nonce, and refetches attachments after success', async () => {
    mockAttachmentList();
    vi.mocked(createAttachmentUploadUrl).mockResolvedValue({
      upload_url: 'https://storage.example/upload-1?signature=masked',
      nonce: 'nonce-1',
      expires_at: '2026-05-11T10:00:00Z',
    });
    vi.mocked(uploadAttachmentFile).mockResolvedValue(undefined);
    vi.mocked(registerRoomAttachment).mockResolvedValue({
      id: 'attachment-2',
      object_path: 'gs://private-bucket/attachments/rooms/room-1/new.pdf',
      file_name: '新附件.pdf',
      uploaded_by: 'user-1',
      created_at: '2026-05-11T10:01:00Z',
      sort_order: null,
      photo_stage: null,
    });

    const { container } = renderRoomAttachmentManager();
    await screen.findByText('合約.pdf');

    const file = new File(['raw file bytes'], '新附件.pdf', { type: 'application/pdf' });
    fireEvent.change(getFileInput(container), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /上傳附件/ }));

    await waitFor(() => {
      expect(registerRoomAttachment).toHaveBeenCalledWith(
        'room/with/slash',
        { nonce: 'nonce-1', file_name: '新附件.pdf' },
        expect.any(Function),
      );
    });
    expect(createAttachmentUploadUrl).toHaveBeenCalledWith(
      {
        resource_type: 'room',
        resource_id: 'room/with/slash',
        file_name: '新附件.pdf',
        content_type: 'application/pdf',
        file_size: file.size,
      },
      expect.any(Function),
    );
    expect(uploadAttachmentFile).toHaveBeenCalledWith(
      'https://storage.example/upload-1?signature=masked',
      file,
      'application/pdf',
      {},
    );
    expect(listRoomAttachments).toHaveBeenCalledTimes(2);
  });

  it('shows a visible selected file state before upload', async () => {
    mockAttachmentList();

    const { container } = renderRoomAttachmentManager();
    await screen.findByText('合約.pdf');

    const file = new File(['raw file bytes'], '明顯狀態.pdf', { type: 'application/pdf' });
    fireEvent.change(getFileInput(container), { target: { files: [file] } });

    expect(screen.getByText('已選擇附件')).toBeTruthy();
    expect(screen.getByText('明顯狀態.pdf')).toBeTruthy();
    expect(screen.getByText('檔案大小：14 B')).toBeTruthy();
    expect(screen.getByRole('button', { name: /移\s*除/ })).toBeTruthy();
  });

  it('does not register after direct upload failure and retries with a fresh upload URL', async () => {
    mockAttachmentList();
    vi.mocked(createAttachmentUploadUrl)
      .mockResolvedValueOnce({
        upload_url: 'https://storage.example/upload-1?signature=masked',
        nonce: 'nonce-1',
        expires_at: '2026-05-11T10:00:00Z',
      })
      .mockResolvedValueOnce({
        upload_url: 'https://storage.example/upload-2?signature=masked',
        nonce: 'nonce-2',
        expires_at: '2026-05-11T10:05:00Z',
      });
    vi.mocked(uploadAttachmentFile)
      .mockRejectedValueOnce(new Error('upload failed'))
      .mockResolvedValueOnce(undefined);
    vi.mocked(registerRoomAttachment).mockResolvedValue({
      id: 'attachment-2',
      object_path: 'gs://private-bucket/attachments/rooms/room-1/retry.pdf',
      file_name: '重試附件.pdf',
      uploaded_by: 'user-1',
      created_at: '2026-05-11T10:05:00Z',
      sort_order: null,
      photo_stage: null,
    });

    const { container } = renderRoomAttachmentManager();
    await screen.findByText('合約.pdf');

    const firstFile = new File(['first bytes'], '重試附件.pdf', { type: 'application/pdf' });
    fireEvent.change(getFileInput(container), { target: { files: [firstFile] } });
    fireEvent.click(screen.getByRole('button', { name: /上傳附件/ }));

    await screen.findAllByText(/附件上傳失敗/);
    expect(registerRoomAttachment).not.toHaveBeenCalled();

    const retryFile = new File(['retry bytes'], '重試附件.pdf', { type: 'application/pdf' });
    fireEvent.change(getFileInput(container), { target: { files: [retryFile] } });
    fireEvent.click(screen.getByRole('button', { name: /上傳附件/ }));

    await waitFor(() => {
      expect(registerRoomAttachment).toHaveBeenCalledWith(
        'room/with/slash',
        { nonce: 'nonce-2', file_name: '重試附件.pdf' },
        expect.any(Function),
      );
    });
    expect(uploadAttachmentFile).toHaveBeenNthCalledWith(
      1,
      'https://storage.example/upload-1?signature=masked',
      firstFile,
      'application/pdf',
      {},
    );
    expect(uploadAttachmentFile).toHaveBeenNthCalledWith(
      2,
      'https://storage.example/upload-2?signature=masked',
      retryFile,
      'application/pdf',
      {},
    );
  });

  it('does not try storage cleanup or refetch when registration fails', async () => {
    mockAttachmentList();
    vi.mocked(createAttachmentUploadUrl).mockResolvedValue({
      upload_url: 'https://storage.example/upload-1?signature=masked',
      nonce: 'nonce-1',
      expires_at: '2026-05-11T10:00:00Z',
    });
    vi.mocked(uploadAttachmentFile).mockResolvedValue(undefined);
    vi.mocked(registerRoomAttachment).mockRejectedValue(new Error('register failed'));

    const { container } = renderRoomAttachmentManager();
    await screen.findByText('合約.pdf');

    const file = new File(['raw file bytes'], '登記失敗.pdf', { type: 'application/pdf' });
    fireEvent.change(getFileInput(container), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /上傳附件/ }));

    await screen.findAllByText(/附件上傳失敗/);
    expect(uploadAttachmentFile).toHaveBeenCalledTimes(1);
    expect(registerRoomAttachment).toHaveBeenCalledTimes(1);
    expect(deleteAttachment).not.toHaveBeenCalled();
    expect(listRoomAttachments).toHaveBeenCalledTimes(1);
  });

  it('confirms delete and refetches after deletion succeeds', async () => {
    mockAttachmentList();
    vi.mocked(deleteAttachment).mockResolvedValue(undefined);

    renderRoomAttachmentManager();
    await screen.findByText('合約.pdf');

    fireEvent.click(screen.getByRole('button', { name: /刪除/ }));
    expect(modalMocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: '刪除附件',
      content: '確認刪除「合約.pdf」？',
      okText: '確認刪除',
      cancelText: '取消',
    }));

    await modalMocks.confirm.mock.calls[0][0].onOk();

    await waitFor(() => {
      expect(deleteAttachment).toHaveBeenCalledWith('attachment-1', expect.any(Function));
    });
    expect(listRoomAttachments).toHaveBeenCalledTimes(2);
  });

  it('keeps storage internals out of visible UI copy', async () => {
    mockAttachmentList();
    vi.mocked(createAttachmentUploadUrl).mockResolvedValue({
      upload_url: 'https://storage.example/upload-1?signature=masked',
      nonce: 'nonce-1',
      expires_at: '2026-05-11T10:00:00Z',
    });

    renderRoomAttachmentManager();
    await screen.findByText('合約.pdf');

    const visibleText = document.body.textContent ?? '';
    expect(visibleText).toContain('合約.pdf');
    expect(visibleText).not.toMatch(/upload_url|nonce|object_path|bucket|GCS|signed URL|service account|storage/i);
    expect(visibleText).not.toContain('gs://private-bucket');
    expect(visibleText).not.toContain('https://storage.example/upload-1');
  });
});
