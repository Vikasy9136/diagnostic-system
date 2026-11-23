import { useCallback, useEffect, useState } from 'react';

export interface UseDashboardPageRouterOptions<TTab extends string> {
  resolveTabFromPath: (pathname: string) => TTab;
  resolvePathForTab: (tab: TTab) => string;
  resolveTitleForTab: (tab: TTab) => string;
  defaultTab: TTab;
  baseRoleQuery?: string;
  onTabChange?: (tab: TTab) => void;
}

export function useDashboardPageRouter<TTab extends string>({
  resolveTabFromPath,
  resolvePathForTab,
  resolveTitleForTab,
  defaultTab,
  baseRoleQuery,
  onTabChange,
}: UseDashboardPageRouterOptions<TTab>) {
  const [activeTab, setActiveTabState] = useState<TTab>(() => {
    if (typeof window === 'undefined') return defaultTab;
    return resolveTabFromPath(window.location.pathname);
  });

  const getTargetUrl = useCallback(
    (tab: TTab) => {
      const canonicalPath = resolvePathForTab(tab);
      if (typeof window === 'undefined') return canonicalPath;

      const currentParams = new URLSearchParams(window.location.search);
      if (baseRoleQuery && !currentParams.has('role')) {
        currentParams.set('role', baseRoleQuery);
      }
      const queryStr = currentParams.toString();
      return queryStr ? `${canonicalPath}?${queryStr}` : canonicalPath;
    },
    [baseRoleQuery, resolvePathForTab]
  );

  const navigateTab = useCallback(
    (nextTab: TTab, replace = false) => {
      setActiveTabState(nextTab);
      if (typeof window === 'undefined') return;

      const targetUrl = getTargetUrl(nextTab);
      const title = resolveTitleForTab(nextTab);
      document.title = title;

      if (replace) {
        window.history.replaceState(null, '', targetUrl);
      } else {
        if (window.location.pathname !== resolvePathForTab(nextTab)) {
          window.history.pushState(null, '', targetUrl);
        }
      }

      // Guarantee immediate scroll to top on tab switch
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.querySelectorAll('.dashboard-content, .main-wrapper, .admin-layout, main, #root').forEach((el) => {
        el.scrollTop = 0;
      });

      onTabChange?.(nextTab);
    },
    [getTargetUrl, onTabChange, resolvePathForTab, resolveTitleForTab]
  );

  // Sync initial URL and popstate
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Scroll to top on load and tab change
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.querySelectorAll('.dashboard-content, .main-wrapper, .admin-layout, main, #root').forEach((el) => {
      el.scrollTop = 0;
    });

    // Set initial title
    document.title = resolveTitleForTab(activeTab);

    // If current path is root or non-dashboard, sync canonical URL in address bar
    const currentPath = window.location.pathname;
    if (currentPath === '/' || currentPath === '') {
      window.history.replaceState(null, '', getTargetUrl(activeTab));
    }

    const handlePopState = () => {
      const matchedTab = resolveTabFromPath(window.location.pathname);
      setActiveTabState(matchedTab);
      document.title = resolveTitleForTab(matchedTab);
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.querySelectorAll('.dashboard-content, .main-wrapper, .admin-layout, main, #root').forEach((el) => {
        el.scrollTop = 0;
      });
      onTabChange?.(matchedTab);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab, getTargetUrl, onTabChange, resolvePathForTab, resolveTabFromPath, resolveTitleForTab]);

  return {
    activeTab,
    setActiveTab: navigateTab,
    getPathForTab: resolvePathForTab,
    getTargetUrl,
  };
}

