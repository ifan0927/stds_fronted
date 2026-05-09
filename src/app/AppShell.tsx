import {
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  DashboardOutlined,
  FileTextOutlined,
  HomeOutlined,
  MenuFoldOutlined,
  ReadOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Drawer, Grid, Layout, Menu, Space, Tag, Typography } from 'antd';
import type { ItemType } from 'antd/es/menu/interface';
import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

const { Header, Content, Sider } = Layout;
const { useBreakpoint } = Grid;

const activeProperty = {
  id: 'demo-property',
  name: '台北大安物業',
  roleLabel: '營運管理',
};

function getRoutePropertyId(pathname: string) {
  const match = pathname.match(/^\/properties\/([^/]+)/);
  return match?.[1] ?? activeProperty.id;
}

function getPropertyName(propertyId: string) {
  if (propertyId === activeProperty.id) {
    return activeProperty.name;
  }

  return `物業 ${propertyId}`;
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const propertyId = getRoutePropertyId(location.pathname);
  const propertyName = getPropertyName(propertyId);
  const menuItems = useMemo(() => createMenuItems(propertyId), [propertyId]);
  const selectedKeys = [getSelectedKey(location.pathname)];
  const isMobile = !screens.md;

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
          由 route 決定 context，切換器會在後續資料接上。
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
            <Tag color="green">{activeProperty.roleLabel}</Tag>
            <Avatar>陳</Avatar>
            {!isMobile && (
              <div>
                <Typography.Text strong>陳營運</Typography.Text>
                <Typography.Text type="secondary" className="header-email">
                  chen.ops@example.com
                </Typography.Text>
              </div>
            )}
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
