import {
  DeleteOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Empty,
  List,
  Modal,
  Space,
  Typography,
  message,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  classifyApiErrorForUi,
  createAttachmentUploadUrl,
  deleteAttachment,
  listRoomAttachments,
  registerRoomAttachment,
  type Attachment,
  uploadAttachmentFile,
} from '../api';
import { useAuth } from '../auth';
import {
  getAttachmentDeleteErrorCopy,
  getAttachmentUploadErrorCopy,
  validateAttachmentFile,
} from './attachmentRules';
import { formatDashboardDateTime } from './format';
import { abortRequest } from './requestAbort';

type AttachmentListState =
  | { status: 'loading'; data: Attachment[] }
  | { status: 'ready'; data: Attachment[] }
  | { status: 'forbidden'; data: Attachment[] }
  | { status: 'not-found'; data: Attachment[] }
  | { status: 'error'; data: Attachment[] };

type AttachmentManagerProps = {
  resourceType: 'room';
  resourceId: string;
  title?: string;
};

function getAttachmentName(attachment: Attachment) {
  return attachment.file_name?.trim() || '未命名附件';
}

function getAttachmentCreatedAt(attachment: Attachment) {
  return attachment.created_at ? formatDashboardDateTime(attachment.created_at) : '未提供建立時間';
}

function formatAttachmentFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.ceil(size / 1024)} KB`;
  }

  return `${size} B`;
}

function getListErrorDescription(status: AttachmentListState['status']) {
  if (status === 'forbidden') {
    return '目前角色或物業授權範圍不能查看此附件列表。';
  }

  if (status === 'not-found') {
    return '找不到要查看附件的資料，請重新整理房間後再試。';
  }

  return '附件列表暫時無法載入，請稍後重試。';
}

export function AttachmentManager({
  resourceType,
  resourceId,
  title = '附件管理',
}: AttachmentManagerProps) {
  const { getAccessToken } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const requestIdRef = useRef(0);
  const [messageApi, messageContextHolder] = message.useMessage();
  const [modalApi, modalContextHolder] = Modal.useModal();
  const [listState, setListState] = useState<AttachmentListState>({
    status: 'loading',
    data: [],
  });
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  const loadAttachments = useCallback(() => {
    abortRequest(activeRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeRequestRef.current = { id: requestId, controller };
    setListState((current) => ({ status: 'loading', data: current.data }));

    void listRoomAttachments(resourceId, getAccessToken, { signal: controller.signal })
      .then((response) => {
        if (activeRequestRef.current?.id !== requestId) {
          return;
        }

        setListState({ status: 'ready', data: response.data ?? [] });
      })
      .catch((error: unknown) => {
        if (activeRequestRef.current?.id !== requestId) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        if (errorState.kind === 'forbidden') {
          setListState({ status: 'forbidden', data: [] });
          return;
        }

        if (errorState.kind === 'not-found') {
          setListState({ status: 'not-found', data: [] });
          return;
        }

        setListState({ status: 'error', data: [] });
      });
  }, [getAccessToken, resourceId]);

  useEffect(() => {
    loadAttachments();

    return () => abortRequest(activeRequestRef.current?.controller);
  }, [loadAttachments]);

  const handleUploadFile = useCallback((file: File | null) => {
    if (!file) {
      setOperationError('請先選擇要上傳的附件。');
      return;
    }

    const validation = validateAttachmentFile(file);

    if (!validation.valid) {
      setOperationError(validation.message);
      void messageApi.error(validation.message);
      return;
    }

    setUploading(true);
    setOperationError(null);

    void createAttachmentUploadUrl(
      {
        resource_type: resourceType,
        resource_id: resourceId,
        file_name: file.name,
        content_type: validation.contentType,
        file_size: file.size,
      },
      getAccessToken,
    )
      .then(async (uploadResponse) => {
        if (!uploadResponse.upload_url || !uploadResponse.nonce) {
          throw new Error('Missing upload response data');
        }

        await uploadAttachmentFile(uploadResponse.upload_url, file, validation.contentType, {});

        await registerRoomAttachment(
          resourceId,
          {
            nonce: uploadResponse.nonce,
            file_name: file.name,
          },
          getAccessToken,
        );
      })
      .then(() => {
        setSelectedFile(null);
        void messageApi.success('附件已上傳並完成登記。');
        loadAttachments();
      })
      .catch((error: unknown) => {
        const errorState = classifyApiErrorForUi(error);
        const copy = getAttachmentUploadErrorCopy(errorState.kind);
        setOperationError(copy);
        void messageApi.error(copy);
      })
      .finally(() => setUploading(false));
  }, [getAccessToken, loadAttachments, messageApi, resourceId, resourceType]);

  const handleDelete = useCallback((attachment: Attachment) => {
    if (!attachment.id) {
      setOperationError('附件資料不完整，請重新整理後再試。');
      return;
    }

    modalApi.confirm({
      title: '刪除附件',
      content: `確認刪除「${getAttachmentName(attachment)}」？`,
      okText: '確認刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setDeletingAttachmentId(attachment.id ?? null);
        setOperationError(null);

        try {
          await deleteAttachment(attachment.id as string, getAccessToken);
          void messageApi.success('附件已刪除。');
          loadAttachments();
        } catch (error) {
          const errorState = classifyApiErrorForUi(error);
          const copy = getAttachmentDeleteErrorCopy(errorState.kind);
          setOperationError(copy);
          void messageApi.error(copy);
          throw error;
        } finally {
          setDeletingAttachmentId(null);
        }
      },
    });
  }, [getAccessToken, loadAttachments, messageApi, modalApi]);

  const listError = listState.status === 'forbidden'
    || listState.status === 'not-found'
    || listState.status === 'error';
  const mutationInProgress = uploading || deletingAttachmentId !== null;

  return (
    <Space direction="vertical" size={12} className="page-stack">
      {messageContextHolder}
      {modalContextHolder}
      <div className="billing-section-heading">
        <div>
          <Typography.Title level={2}>{title}</Typography.Title>
          <Typography.Paragraph type="secondary">
            可上傳 JPG、PNG、HEIC 或 PDF，單一檔案大小上限 20MB。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadAttachments()}
            disabled={mutationInProgress}
          >
            重新整理
          </Button>
          <Button
            icon={<PaperClipOutlined />}
            onClick={() => inputRef.current?.click()}
            disabled={mutationInProgress}
          >
            選擇檔案
          </Button>
          <input
            ref={inputRef}
            type="file"
            aria-label="選擇檔案"
            accept="image/jpeg,image/png,image/heic,application/pdf"
            hidden
            disabled={mutationInProgress}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';

              if (file) {
                setSelectedFile(file);
                setOperationError(null);
              }
            }}
          />
          <Button
            type="primary"
            icon={<UploadOutlined />}
            loading={uploading}
            disabled={deletingAttachmentId !== null || !selectedFile}
            onClick={() => handleUploadFile(selectedFile)}
          >
            上傳附件
          </Button>
        </Space>
      </div>

      {selectedFile && (
        <Alert
          type="info"
          showIcon
          message="已選擇附件"
          description={(
            <Space direction="vertical" size={2}>
              <Typography.Text strong>{selectedFile.name}</Typography.Text>
              <Typography.Text type="secondary">
                檔案大小：{formatAttachmentFileSize(selectedFile.size)}
              </Typography.Text>
            </Space>
          )}
          action={(
            <Button
              size="small"
              onClick={() => setSelectedFile(null)}
              disabled={uploading}
            >
              移除
            </Button>
          )}
        />
      )}

      {operationError && (
        <Alert
          type="error"
          showIcon
          message="附件操作未完成"
          description={operationError}
        />
      )}

      {listError ? (
        <Alert
          type="error"
          showIcon
          message="無法載入附件"
          description={getListErrorDescription(listState.status)}
          action={<Button onClick={() => loadAttachments()}>重試</Button>}
        />
      ) : (
        <List
          loading={listState.status === 'loading'}
          dataSource={listState.data}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="尚未上傳附件。"
              />
            ),
          }}
          renderItem={(attachment) => (
            <List.Item
              actions={[
                <Button
                  key="delete"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`刪除 ${getAttachmentName(attachment)}`}
                  loading={deletingAttachmentId === attachment.id}
                  disabled={uploading || (deletingAttachmentId !== null && deletingAttachmentId !== attachment.id)}
                  onClick={() => handleDelete(attachment)}
                >
                  刪除
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={<PaperClipOutlined />}
                title={getAttachmentName(attachment)}
                description={`建立時間：${getAttachmentCreatedAt(attachment)}`}
              />
            </List.Item>
          )}
        />
      )}
    </Space>
  );
}

type RoomAttachmentManagerProps = {
  roomId: string;
};

export function RoomAttachmentManager({ roomId }: RoomAttachmentManagerProps) {
  return <AttachmentManager resourceType="room" resourceId={roomId} />;
}
