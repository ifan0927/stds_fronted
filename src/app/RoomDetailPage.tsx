import {
  ArrowLeftOutlined,
  AuditOutlined,
  DeleteOutlined,
  EditOutlined,
  FileSearchOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  SaveOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  classifyApiErrorForUi,
  createRoomMaintenance,
  deleteRoom,
  getRoom,
  updateRoom,
  type Room,
} from '../api';
import { useAuth } from '../auth';
import { formatDashboardDateTime, formatTwd, getRoomStatusLabel } from './format';
import { getMutationFailureFeedback, getMutationSuccessFeedback } from './operation';
import { getCanonicalRoomDetailPath, getRoomMutationErrorCopy } from './roomDetail';
import {
  buildUpdateRoomRequest,
  facilitiesToText,
  getRoomInitialFormValues,
  type RoomFormValues,
} from './roomForm';
import { RoomMasterDataFields } from './RoomCreatePage';
import { abortRequest } from './requestAbort';
import {
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RetryableErrorState,
} from './routeState';

type RoomDetailLoadState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: Room }
  | { status: 'forbidden'; data: null }
  | { status: 'not-found'; data: null }
  | { status: 'error'; data: null };

type MaintenanceFormValues = {
  title: string;
  description: string;
};

function getRoomReturnTo(pathname: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(pathname)}`;
}

function getOptionalText(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : '未提供';
}

function getNullableNumberText(value: number | null | undefined, suffix = '') {
  return value === null || value === undefined ? '未提供' : `${value}${suffix}`;
}

function getRoomStatusColor(status: Room['status']) {
  if (status === 'occupied') {
    return 'green';
  }

  if (status === 'maintenance') {
    return 'orange';
  }

  if (status === 'vacant') {
    return 'blue';
  }

  return 'default';
}

function getPlaceholderLinks(propertyId: string | undefined, room: Room) {
  const roomId = room.id;

  if (!propertyId || !roomId) {
    return [];
  }

  return [
    {
      title: room.status === 'vacant' ? '搬入租客' : '租客與租約',
      description: room.status === 'vacant'
        ? '前往空房搬入流程。'
        : '前往租客與租約頁面查看此房間脈絡。',
      path: `/properties/${propertyId}/tenants?roomId=${encodeURIComponent(roomId)}${room.status === 'vacant' ? '&mode=move-in' : ''}`,
      icon: <TeamOutlined />,
    },
    {
      title: '抄表與帳單',
      description: '前往帳單或抄表頁面，內容由帳務 issue 承接。',
      path: `/properties/${propertyId}/billing?roomId=${encodeURIComponent(roomId)}`,
      icon: <AuditOutlined />,
    },
    {
      title: '抄表歷史',
      description: '前往房間抄表歷史入口，內容由抄表歷史 issue 承接。',
      path: `/properties/${propertyId}/billing?roomId=${encodeURIComponent(roomId)}&view=meter-history`,
      icon: <FileSearchOutlined />,
    },
    {
      title: '日誌與維修',
      description: '前往日誌與維修工作區，完整生命週期由維修 issue 承接。',
      path: `/properties/${propertyId}/journal?roomId=${encodeURIComponent(roomId)}`,
      icon: <ToolOutlined />,
    },
  ];
}

export default function RoomDetailPage() {
  const { propertyId, roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getAccessToken } = useAuth();
  const activeRequestRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);
  const requestIdRef = useRef(0);
  const [loadState, setLoadState] = useState<RoomDetailLoadState>({ status: 'loading', data: null });
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const loadRoom = useCallback(() => {
    if (!roomId) {
      setLoadState({ status: 'not-found', data: null });
      return;
    }

    abortRequest(activeRequestRef.current?.controller);
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeRequestRef.current = { id: requestId, controller };
    setLoadState({ status: 'loading', data: null });

    void getRoom(roomId, getAccessToken, { signal: controller.signal })
      .then((room) => {
        if (activeRequestRef.current?.id !== requestId) {
          return;
        }

        const canonicalPath = getCanonicalRoomDetailPath(propertyId, roomId, room);

        if (canonicalPath) {
          navigate(canonicalPath, { replace: true });
          return;
        }

        setLoadState({ status: 'ready', data: room });
      })
      .catch((error: unknown) => {
        if (activeRequestRef.current?.id !== requestId) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        if (errorState.kind === 'unauthorized') {
          navigate(getRoomReturnTo(location.pathname), { replace: true });
          return;
        }

        if (errorState.kind === 'forbidden') {
          setLoadState({ status: 'forbidden', data: null });
          return;
        }

        if (errorState.kind === 'not-found') {
          setLoadState({ status: 'not-found', data: null });
          return;
        }

        setLoadState({ status: 'error', data: null });
      });
  }, [getAccessToken, location.pathname, navigate, propertyId, roomId]);

  useEffect(() => {
    loadRoom();

    return () => abortRequest(activeRequestRef.current?.controller);
  }, [loadRoom]);

  if (loadState.status === 'loading') {
    return <LoadingState />;
  }

  if (loadState.status === 'forbidden') {
    return <ForbiddenState />;
  }

  if (loadState.status === 'not-found') {
    return <NotFoundState />;
  }

  if (loadState.status === 'error') {
    return <RetryableErrorState onRetry={() => loadRoom()} />;
  }

  const room = loadState.data;
  const isVacant = room.status === 'vacant';
  const roomName = room.name ?? '房間詳情';
  const links = getPlaceholderLinks(propertyId, room);
  const unavailableActionReason = isVacant
    ? ''
    : '出租中或維修中的房間不能在此直接刪除，也不能重複建立維修入口。';

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {contextHolder}
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">房間管理</Tag>
            <Tag color={getRoomStatusColor(room.status)}>{getRoomStatusLabel(room.status)}</Tag>
          </Space>
          <Typography.Title level={1}>{roomName}</Typography.Title>
          <Typography.Paragraph type="secondary">
            房間主檔、狀態與相鄰工作流入口。租約、帳單、附件與完整維修流程由各自頁面承接。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(propertyId ? `/properties/${propertyId}/rooms` : '/properties')}
          >
            回房間清冊
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadRoom()}>
            重新整理
          </Button>
          <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
            編輯
          </Button>
          {isVacant ? (
            <Button icon={<ToolOutlined />} onClick={() => setMaintenanceOpen(true)}>
              設為維修
            </Button>
          ) : (
            <Tooltip title={unavailableActionReason}>
              <span>
                <Button icon={<ToolOutlined />} disabled>
                  設為維修
                </Button>
              </span>
            </Tooltip>
          )}
          {isVacant ? (
            <Button danger icon={<DeleteOutlined />} onClick={() => setDeleteOpen(true)}>
              刪除
            </Button>
          ) : (
            <Tooltip title={unavailableActionReason}>
              <span>
                <Button danger icon={<DeleteOutlined />} disabled>
                  刪除
                </Button>
              </span>
            </Tooltip>
          )}
        </Space>
      </div>

      <Card title="房間主檔">
        <Descriptions column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label="房間名稱">{roomName}</Descriptions.Item>
          <Descriptions.Item label="房況">
            <Tag color={getRoomStatusColor(room.status)}>{getRoomStatusLabel(room.status)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="房型">{getOptionalText(room.room_type)}</Descriptions.Item>
          <Descriptions.Item label="坪數">{getNullableNumberText(room.size, ' 坪')}</Descriptions.Item>
          <Descriptions.Item label="樓層">{getOptionalText(room.floor)}</Descriptions.Item>
          <Descriptions.Item label="區域">{getOptionalText(room.zone)}</Descriptions.Item>
          <Descriptions.Item label="預設租金">
            {room.default_rent_amount === null || room.default_rent_amount === undefined
              ? '未提供'
              : formatTwd(room.default_rent_amount)}
          </Descriptions.Item>
          <Descriptions.Item label="房內設施">{getOptionalText(facilitiesToText(room.facilities))}</Descriptions.Item>
          <Descriptions.Item label="備註" span={2}>{getOptionalText(room.notes)}</Descriptions.Item>
          <Descriptions.Item label="建立時間">
            {room.created_at ? formatDashboardDateTime(room.created_at) : '未提供'}
          </Descriptions.Item>
          <Descriptions.Item label="更新時間">
            {room.updated_at ? formatDashboardDateTime(room.updated_at) : '未提供'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="工作入口">
        <div className="property-link-grid">
          {links.map((item) => (
            <Link className="property-link-row" to={item.path} key={item.path}>
              <Space size={12} align="start">
                <span className="property-link-icon">{item.icon}</span>
                <span>
                  <Typography.Text strong>{item.title}</Typography.Text>
                  <Typography.Text type="secondary">{item.description}</Typography.Text>
                </span>
              </Space>
            </Link>
          ))}
          <div className="property-link-row disabled-link-row">
            <Space size={12} align="start">
              <span className="property-link-icon"><PaperClipOutlined /></span>
              <span>
                <Typography.Text strong>附件管理</Typography.Text>
                <Typography.Text type="secondary">附件上傳與管理已排入 P2，這裡先保留入口位置。</Typography.Text>
              </span>
            </Space>
          </div>
        </div>
      </Card>

      <RoomEditModal
        open={editOpen}
        room={room}
        onCancel={() => setEditOpen(false)}
        onSuccess={(updatedRoom) => {
          setEditOpen(false);
          setLoadState({ status: 'ready', data: updatedRoom });
          void messageApi.success(getMutationSuccessFeedback('房間資料更新').content);
        }}
      />
      <RoomDeleteModal
        open={deleteOpen}
        room={room}
        propertyId={propertyId}
        onCancel={() => setDeleteOpen(false)}
      />
      <RoomMaintenanceModal
        open={maintenanceOpen}
        room={room}
        propertyId={propertyId}
        onCancel={() => setMaintenanceOpen(false)}
        onSuccess={(updatedRoom, repairRequestId) => {
          setMaintenanceOpen(false);
          setLoadState({ status: 'ready', data: updatedRoom });
          void messageApi.success('已建立維修入口，房間狀態已更新。');
          if (propertyId && room.id) {
            const query = new URLSearchParams({ roomId: room.id });

            if (repairRequestId) {
              query.set('repairRequestId', repairRequestId);
            }

            navigate(`/properties/${propertyId}/journal?${query.toString()}`);
          }
        }}
      />
    </Space>
  );
}

type RoomEditModalProps = {
  open: boolean;
  room: Room;
  onCancel: () => void;
  onSuccess: (room: Room) => void;
};

function RoomEditModal({ open, room, onCancel, onSuccess }: RoomEditModalProps) {
  const { getAccessToken } = useAuth();
  const [form] = Form.useForm<RoomFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      form.setFieldsValue(getRoomInitialFormValues(room));
      setSubmitError(null);
    }
  }, [form, open, room]);

  return (
    <Modal
      title="編輯房間"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={760}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => {
          if (!room.id) {
            setSubmitError('房間資料不完整，請重新整理後再試。');
            return;
          }

          setSubmitting(true);
          setSubmitError(null);
          void updateRoom(room.id, buildUpdateRoomRequest(values, room), getAccessToken)
            .then(onSuccess)
            .catch((error: unknown) => {
              const errorState = classifyApiErrorForUi(error);
              setSubmitError(getRoomMutationErrorCopy(error));

              if (errorState.kind !== 'validation') {
                void message.error(getMutationFailureFeedback(errorState).content);
              }
            })
            .finally(() => setSubmitting(false));
        }}
      >
        {submitError && (
          <Alert
            className="form-alert"
            type="error"
            showIcon
            message="無法儲存房間"
            description={submitError}
          />
        )}
        <RoomMasterDataFields />
        <div className="form-footer-actions">
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={submitting}>
            儲存
          </Button>
        </div>
      </Form>
    </Modal>
  );
}

type RoomDeleteModalProps = {
  open: boolean;
  room: Room;
  propertyId: string | undefined;
  onCancel: () => void;
};

function RoomDeleteModal({ open, room, propertyId, onCancel }: RoomDeleteModalProps) {
  const navigate = useNavigate();
  const { getAccessToken } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSubmitError(null);
    }
  }, [open]);

  return (
    <Modal
      title="刪除房間"
      open={open}
      onCancel={onCancel}
      okText="刪除"
      okButtonProps={{ danger: true, loading: submitting }}
      cancelText="取消"
      onOk={() => {
        if (!room.id) {
          setSubmitError('房間資料不完整，請重新整理後再試。');
          return;
        }

        setSubmitting(true);
        setSubmitError(null);
        void deleteRoom(room.id, getAccessToken)
          .then(() => {
            void message.success('房間已刪除。');
            navigate(propertyId ? `/properties/${propertyId}/rooms` : '/properties');
          })
          .catch((error: unknown) => setSubmitError(getRoomMutationErrorCopy(error)))
          .finally(() => setSubmitting(false));
      }}
    >
      <Alert
        type="warning"
        showIcon
        message={`確認刪除 ${room.name ?? '此房間'}？`}
        description="刪除後此房間不會出現在一般管理清冊。出租中或維修中的房間會由系統拒絕。"
      />
      {submitError && (
        <Alert
          className="form-alert"
          type="error"
          showIcon
          message="無法刪除房間"
          description={submitError}
        />
      )}
    </Modal>
  );
}

type RoomMaintenanceModalProps = {
  open: boolean;
  room: Room;
  propertyId: string | undefined;
  onCancel: () => void;
  onSuccess: (room: Room, repairRequestId: string | undefined) => void;
};

function RoomMaintenanceModal({
  open,
  room,
  propertyId,
  onCancel,
  onSuccess,
}: RoomMaintenanceModalProps) {
  const { getAccessToken } = useAuth();
  const [form] = Form.useForm<MaintenanceFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      form.resetFields();
      setSubmitError(null);
    }
  }, [form, open]);

  return (
    <Modal
      title={`將 ${room.name ?? '房間'} 設為維修`}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => {
          if (!room.id) {
            setSubmitError('房間資料不完整，請重新整理後再試。');
            return;
          }

          setSubmitting(true);
          setSubmitError(null);
          void createRoomMaintenance(room.id, values, getAccessToken)
            .then((response) => {
              onSuccess(response.room, response.repair_request.id);
            })
            .catch((error: unknown) => setSubmitError(getRoomMutationErrorCopy(error)))
            .finally(() => setSubmitting(false));
        }}
      >
        <Alert
          className="form-alert"
          type="info"
          showIcon
          message="只建立維修入口"
          description="這裡只送出維修標題與描述，完整派工、進度、完成與取消會在日誌與維修頁面處理。"
        />
        {submitError && (
          <Alert
            className="form-alert"
            type="error"
            showIcon
            message="無法建立維修入口"
            description={submitError}
          />
        )}
        <Form.Item
          label="維修標題"
          name="title"
          rules={[{ required: true, whitespace: true, message: '請輸入維修標題。' }]}
        >
          <Input placeholder="例如：浴室漏水" />
        </Form.Item>
        <Form.Item
          label="問題描述"
          name="description"
          rules={[{ required: true, whitespace: true, message: '請輸入問題描述。' }]}
        >
          <Input.TextArea rows={4} placeholder="描述目前看到的問題與需要處理的狀況。" />
        </Form.Item>
        <div className="form-footer-actions">
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" htmlType="submit" icon={<ToolOutlined />} loading={submitting}>
            建立維修入口
          </Button>
        </div>
      </Form>
      {!propertyId && (
        <Typography.Text type="secondary">
          缺少物業脈絡時，建立後只會更新目前房間狀態。
        </Typography.Text>
      )}
    </Modal>
  );
}
