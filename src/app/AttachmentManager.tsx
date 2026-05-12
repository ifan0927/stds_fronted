import {
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Empty,
  InputNumber,
  List,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  classifyApiErrorForUi,
  createAttachmentDownloadUrl,
  createAttachmentUploadUrl,
  deleteAttachment,
  listRepairRequestAttachments,
  listRoomAttachments,
  registerRepairRequestAttachment,
  registerRoomAttachment,
  type Attachment,
  type AttachmentContentType,
  uploadAttachmentFile,
} from '../api';
import { useAuth } from '../auth';
import {
  getAttachmentDeleteErrorCopy,
  getAttachmentDownloadErrorCopy,
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
  resourceType: 'room' | 'repair_request' | 'repair-request';
  resourceId: string;
  title?: string;
  onMutationBusyChange?: (busy: boolean) => void;
};

type RepairUploadMode = 'photo' | 'document';
type RepairPhotoStage = NonNullable<Attachment['photo_stage']>;
type PreviewState =
  | { status: 'closed'; name: string; url: string | null }
  | { status: 'loading'; name: string; url: string | null }
  | { status: 'ready'; name: string; url: string };

const repairPhotoStageOptions: Array<{ value: RepairPhotoStage; label: string }> = [
  { value: 'before', label: '施工前' },
  { value: 'after', label: '施工後' },
  { value: 'other', label: '其他照片' },
];

const repairPhotoContentTypes = new Set<AttachmentContentType>([
  'image/jpeg',
  'image/png',
  'image/heic',
]);

const previewableImageExtensions = new Set(['jpg', 'jpeg', 'png']);

function getAttachmentName(attachment: Attachment) {
  return attachment.file_name?.trim() || '未命名附件';
}

function getAttachmentFileExtension(attachment: Attachment) {
  const fileName = attachment.file_name?.trim() ?? '';
  const match = fileName.match(/\.([^.]+)$/);

  return match?.[1]?.toLowerCase() ?? '';
}

function isPreviewableImageAttachment(attachment: Attachment) {
  return previewableImageExtensions.has(getAttachmentFileExtension(attachment));
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

function getRepairPhotoStageLabel(stage: Attachment['photo_stage']) {
  return repairPhotoStageOptions.find((option) => option.value === stage)?.label ?? '其他照片';
}

function getRepairAttachmentUploadValidation(file: File, mode: RepairUploadMode) {
  const validation = validateAttachmentFile(file);

  if (!validation.valid) {
    return validation;
  }

  if (mode === 'photo' && !repairPhotoContentTypes.has(validation.contentType)) {
    return {
      valid: false as const,
      message: '施工照片僅支援 JPG、PNG 或 HEIC。',
    };
  }

  if (mode === 'document' && validation.contentType !== 'application/pdf') {
    return {
      valid: false as const,
      message: '其他文件僅支援 PDF。',
    };
  }

  return validation;
}

function getNextRepairSortOrder(attachments: Attachment[]) {
  return attachments.reduce((nextOrder, attachment) => {
    if (!attachment.photo_stage || typeof attachment.sort_order !== 'number') {
      return nextOrder;
    }

    return Math.max(nextOrder, attachment.sort_order + 1);
  }, 1);
}

export function AttachmentManager({
  resourceType,
  resourceId,
  title = '附件管理',
  onMutationBusyChange,
}: AttachmentManagerProps) {
  const { getAccessToken } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const selectedRepairPhotoFileRef = useRef<File | null>(null);
  const selectedRepairDocumentFileRef = useRef<File | null>(null);
  const repairUploadModeRef = useRef<RepairUploadMode>('photo');
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
  const [selectedRepairPhotoFile, setSelectedRepairPhotoFile] = useState<File | null>(null);
  const [selectedRepairDocumentFile, setSelectedRepairDocumentFile] = useState<File | null>(null);
  const [repairUploadMode, setRepairUploadMode] = useState<RepairUploadMode>('photo');
  const [repairPhotoStage, setRepairPhotoStage] = useState<RepairPhotoStage>('before');
  const [repairSortOrder, setRepairSortOrder] = useState(0);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>({
    status: 'closed',
    name: '',
    url: null,
  });
  const [operationError, setOperationError] = useState<string | null>(null);
  const isRepairAttachment = resourceType === 'repair_request' || resourceType === 'repair-request';
  const apiResourceType = isRepairAttachment ? 'repair_request' : resourceType;

  const loadAttachments = useCallback(() => {
    abortRequest(activeRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeRequestRef.current = { id: requestId, controller };
    setListState((current) => ({ status: 'loading', data: current.data }));

    const listAttachments = isRepairAttachment
      ? listRepairRequestAttachments
      : listRoomAttachments;

    void listAttachments(resourceId, getAccessToken, { signal: controller.signal })
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
  }, [getAccessToken, isRepairAttachment, resourceId]);

  useEffect(() => {
    loadAttachments();

    return () => abortRequest(activeRequestRef.current?.controller);
  }, [loadAttachments]);

  const handleUploadFile = useCallback((file: File | null, uploadMode = repairUploadMode) => {
    if (isRepairAttachment) {
      repairUploadModeRef.current = uploadMode;
      setRepairUploadMode(uploadMode);
    }

    if (!file) {
      setOperationError('請先選擇要上傳的附件。');
      return;
    }

    const validation = isRepairAttachment
      ? getRepairAttachmentUploadValidation(file, uploadMode)
      : validateAttachmentFile(file);

    if (!validation.valid) {
      setOperationError(validation.message);
      void messageApi.error(validation.message);
      return;
    }

    setUploading(true);
    setOperationError(null);

    void createAttachmentUploadUrl(
      {
        resource_type: apiResourceType,
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

        if (isRepairAttachment) {
          const registerPayload = uploadMode === 'photo'
            ? {
              nonce: uploadResponse.nonce,
              file_name: file.name,
              photo_stage: repairPhotoStage,
              sort_order: repairSortOrder,
            }
            : {
              nonce: uploadResponse.nonce,
              file_name: file.name,
            };

          await registerRepairRequestAttachment(resourceId, registerPayload, getAccessToken);
          return;
        }

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
        selectedRepairPhotoFileRef.current = null;
        selectedRepairDocumentFileRef.current = null;
        setSelectedRepairPhotoFile(null);
        setSelectedRepairDocumentFile(null);
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
  }, [
    getAccessToken,
    isRepairAttachment,
    loadAttachments,
    messageApi,
    repairPhotoStage,
    repairSortOrder,
    repairUploadMode,
    resourceId,
    apiResourceType,
  ]);

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

  const handlePreview = useCallback((attachment: Attachment) => {
    if (!attachment.id) {
      setOperationError('附件資料不完整，請重新整理後再試。');
      return;
    }

    const name = getAttachmentName(attachment);
    setOpeningAttachmentId(attachment.id);
    setOperationError(null);
    setPreviewState({ status: 'loading', name, url: null });

    void createAttachmentDownloadUrl(attachment.id, getAccessToken)
      .then((response) => {
        setPreviewState({ status: 'ready', name, url: response.download_url });
      })
      .catch((error: unknown) => {
        const errorState = classifyApiErrorForUi(error);
        const copy = getAttachmentDownloadErrorCopy(errorState.kind);
        setPreviewState({ status: 'closed', name: '', url: null });
        setOperationError(copy);
        void messageApi.error(copy);
      })
      .finally(() => setOpeningAttachmentId(null));
  }, [getAccessToken, messageApi]);

  const handleDownload = useCallback((attachment: Attachment) => {
    if (!attachment.id) {
      setOperationError('附件資料不完整，請重新整理後再試。');
      return;
    }

    const downloadWindow = window.open('', '_blank');

    if (!downloadWindow) {
      const copy = '瀏覽器阻擋了下載視窗，請允許彈出視窗後再試一次。';
      setOperationError(copy);
      void messageApi.warning(copy);
      return;
    }

    setOpeningAttachmentId(attachment.id);
    setOperationError(null);

    void createAttachmentDownloadUrl(attachment.id, getAccessToken)
      .then((response) => {
        downloadWindow.location.href = response.download_url;
        void messageApi.success('附件下載已開啟。');
      })
      .catch((error: unknown) => {
        downloadWindow.close();
        const errorState = classifyApiErrorForUi(error);
        const copy = getAttachmentDownloadErrorCopy(errorState.kind);
        setOperationError(copy);
        void messageApi.error(copy);
      })
      .finally(() => setOpeningAttachmentId(null));
  }, [getAccessToken, messageApi]);

  const listError = listState.status === 'forbidden'
    || listState.status === 'not-found'
    || listState.status === 'error';
  const mutationInProgress = uploading || deletingAttachmentId !== null;

  useEffect(() => {
    onMutationBusyChange?.(mutationInProgress);

    return () => onMutationBusyChange?.(false);
  }, [mutationInProgress, onMutationBusyChange]);

  const helperCopy = isRepairAttachment
    ? '施工照片支援 JPG、PNG、HEIC 並需標示階段與排序；其他文件僅支援 PDF。單一檔案大小上限 20MB。'
    : '可上傳 JPG、PNG、HEIC 或 PDF，單一檔案大小上限 20MB。';
  const selectedRepairFile = repairUploadMode === 'photo'
    ? selectedRepairPhotoFile
    : selectedRepairDocumentFile;
  const selectedRepairFileLabel = repairUploadMode === 'photo' ? '已選擇施工照片' : '已選擇其他文件';

  return (
    <Space direction="vertical" size={12} className="page-stack">
      {messageContextHolder}
      {modalContextHolder}
      <Modal
        title={previewState.name || '附件預覽'}
        open={previewState.status !== 'closed'}
        footer={null}
        width={720}
        onCancel={() => setPreviewState({ status: 'closed', name: '', url: null })}
      >
        {previewState.status === 'loading' ? (
          <Typography.Text type="secondary">照片載入中...</Typography.Text>
        ) : previewState.status === 'ready' ? (
          <img
            alt={previewState.name}
            className="attachment-preview-image"
            src={previewState.url}
            onError={() => {
              const copy = '照片預覽無法開啟，請稍後再試。';
              setOperationError(copy);
              void messageApi.error(copy);
            }}
          />
        ) : null}
      </Modal>
      <div className="billing-section-heading">
        <div>
          <Typography.Title level={2}>{title}</Typography.Title>
          <Typography.Paragraph type="secondary">
            {helperCopy}
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
          {isRepairAttachment ? (
            <>
              <input
                ref={photoInputRef}
                type="file"
                aria-label="選擇施工照片"
                accept="image/jpeg,image/png,image/heic"
                hidden
                disabled={mutationInProgress}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';

                  if (file) {
                    setRepairUploadMode('photo');
                    setRepairSortOrder(getNextRepairSortOrder(listState.data));
                    selectedRepairPhotoFileRef.current = file;
                    setSelectedRepairPhotoFile(file);
                    setOperationError(null);
                  }
                }}
              />
              <Button
                icon={<PaperClipOutlined />}
                onClick={() => {
                  repairUploadModeRef.current = 'photo';
                  setRepairUploadMode('photo');
                  photoInputRef.current?.click();
                }}
                disabled={mutationInProgress}
              >
                選擇施工照片
              </Button>
              <input
                ref={documentInputRef}
                type="file"
                aria-label="選擇其他文件"
                accept="application/pdf"
                hidden
                disabled={mutationInProgress}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';

                  if (file) {
                    setRepairUploadMode('document');
                    selectedRepairDocumentFileRef.current = file;
                    setSelectedRepairDocumentFile(file);
                    setOperationError(null);
                  }
                }}
              />
              <Button
                icon={<PaperClipOutlined />}
                onClick={() => {
                  repairUploadModeRef.current = 'document';
                  setRepairUploadMode('document');
                  documentInputRef.current?.click();
                }}
                disabled={mutationInProgress}
              >
                選擇其他文件
              </Button>
            </>
          ) : (
            <Button
              icon={<PaperClipOutlined />}
              onClick={() => inputRef.current?.click()}
              disabled={mutationInProgress}
            >
              選擇檔案
            </Button>
          )}
          {!isRepairAttachment && (
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
          )}
        </Space>
      </div>

      {isRepairAttachment && selectedRepairFile && (
        <Alert
          type="info"
          showIcon
          message={selectedRepairFileLabel}
          description={(
            <Space direction="vertical" size={8}>
              <Typography.Text strong>{selectedRepairFile.name}</Typography.Text>
              <Typography.Text type="secondary">
                檔案大小：{formatAttachmentFileSize(selectedRepairFile.size)}
              </Typography.Text>
              {repairUploadMode === 'photo' && (
                <Space size={8} wrap>
                  <Select
                    aria-label="施工照片階段"
                    size="small"
                    className="attachment-stage-select"
                    value={repairPhotoStage}
                    options={repairPhotoStageOptions}
                    disabled={uploading}
                    onChange={setRepairPhotoStage}
                  />
                  <InputNumber
                    aria-label="施工照片排序"
                    size="small"
                    min={0}
                    precision={0}
                    value={repairSortOrder}
                    disabled={uploading}
                    addonBefore="排序"
                    onChange={(value) => setRepairSortOrder(typeof value === 'number' ? value : 0)}
                  />
                </Space>
              )}
            </Space>
          )}
          action={(
            <Space wrap>
              <Button
                size="small"
                onClick={() => {
                  if (repairUploadMode === 'photo') {
                    photoInputRef.current?.click();
                  } else {
                    documentInputRef.current?.click();
                  }
                }}
                disabled={uploading}
              >
                重新選擇
              </Button>
              <Button
                size="small"
                onClick={() => {
                  if (repairUploadMode === 'photo') {
                    selectedRepairPhotoFileRef.current = null;
                    setSelectedRepairPhotoFile(null);
                  } else {
                    selectedRepairDocumentFileRef.current = null;
                    setSelectedRepairDocumentFile(null);
                  }
                }}
                disabled={uploading}
              >
                移除
              </Button>
              <Button
                size="small"
                type="primary"
                icon={<UploadOutlined />}
                loading={uploading}
                disabled={deletingAttachmentId !== null}
                onClick={() => handleUploadFile(selectedRepairFile, repairUploadMode)}
              >
                {repairUploadMode === 'photo' ? '確認上傳施工照片' : '確認上傳其他文件'}
              </Button>
            </Space>
          )}
        />
      )}

      {!isRepairAttachment && selectedFile && (
        <Alert
          type="info"
          showIcon
          message="已選擇附件"
          description={(
            <Space direction="vertical" size={8}>
              <Typography.Text strong>{selectedFile.name}</Typography.Text>
              <Typography.Text type="secondary">
                檔案大小：{formatAttachmentFileSize(selectedFile.size)}
              </Typography.Text>
            </Space>
          )}
          action={(
            <Space wrap>
              <Button
                size="small"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                重新選擇
              </Button>
              <Button
                size="small"
                onClick={() => setSelectedFile(null)}
                disabled={uploading}
              >
                移除
              </Button>
              <Button
                size="small"
                type="primary"
                icon={<UploadOutlined />}
                loading={uploading}
                disabled={deletingAttachmentId !== null}
                onClick={() => handleUploadFile(selectedFile)}
              >
                確認上傳附件
              </Button>
            </Space>
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
        <Space direction="vertical" size={8} className="page-stack">
          <Typography.Text strong>
            已上傳附件（{listState.data.length}）
          </Typography.Text>
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
                  isPreviewableImageAttachment(attachment) ? (
                    <Button
                      key="preview"
                      icon={<EyeOutlined />}
                      aria-label={`預覽 ${getAttachmentName(attachment)}`}
                      loading={openingAttachmentId === attachment.id}
                      disabled={mutationInProgress}
                      onClick={() => handlePreview(attachment)}
                    >
                      預覽
                    </Button>
                  ) : (
                    <Button
                      key="download"
                      icon={<DownloadOutlined />}
                      aria-label={`下載 ${getAttachmentName(attachment)}`}
                      loading={openingAttachmentId === attachment.id}
                      disabled={mutationInProgress}
                      onClick={() => handleDownload(attachment)}
                    >
                      下載
                    </Button>
                  ),
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
                  title={(
                    <Space size={8} wrap>
                      <Typography.Text>{getAttachmentName(attachment)}</Typography.Text>
                      {isRepairAttachment && (
                        attachment.photo_stage ? (
                          <Tag color="blue">{getRepairPhotoStageLabel(attachment.photo_stage)}</Tag>
                        ) : (
                          <Tag>文件</Tag>
                        )
                      )}
                    </Space>
                  )}
                  description={(
                    <Space direction="vertical" size={2}>
                      <Typography.Text type="secondary">
                        建立時間：{getAttachmentCreatedAt(attachment)}
                      </Typography.Text>
                      {isRepairAttachment && attachment.photo_stage && (
                        <Typography.Text type="secondary">
                          排序：{attachment.sort_order ?? 0}
                        </Typography.Text>
                      )}
                    </Space>
                  )}
                />
              </List.Item>
            )}
          />
        </Space>
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

type RepairAttachmentManagerProps = {
  repairRequestId: string;
  onMutationBusyChange?: (busy: boolean) => void;
};

export function RepairAttachmentManager({
  repairRequestId,
  onMutationBusyChange,
}: RepairAttachmentManagerProps) {
  return (
    <AttachmentManager
      resourceType="repair_request"
      resourceId={repairRequestId}
      title="維修附件"
      onMutationBusyChange={onMutationBusyChange}
    />
  );
}
