import {
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  DashboardOutlined,
  FileTextOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  ReadOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Drawer, Grid, Layout, Menu, Space, Tag, Typography } from 'antd';
import type { ItemType } from 'antd/es/menu/interface';
import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { getRoleLabel, useAuth } from '../auth';

const { Header, Content, Sider } = Layout;
const { useBreakpoint } = Grid;

function getRoutePropertyId(pathname: string, fallbackPropertyId: string | undefined) {
  const match = pathname.match(/^\/properties\/([^/]+)/);
  return match?.[1] ?? fallbackPropertyId ?? 'current-property';
}

function getPropertyName(propertyId: string) {
  return propertyId === 'current-property' ? '尚未選擇物業' : `物業 ${propertyId}`;
}

function createMenuItems(propertyId: string): ItemType[] {
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
        {
          key: `/properties/${propertyId}`,
          icon: <HomeOutlined />,
          label: <Link to={`/properties/${propertyId}`}>物業工作台</Link>,
        },
        {
          key: `/properties/${propertyId}/rooms`,
          icon: <BankOutlined />,
          label: <Link to={`/properties/${propertyId}/rooms`}>房間管理</Link>,
        },
        {
          key: `/properties/${propertyId}/tenants`,
          icon: <TeamOutlined />,
          label: <Link to={`/properties/${propertyId}/tenants`}>租客與租約</Link>,
        },
        {
          key: `/properties/${propertyId}/billing`,
          icon: <AuditOutlined />,
          label: <Link to={`/properties/${propertyId}/billing`}>抄表與帳單</Link>,
        },
        {
          key: `/properties/${propertyId}/journal`,
          icon: <ToolOutlined />,
          label: <Link to={`/properties/${propertyId}/journal`}>日誌與維修</Link>,
        },
        {
          key: `/properties/${propertyId}/reports`,
          icon: <FileTextOutlined />,
          label: <Link to={`/properties/${propertyId}/reports`}>財務報表</Link>,
        },
      ],
    },
    {
      key: 'management',
      label: '管理',
      type: 'group',
      children: [
        {
          key: '/properties',
          icon: <AppstoreOutlined />,
          label: <Link to="/properties">物業管理</Link>,
        },
        {
          key: '/admin/members',
          icon: <ReadOutlined />,
          label: <Link to="/admin/members">成員與權限</Link>,
        },
      ],
    },
  ];
}

function getSelectedKey(pathname: string) {
  if (pathname === '/') {
    return '/';
  }

  return pathname;
}

export default function AppShell() {
  const location = useLocation();
  const screens = useBreakpoint();
  const { currentUser, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const propertyId = getRoutePropertyId(location.pathname, currentUser?.assigned_property_ids?.[0]);
  const propertyName = getPropertyName(propertyId);
  const menuItems = useMemo(() => createMenuItems(propertyId), [propertyId]);
  const selectedKeys = [getSelectedKey(location.pathname)];
  const isMobile = !screens.md;
  const roleLabel = getRoleLabel(currentUser?.role);
  const displayName = currentUser?.name ?? currentUser?.email ?? '使用者';
  const displayEmail = currentUser?.email ?? '';

  const menu = (
    <div className="shell-menu">
      <div className="shell-brand">
        <Typography.Text className="shell-brand-title">STDS 管理後台</Typography.Text>
        <Typography.Text className="shell-brand-subtitle">內部營運工具</Typography.Text>
      </div>
      <div className="property-context">
        <Typography.Text className="property-context-label">目前物業</Typography.Text>
        <Typography.Text className="property-context-title">{propertyName}</Typography.Text>
        <Typography.Text className="property-context-note">
          由 route 與後端授權共同決定可見內容。
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
                route 與後端授權會共同決定可見內容
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
