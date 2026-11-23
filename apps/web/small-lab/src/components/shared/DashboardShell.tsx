import { type ReactNode, useEffect, useState } from 'react';
import { LABSETU_THEME, type PlatformNotification } from '@diagnostic/shared';
import { type FormatLabelFn, type SidebarNavItem } from '../../dashboards/types';
import { markNotificationRead } from '../../services/firestoreService';

export interface DashboardShellProps<TTab extends string> {
  brandSubtitle: string;
  navItems: SidebarNavItem<TTab>[];
  activeTab: TTab;
  onSelectTab: (tab: TTab) => void;
  footerCard: {
    icon: string;
    title: string;
    subtitle: string;
    onClick?: () => void;
  };
  searchPlaceholder: string;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  notifications: PlatformNotification[];
  notifTitle: string;
  notifSubtitle: string;
  notifEmptyText?: string;
  notifHeaderAction?: ReactNode;
  notifExtraBanner?: ReactNode;
  formatLabel: FormatLabelFn;
  profile: {
    initials: string;
    displayName: string;
    userCode?: string;
    roleSummary: string;
  };
  onSignOut: () => void;
  children: ReactNode;
}

export function DashboardShell<TTab extends string>({
  brandSubtitle,
  navItems,
  activeTab,
  onSelectTab,
  footerCard,
  searchPlaceholder,
  searchQuery,
  onSearchChange,
  notifications,
  notifTitle,
  notifSubtitle,
  notifEmptyText = 'No notifications yet.',
  notifHeaderAction,
  notifExtraBanner,
  formatLabel,
  profile,
  onSignOut,
  children,
}: DashboardShellProps<TTab>) {
  const [notifOpen, setNotifOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.querySelectorAll('.dashboard-content, .main-wrapper, .admin-layout, main, #root').forEach((el) => {
      el.scrollTop = 0;
    });
  }, [activeTab]);

  function renderBadgeClass(variant?: 'teal' | 'green' | 'red') {
    if (variant === 'green') return 'nav-badge-green';
    if (variant === 'red') return 'nav-badge-red';
    return 'nav-badge-teal';
  }

  return (
    <div className="app-shell">
      <aside className="sidebar-dark">
        <div className="brand-header">
          <div className="brand-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
            </svg>
          </div>
          <div className="brand-title-wrap">
            <span className="brand-title">{LABSETU_THEME.brand.name}</span>
            <span className="brand-subtitle">{brandSubtitle}</span>
          </div>
        </div>

        <ul className="sidebar-nav">
          {navItems.map((item) => {
            const isItemActive =
              activeTab === item.id || Boolean(item.activeMatchIds?.includes(activeTab));
            const hasChildren = Boolean(item.subItems && item.subItems.length > 0);
            return (
              <div key={item.id}>
                {item.sectionLabel && (
                  <li className="sidebar-section-label">{item.sectionLabel}</li>
                )}
                <li
                  className={`sidebar-nav-item ${isItemActive ? 'active' : ''}`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                    e.preventDefault();
                    if (hasChildren && item.onToggleExpand) {
                      item.onToggleExpand();
                    } else {
                      onSelectTab(item.id);
                    }
                  }}
                >
                  <a
                    href={item.path || '#'}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                      e.preventDefault();
                      if (hasChildren && item.onToggleExpand) {
                        item.onToggleExpand();
                      } else {
                        onSelectTab(item.id);
                      }
                    }}
                    style={{
                      display: 'contents',
                      color: 'inherit',
                      textDecoration: 'none',
                    }}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    {typeof item.badgeCount === 'number' && !hasChildren && (
                      <span className={renderBadgeClass(item.badgeVariant)}>
                        {item.badgeCount}
                      </span>
                    )}
                    {hasChildren && (
                      <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>
                        {item.isExpanded ? '▾' : '▸'}
                      </span>
                    )}
                  </a>
                </li>
                {hasChildren && item.isExpanded && item.subItems && (
                  <ul className="sidebar-submenu">
                    {item.subItems.map((sub) => (
                      <li
                        key={sub.id}
                        className={`sidebar-subitem ${activeTab === sub.id ? 'active' : ''}`}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                          e.preventDefault();
                          onSelectTab(sub.id);
                        }}
                      >
                        <a
                          href={sub.path || '#'}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                            e.preventDefault();
                            onSelectTab(sub.id);
                          }}
                          style={{
                            display: 'contents',
                            color: 'inherit',
                            textDecoration: 'none',
                          }}
                        >
                          {sub.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </ul>

        <div className="sidebar-footer-card" onClick={footerCard.onClick}>
          <div className="sidebar-footer-icon">{footerCard.icon}</div>
          <div>
            <div className="sidebar-footer-title">{footerCard.title}</div>
            <div className="sidebar-footer-subtitle">{footerCard.subtitle}</div>
          </div>
        </div>
      </aside>

      <div className="main-wrapper">
        <header className="top-navbar">
          <div className="top-search-pill">
            <span>🔍</span>
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <div className="top-nav-right">
            <div className="notif-wrapper">
              <div className="nav-icon-circle" onClick={() => setNotifOpen((prev) => !prev)}>
                <span>🔔</span>
                {unreadCount > 0 && <span className="notif-count-badge">{unreadCount}</span>}
              </div>

              {notifOpen && (
                <div className="notif-popover">
                  <div className="notif-popover-header">
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>{notifTitle}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{notifSubtitle}</div>
                    </div>
                    {notifHeaderAction}
                  </div>
                  {notifExtraBanner}
                  <div className="notif-list">
                    {notifications.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.82rem', color: '#64748B' }}>
                        {notifEmptyText}
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`notif-item ${!n.read ? 'unread' : ''}`}
                          onClick={() => void markNotificationRead(n.id)}
                        >
                          <div className="notif-item-title">{n.title}</div>
                          <div className="notif-item-msg">{n.message}</div>
                          <div className="notif-item-meta">
                            <span>{formatLabel(n.category)}</span>
                            <span>{new Date(n.createdAt).toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="user-profile-badge">
              <div className="user-photo-avatar">{profile.initials}</div>
              <div className="user-profile-info">
                <span className="user-profile-name" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span>{profile.displayName}</span>
                  {profile.userCode && (
                    <span className="user-code-badge">{profile.userCode}</span>
                  )}
                </span>
                <span className="user-profile-role">{profile.roleSummary}</span>
              </div>
              <button type="button" className="signout-btn" onClick={onSignOut}>
                Sign Out
              </button>
            </div>
          </div>
        </header>

        <main className="dashboard-content">{children}</main>
      </div>
    </div>
  );
}
