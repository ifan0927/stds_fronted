import {
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  CarryOutOutlined,
  DashboardOutlined,
  FileTextOutlined,
  GlobalOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  ReadOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Drawer, Grid, Layout, Menu, Select, Space, Tag, Typography } from 'antd';
import type { ItemType } from 'antd/es/menu/interface';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { classifyApiErrorForUi, listProperties, type Property } from '../api';
import { getRoleLabel, useAuth } from '../auth';
import { abortRequest } from './requestAbort';

const { Header, Content, Sider } = Layout;
const { useBreakpoint } = Grid;

function getRoutePropertyId(
  pathname: string,
  fallbackPropertyId: string | undefined,
): string | undefined {
  const match = pathname.match(/^\/properties\/([^/]+)/);
  return match?.[1] ?? fallbackPropertyId;
}

type PropertyOption = {
  value: string;
  label: string;
};

type PropertyOptionsLoadState =
  | { status: 'idle'; options: PropertyOption[] }
  | { status: 'loading'; options: PropertyOption[] }
  | { status: 'ready'; options: PropertyOption[] }
  | { status: 'error'; options: PropertyOption[] };

function getPropertyDisplayName(property: Property) {
  return property.name?.trim() || property.address?.trim() || '未命名物業';
}

function getPropertyOptions(properties: Property[]) {
  return properties
    .filter((property): property is Property & { id: string } => typeof property.id === 'string')
    .map((property) => ({
      value: property.id,
      label: getPropertyDisplayName(property),
    }));
}

function getPropertyName(propertyId: string | undefined, options: PropertyOption[], loading: boolean) {
  if (!propertyId) {
    return '尚未選擇物業';
  }

  const option = options.find((item) => item.value === propertyId);

  if (option) {
    return option.label;
  }

  return loading ? '載入物業中' : '目前物業';
}

function createPropertyMenuItem(
  propertyId: string | undefined,
  pathSuffix: string,
  label: string,
  icon: ReactNode,
): ItemType {
  const disabled = !propertyId;
  const path = propertyId ? `/properties/${propertyId}${pathSuffix}` : `property-disabled-${pathSuffix || 'dashboard'}`;

  return {
    key: path,
    icon,
    disabled,
    label: disabled ? label : <Link to={path}>{label}</Link>,
  };
}

function createMenuItems(propertyId: string | undefined, role: string | undefined): ItemType[] {
  const managementChildren: ItemType[] = [
    {
      key: '/account',
      icon: <UserOutlined />,
      label: <Link to="/account">我的帳號</Link>,
    },
    {
      key: '/properties',
      icon: <AppstoreOutlined />,
      label: <Link to="/properties">物業管理</Link>,
    },
  ];

  if (role === 'admin' || role === 'organizer') {
    managementChildren.push({
      key: '/admin/brand',
      icon: <GlobalOutlined />,
      label: <Link to="/admin/brand">品牌內容</Link>,
    });
  }

  if (role !== 'owner') {
    managementChildren.push({
      key: '/admin/members',
      icon: <ReadOutlined />,
      label: <Link to="/admin/members">成員與權限</Link>,
    });
  }

  return [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: <Link to="/">工作台</Link>,
    },
    {
      key: 'daily',
      label: '日常作業',
      type: 'group',
      children: [
        createPropertyMenuItem(propertyId, '', '物業工作台', <HomeOutlined />),
        createPropertyMenuItem(propertyId, '/rooms', '房間管理', <BankOutlined />),
        createPropertyMenuItem(propertyId, '/tenants', '租客與租約', <TeamOutlined />),
        createPropertyMenuItem(propertyId, '/checkout', '退租審核', <CarryOutOutlined />),
        createPropertyMenuItem(propertyId, '/billing', '帳單與抄表', <AuditOutlined />),
        createPropertyMenuItem(propertyId, '/journal', '日誌與維修', <ToolOutlined />),
        createPropertyMenuItem(propertyId, '/reports', '報表中心', <FileTextOutlined />),
      ],
    },
    {
      key: 'management',
      label: '管理',
      type: 'group',
      children: managementChildren,
    },
  ];
}

function getSelectedKey(pathname: string) {
  if (pathname === '/') {
    return '/';
  }

  const billingMatch = pathname.match(/^\/properties\/([^/]+)\/billing(?:\/.*)?$/);
  if (billingMatch) {
    return `/properties/${billingMatch[1]}/billing`;
  }

  if (pathname.startsWith('/admin/members')) {
    return '/admin/members';
  }

  if (pathname.startsWith('/admin/brand')) {
    return '/admin/brand';
  }

  return pathname;
}

function getPropertySwitchPath(pathname: string, nextPropertyId: string) {
  const basePath = `/properties/${nextPropertyId}`;
  const match = pathname.match(/^\/properties\/[^/]+(?:\/(.+))?$/);
  const suffix = match?.[1] ?? '';

  if (suffix === 'rooms') {
    return `${basePath}/rooms`;
  }

  if (suffix === 'tenants') {
    return `${basePath}/tenants`;
  }

  if (suffix === 'checkout') {
    return `${basePath}/checkout`;
  }

  if (suffix === 'billing') {
    return `${basePath}/billing`;
  }

  if (suffix === 'billing/meter-history') {
    return `${basePath}/billing/meter-history`;
  }

  if (suffix === 'journal') {
    return `${basePath}/journal`;
  }

  if (suffix === 'reports') {
    return `${basePath}/reports`;
  }

  if (suffix === 'rooms/new' || suffix.startsWith('rooms/')) {
    return `${basePath}/rooms`;
  }

  if (suffix.startsWith('tenants/') || suffix.startsWith('leases/')) {
    return `${basePath}/tenants`;
  }

  if (suffix.startsWith('force-terminations/')) {
    return `${basePath}/checkout`;
  }

  return basePath;
}

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const { currentUser, getAccessToken, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const [propertyOptionsState, setPropertyOptionsState] = useState<PropertyOptionsLoadState>({
    status: 'idle',
    options: [],
  });
  const propertyId = getRoutePropertyId(location.pathname, currentUser?.assigned_property_ids?.[0]);
  const propertyOptions = propertyOptionsState.options;
  const propertyName = getPropertyName(
    propertyId,
    propertyOptions,
    propertyOptionsState.status === 'loading',
  );
  const menuItems = useMemo(() => createMenuItems(propertyId, currentUser?.role), [currentUser?.role, propertyId]);
  const selectedKeys = [getSelectedKey(location.pathname)];
  const isMobile = !screens.md;
  const roleLabel = getRoleLabel(currentUser?.role);
  const displayName = currentUser?.name ?? currentUser?.email ?? '使用者';
  const displayEmail = currentUser?.email ?? '';
  const selectorValue = propertyOptions.some((item) => item.value === propertyId) ? propertyId : undefined;
  const selectorDisabled = propertyOptions.length === 0;
  const selectorPlaceholder = propertyOptionsState.status === 'loading'
    ? '載入物業中'
    : '選擇物業';

  useEffect(() => {
    if (!currentUser) {
      abortRequest(activeRequestRef.current);
      setPropertyOptionsState({ status: 'idle', options: [] });
      return undefined;
    }

    abortRequest(activeRequestRef.current);
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setPropertyOptionsState((previous) => ({ status: 'loading', options: previous.options }));

    void listProperties(getAccessToken, { signal: controller.signal })
      .then((response) => {
        if (activeRequestRef.current !== controller) {
          return;
        }

        setPropertyOptionsState({
          status: 'ready',
          options: getPropertyOptions(response.data ?? []),
        });
      })
      .catch((error: unknown) => {
        if (activeRequestRef.current !== controller) {
          return;
        }

        const errorState = classifyApiErrorForUi(error);

        if (errorState.kind === 'cancelled') {
          return;
        }

        setPropertyOptionsState((previous) => ({ status: 'error', options: previous.options }));
      });

    return () => abortRequest(controller);
  }, [currentUser, getAccessToken]);

  const renderPropertySelector = () => (
    <Select
      className="property-selector"
      aria-label="選擇物業"
      value={selectorValue}
      placeholder={selectorPlaceholder}
      loading={propertyOptionsState.status === 'loading'}
      disabled={selectorDisabled}
      options={propertyOptions}
      onChange={(value) => {
        navigate(getPropertySwitchPath(location.pathname, value));
        setDrawerOpen(false);
      }}
    />
  );

  const menu = (
    <div className="shell-menu">
      <div className="shell-brand">
        <Typography.Text className="shell-brand-title">STDS 管理後台</Typography.Text>
        <Typography.Text className="shell-brand-subtitle">內部營運工具</Typography.Text>
      </div>
      <div className="property-context">
        <Typography.Text className="property-context-label">目前物業</Typography.Text>
        <Typography.Text className="property-context-title">{propertyName}</Typography.Text>
        {renderPropertySelector()}
        <Typography.Text className="property-context-note">
          {propertyOptionsState.status === 'error'
            ? '物業清單暫時無法讀取。'
            : '選擇後會切換目前物業。'}
        </Typography.Text>
      </div>
      <Menu
        mode="inline"
        theme="dark"
        selectedKeys={selectedKeys}
        items={menuItems}
        onClick={() => setDrawerOpen(false)}
      />
    </div>
  );

  return (
    <Layout className="app-shell">
      {!isMobile && (
        <Sider width={248} className="app-sider">
          {menu}
        </Sider>
      )}

      <Layout className="app-main">
        <Header className="app-header">
          <Space size={12} className="header-context">
            {isMobile && (
              <Button
                aria-label="開啟主選單"
                icon={<MenuFoldOutlined />}
                onClick={() => setDrawerOpen(true)}
              />
            )}
            <Tag color="blue">目前物業</Tag>
            <div className="header-property">
              <Typography.Text strong>{propertyName}</Typography.Text>
              <Typography.Text type="secondary">
                可在側邊欄切換物業
              </Typography.Text>
            </div>
          </Space>
          <Space size={12} className="header-user">
            <Tag color="green">{roleLabel}</Tag>
            <Avatar>{displayName.slice(0, 1)}</Avatar>
            {!isMobile && (
              <div>
                <Typography.Text strong>{displayName}</Typography.Text>
                <Typography.Text type="secondary" className="header-email">
                  {displayEmail}
                </Typography.Text>
              </div>
            )}
            <Button
              aria-label="我的帳號"
              icon={<UserOutlined />}
              onClick={() => navigate('/account')}
            />
            <Button
              aria-label="登出"
              icon={<LogoutOutlined />}
              onClick={() => void logout()}
            />
          </Space>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>

      <Drawer
        title="STDS 管理後台"
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={300}
        className="mobile-nav-drawer"
      >
        {menu}
      </Drawer>
    </Layout>
  );
}
