// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAttachmentDownloadUrl,
  createAttachmentUploadUrl,
  deleteAttachment,
  listRepairRequestAttachments,
  listRoomAttachments,
  registerRepairRequestAttachment,
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
  const Modal = Object.assign(actual.Modal, {
    useModal: () => [modalMocks, null],
  });

  return {
    ...actual,
    Modal,
  };
});

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');

  return {
    ...actual,
    createAttachmentUploadUrl: vi.fn(),
    createAttachmentDownloadUrl: vi.fn(),
    deleteAttachment: vi.fn(),
    listRepairRequestAttachments: vi.fn(),
    listRoomAttachments: vi.fn(),
    registerRepairRequestAttachment: vi.fn(),
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

function mockRepairAttachmentList() {
  vi.mocked(listRepairRequestAttachments).mockResolvedValue({
    data: [
      {
        id: 'attachment-before',
        object_path: 'gs://private-bucket/attachments/repairs/repair-1/before.jpg',
        file_name: '施工前.jpg',
        uploaded_by: 'user-1',
        created_at: '2026-05-11T10:00:00Z',
        sort_order: 1,
        photo_stage: 'before',
      },
      {
        id: 'attachment-doc',
        object_path: 'gs://private-bucket/attachments/repairs/repair-1/quote.pdf',
        file_name: '估價單.pdf',
        uploaded_by: 'user-1',
        created_at: '2026-05-11T10:01:00Z',
        sort_order: null,
        photo_stage: null,
      },
      {
        id: 'attachment-after',
        object_path: 'gs://private-bucket/attachments/repairs/repair-1/after.png',
        file_name: '施工後.png',
        uploaded_by: 'user-1',
        created_at: '2026-05-11T10:02:00Z',
        sort_order: 2,
        photo_stage: 'after',
      },
    ],
  });
}

function renderRepairAttachmentManager() {
  return render(<AttachmentManager resourceType="repair-request" resourceId="repair/with/slash" />);
}

function getModeFileInput(label: string) {
  const input = screen.getByLabelText(label);

  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Expected repair attachment file input');
  }

  return input;
}

function clickLastButton(name: RegExp) {
  const buttons = screen.getAllByRole('button', { name });
  fireEvent.click(buttons[buttons.length - 1]);
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
    expect(screen.getByText('已上傳附件（1）')).toBeTruthy();

    const file = new File(['raw file bytes'], '新附件.pdf', { type: 'application/pdf' });
    fireEvent.change(getFileInput(container), { target: { files: [file] } });
    expect(screen.getByText('已選擇附件')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /確認上傳附件/ }));

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
    fireEvent.click(screen.getByRole('button', { name: /確認上傳附件/ }));

    await screen.findAllByText(/附件上傳失敗/);
    expect(registerRoomAttachment).not.toHaveBeenCalled();

    const retryFile = new File(['retry bytes'], '重試附件.pdf', { type: 'application/pdf' });
    fireEvent.change(getFileInput(container), { target: { files: [retryFile] } });
    fireEvent.click(screen.getByRole('button', { name: /確認上傳附件/ }));

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
    fireEvent.click(screen.getByRole('button', { name: /確認上傳附件/ }));

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

  it('previews image attachments by file extension without exposing the signed URL as visible text', async () => {
    vi.mocked(listRoomAttachments).mockResolvedValue({
      data: [
        {
          id: 'attachment-image',
          object_path: 'gs://private-bucket/attachments/rooms/room-1/photo.jpg',
          file_name: '現況照片.JPG',
          uploaded_by: 'user-1',
          created_at: '2026-05-11T10:00:00Z',
          sort_order: null,
          photo_stage: null,
        },
      ],
    });
    vi.mocked(createAttachmentDownloadUrl).mockResolvedValue({
      download_url: 'https://files.example.com/attachments/photo.jpg?token=masked',
      expires_at: '2026-05-11T10:15:00Z',
    });

    renderRoomAttachmentManager();
    await screen.findByText('現況照片.JPG');

    fireEvent.click(screen.getByRole('button', { name: /預覽 現況照片\.JPG/ }));

    const previewImage = await screen.findByAltText('現況照片.JPG');
    expect(previewImage.getAttribute('src'))
      .toBe('https://files.example.com/attachments/photo.jpg?token=masked');
    expect(createAttachmentDownloadUrl).toHaveBeenCalledWith('attachment-image', expect.any(Function));
    const visibleText = document.body.textContent ?? '';
    expect(visibleText).not.toContain('https://files.example.com/attachments/photo.jpg');
    expect(visibleText).not.toContain('gs://private-bucket');
  });

  it('downloads non-image attachments through the backend download URL', async () => {
    mockAttachmentList();
    vi.mocked(createAttachmentDownloadUrl).mockResolvedValue({
      download_url: 'https://files.example.com/attachments/contract.pdf?token=masked',
      expires_at: '2026-05-11T10:15:00Z',
    });
    const downloadWindow = { location: { href: '' }, close: vi.fn() };
    const windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue(downloadWindow as unknown as Window);

    renderRoomAttachmentManager();
    await screen.findByText('合約.pdf');

    fireEvent.click(screen.getByRole('button', { name: /下載 合約\.pdf/ }));

    await waitFor(() => {
      expect(downloadWindow.location.href)
        .toBe('https://files.example.com/attachments/contract.pdf?token=masked');
    });
    expect(createAttachmentDownloadUrl).toHaveBeenCalledWith('attachment-1', expect.any(Function));
    expect(windowOpenSpy).toHaveBeenCalledWith('', '_blank');
    windowOpenSpy.mockRestore();
  });

  it('downloads HEIC attachments instead of routing them to browser image preview', async () => {
    vi.mocked(listRoomAttachments).mockResolvedValue({
      data: [
        {
          id: 'attachment-heic',
          object_path: 'gs://private-bucket/attachments/rooms/room-1/photo.heic',
          file_name: '維修照片.HEIC',
          uploaded_by: 'user-1',
          created_at: '2026-05-11T10:00:00Z',
          sort_order: null,
          photo_stage: null,
        },
      ],
    });
    vi.mocked(createAttachmentDownloadUrl).mockResolvedValue({
      download_url: 'https://files.example.com/attachments/photo.heic?token=masked',
      expires_at: '2026-05-11T10:15:00Z',
    });
    const downloadWindow = { location: { href: '' }, close: vi.fn() };
    const windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue(downloadWindow as unknown as Window);

    renderRoomAttachmentManager();
    await screen.findByText('維修照片.HEIC');

    expect(screen.queryByRole('button', { name: /預覽 維修照片\.HEIC/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /下載 維修照片\.HEIC/ }));

    await waitFor(() => {
      expect(downloadWindow.location.href)
        .toBe('https://files.example.com/attachments/photo.heic?token=masked');
    });
    expect(createAttachmentDownloadUrl).toHaveBeenCalledWith('attachment-heic', expect.any(Function));
    expect(windowOpenSpy).toHaveBeenCalledWith('', '_blank');
    windowOpenSpy.mockRestore();
  });

  it('shows a clear error when the backend refuses an attachment download URL', async () => {
    mockAttachmentList();
    vi.mocked(createAttachmentDownloadUrl).mockRejectedValue(new Error('download failed'));
    const downloadWindow = { location: { href: '' }, close: vi.fn() };
    const windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue(downloadWindow as unknown as Window);

    renderRoomAttachmentManager();
    await screen.findByText('合約.pdf');

    fireEvent.click(screen.getByRole('button', { name: /下載 合約\.pdf/ }));

    expect(await screen.findAllByText(/附件開啟失敗/)).not.toHaveLength(0);
    expect(downloadWindow.close).toHaveBeenCalled();
    windowOpenSpy.mockRestore();
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

describe('RepairAttachmentManager', () => {
  it('shows staged photos and documents in the backend order with separate upload entries', async () => {
    mockRepairAttachmentList();

    renderRepairAttachmentManager();

    const beforePhoto = await screen.findByText('施工前.jpg');
    const documentAttachment = screen.getByText('估價單.pdf');
    const afterPhoto = screen.getByText('施工後.png');
    expect(beforePhoto.compareDocumentPosition(documentAttachment))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(documentAttachment.compareDocumentPosition(afterPhoto))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText('施工前')).toBeTruthy();
    expect(screen.getByText('排序：1')).toBeTruthy();
    expect(screen.getByText('施工後')).toBeTruthy();
    expect(screen.getByText('排序：2')).toBeTruthy();
    expect(screen.getByText('文件')).toBeTruthy();
    expect(screen.queryByText('排序：0')).toBeNull();
    expect(screen.getByText('已上傳附件（3）')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /選擇施工照片/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /選擇其他文件/ }).length).toBeGreaterThan(0);
  });

  it('registers repair photo uploads with stage metadata and rejects PDFs in photo mode', async () => {
    mockRepairAttachmentList();
    vi.mocked(createAttachmentUploadUrl).mockResolvedValue({
      upload_url: 'https://storage.example/upload-photo?signature=masked',
      nonce: 'nonce-photo',
      expires_at: '2026-05-11T10:00:00Z',
    });
    vi.mocked(uploadAttachmentFile).mockResolvedValue(undefined);
    vi.mocked(registerRepairRequestAttachment).mockResolvedValue({
      id: 'attachment-photo',
      object_path: 'gs://private-bucket/attachments/repairs/repair-1/before.jpg',
      file_name: '施工前.jpg',
      uploaded_by: 'user-1',
      created_at: '2026-05-11T10:03:00Z',
      sort_order: 3,
      photo_stage: 'before',
    });

    renderRepairAttachmentManager();
    await screen.findByText('施工前.jpg');

    const pdfFile = new File(['pdf bytes'], '錯誤.pdf', { type: 'application/pdf' });
    fireEvent.click(screen.getAllByRole('button', { name: /選擇施工照片/ })[0]);
    fireEvent.change(getModeFileInput('選擇施工照片'), { target: { files: [pdfFile] } });
    expect(screen.getByText('已選擇施工照片')).toBeTruthy();
    clickLastButton(/確認上傳施工照片/);

    expect(await screen.findAllByText('施工照片僅支援 JPG、PNG 或 HEIC。')).not.toHaveLength(0);
    expect(createAttachmentUploadUrl).not.toHaveBeenCalled();

    const imageFile = new File(['image bytes'], '施工前.jpg', { type: 'image/jpeg' });
    fireEvent.click(screen.getAllByRole('button', { name: /選擇施工照片/ })[0]);
    fireEvent.change(getModeFileInput('選擇施工照片'), { target: { files: [imageFile] } });
    fireEvent.change(screen.getByLabelText('施工照片排序'), { target: { value: '3' } });
    clickLastButton(/確認上傳施工照片/);

    await waitFor(() => {
      expect(registerRepairRequestAttachment).toHaveBeenCalledWith(
        'repair/with/slash',
        {
          nonce: 'nonce-photo',
          file_name: '施工前.jpg',
          photo_stage: 'before',
          sort_order: 3,
        },
        expect.any(Function),
      );
    });
    expect(createAttachmentUploadUrl).toHaveBeenCalledWith(
      {
        resource_type: 'repair_request',
        resource_id: 'repair/with/slash',
        file_name: '施工前.jpg',
        content_type: 'image/jpeg',
        file_size: imageFile.size,
      },
      expect.any(Function),
    );
    expect(uploadAttachmentFile).toHaveBeenCalledWith(
      'https://storage.example/upload-photo?signature=masked',
      imageFile,
      'image/jpeg',
      {},
    );
    expect(listRepairRequestAttachments).toHaveBeenCalledTimes(2);
  });

  it('registers repair document uploads without photo metadata and rejects images in document mode', async () => {
    mockRepairAttachmentList();
    vi.mocked(createAttachmentUploadUrl).mockResolvedValue({
      upload_url: 'https://storage.example/upload-document?signature=masked',
      nonce: 'nonce-document',
      expires_at: '2026-05-11T10:00:00Z',
    });
    vi.mocked(uploadAttachmentFile).mockResolvedValue(undefined);
    vi.mocked(registerRepairRequestAttachment).mockResolvedValue({
      id: 'attachment-document',
      object_path: 'gs://private-bucket/attachments/repairs/repair-1/quote.pdf',
      file_name: '估價單.pdf',
      uploaded_by: 'user-1',
      created_at: '2026-05-11T10:03:00Z',
      sort_order: null,
      photo_stage: null,
    });

    renderRepairAttachmentManager();
    await screen.findByText('施工前.jpg');

    const imageFile = new File(['image bytes'], '錯誤.png', { type: 'image/png' });
    fireEvent.click(screen.getAllByRole('button', { name: /選擇其他文件/ })[0]);
    fireEvent.change(getModeFileInput('選擇其他文件'), { target: { files: [imageFile] } });
    expect(screen.getByText('已選擇其他文件')).toBeTruthy();
    clickLastButton(/確認上傳其他文件/);

    expect(await screen.findAllByText('其他文件僅支援 PDF。')).not.toHaveLength(0);
    expect(createAttachmentUploadUrl).not.toHaveBeenCalled();

    const pdfFile = new File(['pdf bytes'], '估價單.pdf', { type: 'application/pdf' });
    fireEvent.click(screen.getAllByRole('button', { name: /選擇其他文件/ })[0]);
    fireEvent.change(getModeFileInput('選擇其他文件'), { target: { files: [pdfFile] } });
    clickLastButton(/確認上傳其他文件/);

    await waitFor(() => {
      expect(registerRepairRequestAttachment).toHaveBeenCalledWith(
        'repair/with/slash',
        {
          nonce: 'nonce-document',
          file_name: '估價單.pdf',
        },
        expect.any(Function),
      );
    });
    expect(createAttachmentUploadUrl).toHaveBeenCalledWith(
      {
        resource_type: 'repair_request',
        resource_id: 'repair/with/slash',
        file_name: '估價單.pdf',
        content_type: 'application/pdf',
        file_size: pdfFile.size,
      },
      expect.any(Function),
    );
    expect(uploadAttachmentFile).toHaveBeenCalledWith(
      'https://storage.example/upload-document?signature=masked',
      pdfFile,
      'application/pdf',
      {},
    );
    expect(listRepairRequestAttachments).toHaveBeenCalledTimes(2);
  });
});
