import { type ReactNode, useEffect, useRef, useState } from 'react';
import { LABSETU_THEME, type PlatformNotification } from '@diagnostic/shared';
import { type FormatLabelFn, type SidebarNavItem } from '../../dashboards/types';
import { markNotificationRead } from '../../services/firestoreService';

export interface GlobalSearchCategory {
  category: string;
  items: Array<{
    id: string;
    icon: string;
    title: string;
    subtitle: string;
    tag?: string;
    onClick: () => void;
  }>;
}

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
  globalSearchResults?: GlobalSearchCategory[];
  notifications: PlatformNotification[];
  notifTitle: string;
  notifSubtitle: string;
  notifEmptyText?: string;
  notifHeaderAction?: ReactNode;
  notifExtraBanner?: ReactNode;
  onMarkAllNotificationsRead?: () => Promise<void> | void;
  onClearAllNotifications?: () => Promise<void> | void;
  onMarkSingleNotificationRead?: (id: string) => Promise<void> | void;
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
  globalSearchResults,
  notifications,
  notifTitle,
  notifSubtitle,
  notifEmptyText = 'No notifications yet.',
  notifHeaderAction,
  notifExtraBanner,
  onMarkAllNotificationsRead,
  onClearAllNotifications,
  onMarkSingleNotificationRead,
  formatLabel,
  profile,
  onSignOut,
  children,
}: DashboardShellProps<TTab>) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
          <div
            ref={searchContainerRef}
            className="top-search-pill"
            style={{ position: 'relative' }}
          >
            <span>🔍</span>
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setSearchFocused(true);
              }}
              onFocus={() => setSearchFocused(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearchFocused(false);
              }}
            />
            {searchQuery.trim().length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onSearchChange('');
                  setSearchFocused(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94A3B8',
                  padding: '2px 6px',
                  fontSize: '0.85rem',
                  lineHeight: 1,
                }}
                title="Clear Search"
              >
                ✕
              </button>
            )}

            {searchFocused && searchQuery.trim().length >= 1 && (
              <div
                className="global-search-dropdown"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  width: '460px',
                  maxWidth: '92vw',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                  border: '1px solid #CBD5E1',
                  zIndex: 9999,
                  overflow: 'hidden',
                  maxHeight: '480px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    padding: '10px 14px',
                    backgroundColor: '#F8FAFC',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                    🔍 Search Results for &ldquo;{searchQuery}&rdquo;
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Esc to close</span>
                </div>

                <div style={{ overflowY: 'auto', padding: '8px 0', maxHeight: '420px' }}>
                  {globalSearchResults && globalSearchResults.some((c) => c.items.length > 0) ? (
                    globalSearchResults.map((cat) => {
                      if (!cat.items || cat.items.length === 0) return null;
                      return (
                        <div key={cat.category} style={{ marginBottom: '10px' }}>
                          <div
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              color: '#64748B',
                              padding: '4px 14px',
                              backgroundColor: '#F1F5F9',
                            }}
                          >
                            {cat.category} ({cat.items.length})
                          </div>
                          {cat.items.map((item) => (
                            <div
                              key={item.id}
                              onClick={() => {
                                item.onClick();
                                setSearchFocused(false);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '8px 14px',
                                cursor: 'pointer',
                                transition: 'background-color 0.15s ease',
                                borderBottom: '1px solid #F8FAFC',
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor = '#F0FDFA';
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                              }}
                            >
                              <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{item.icon}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {item.title}
                                </div>
                                <div style={{ fontSize: '0.74rem', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {item.subtitle}
                                </div>
                              </div>
                              {item.tag && (
                                <span
                                  style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                    backgroundColor: '#E0F2FE',
                                    color: '#0369A1',
                                    flexShrink: 0,
                                  }}
                                >
                                  {item.tag}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: '#64748B' }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>🔎</div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#334155' }}>
                        No results found for &ldquo;{searchQuery}&rdquo;
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: '2px' }}>
                        Try searching by Booking ID, Patient pseudonym, Lab name, or User name
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="top-nav-right">
            <div className="notif-wrapper">
              <div className="nav-icon-circle" onClick={() => setNotifOpen((prev) => !prev)}>
                <span>🔔</span>
                {unreadCount > 0 && <span className="notif-count-badge">{unreadCount}</span>}
              </div>

              {notifOpen && (
                <div className="notif-popover">
                  <div
                    className="notif-popover-header"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>{notifTitle}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{notifSubtitle}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {notifications.length > 0 && (
                        <>
                          <button
                            type="button"
                            className="btn-link-muted"
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#0D9488',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: '#CCFBF1',
                              border: 'none',
                              cursor: 'pointer',
                            }}
                            onClick={() => {
                              if (onMarkAllNotificationsRead) {
                                void onMarkAllNotificationsRead();
                              } else {
                                notifications.forEach((n) => void markNotificationRead(n.id));
                              }
                            }}
                            title="Mark all notifications as read"
                          >
                            ✓ Mark All Read
                          </button>
                          <button
                            type="button"
                            className="btn-link-muted"
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#DC2626',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: '#FEE2E2',
                              border: 'none',
                              cursor: 'pointer',
                            }}
                            onClick={() => {
                              if (onClearAllNotifications) {
                                void onClearAllNotifications();
                              }
                            }}
                            title="Clear all notifications"
                          >
                            🗑️ Clear All
                          </button>
                        </>
                      )}
                      {notifHeaderAction}
                    </div>
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
                          onClick={() => {
                            if (onMarkSingleNotificationRead) {
                              void onMarkSingleNotificationRead(n.id);
                            } else {
                              void markNotificationRead(n.id);
                            }
                          }}
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
