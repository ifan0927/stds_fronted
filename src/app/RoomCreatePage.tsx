import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, InputNumber, Space, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError, classifyApiErrorForUi, createPropertyRoom } from '../api';
import { useAuth } from '../auth';
import {
  buildCreateRoomRequest,
  getRoomInitialFormValues,
  type RoomFormValues,
} from './roomForm';
import { NotFoundState } from './routeState';

function getRoomCreateReturnTo(pathname: string) {
  return `/login?reason=session-expired&returnTo=${encodeURIComponent(pathname)}`;
}

function getRoomFormErrorCopy(error: unknown) {
  if (error instanceof ApiError && error.errorCode === 'VALIDATION_ROOM_NAME_REQUIRED') {
    return '請輸入房間名稱。';
  }

  return classifyApiErrorForUi(error).description;
}

function isRoomNameRequiredError(error: unknown) {
  return error instanceof ApiError && error.errorCode === 'VALIDATION_ROOM_NAME_REQUIRED';
}

export default function RoomCreatePage() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getAccessToken } = useAuth();
  const [form] = Form.useForm<RoomFormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!propertyId) {
    return <NotFoundState />;
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {contextHolder}
      <div className="page-header">
        <div>
          <Space size={8} wrap>
            <Tag color="blue">房間管理</Tag>
            <Tag>新增房間</Tag>
          </Space>
          <Typography.Title level={1}>新增房間</Typography.Title>
          <Typography.Paragraph type="secondary">
            建立目前物業的房間主檔；租客搬入、附件與維修流程會由各自頁面承接。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/properties/${propertyId}/rooms`)}>
            回房間清冊
          </Button>
        </Space>
      </div>

      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={getRoomInitialFormValues()}
          onFinish={(values) => {
            setSubmitting(true);
            setSubmitError(null);

            void createPropertyRoom(
              propertyId,
              buildCreateRoomRequest(values),
              getAccessToken,
            )
              .then((room) => {
                void messageApi.success('房間已建立。');
                navigate(room.id ? `/properties/${propertyId}/rooms/${room.id}` : `/properties/${propertyId}/rooms`);
              })
              .catch((error: unknown) => {
                const errorState = classifyApiErrorForUi(error);

                if (errorState.kind === 'unauthorized') {
                  navigate(getRoomCreateReturnTo(location.pathname), { replace: true });
                  return;
                }

                const errorCopy = getRoomFormErrorCopy(error);

                if (isRoomNameRequiredError(error)) {
                  form.setFields([{ name: 'name', errors: [errorCopy] }]);
                }

                setSubmitError(errorCopy);
              })
              .finally(() => setSubmitting(false));
          }}
        >
          {submitError && (
            <Alert
              className="form-alert"
              type="error"
              showIcon
              message="無法建立房間"
              description={submitError}
            />
          )}
          <RoomMasterDataFields />
          <div className="form-footer-actions">
            <Button onClick={() => navigate(`/properties/${propertyId}/rooms`)}>
              取消
            </Button>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={submitting}>
              建立房間
            </Button>
          </div>
        </Form>
      </Card>
    </Space>
  );
}

type RoomMasterDataFieldsProps = {
  nameReadOnly?: boolean;
};

export function RoomMasterDataFields({ nameReadOnly = false }: RoomMasterDataFieldsProps) {
  return (
    <div className="room-form-grid">
      <Form.Item
        label="房間名稱"
        name="name"
        rules={[{ required: true, whitespace: true, message: '請輸入房間名稱。' }]}
      >
        <Input disabled={nameReadOnly} placeholder="例如：101 室" />
      </Form.Item>
      <Form.Item label="房型" name="room_type">
        <Input placeholder="例如：套房、雅房" />
      </Form.Item>
      <Form.Item label="坪數" name="size">
        <InputNumber min={0} precision={2} className="full-width-control" placeholder="例如：8.5" />
      </Form.Item>
      <Form.Item label="樓層" name="floor">
        <Input placeholder="例如：3F" />
      </Form.Item>
      <Form.Item label="區域" name="zone">
        <Input placeholder="例如：A 區" />
      </Form.Item>
      <Form.Item label="預設租金" name="default_rent_amount">
        <InputNumber min={0} precision={0} className="full-width-control" placeholder="例如：18000" />
      </Form.Item>
      <Form.Item label="房內設施" name="facilities" className="wide-form-item">
        <Input placeholder="例如：冷氣, 書桌, 衣櫃" />
      </Form.Item>
      <Form.Item label="備註" name="notes" className="wide-form-item">
        <Input.TextArea rows={4} placeholder="填寫帶看、清潔或房間主檔備註。" />
      </Form.Item>
    </div>
  );
}
