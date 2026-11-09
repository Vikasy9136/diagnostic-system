/**
 * LabSetu Healthcare Design System Tokens
 * Canonical UI/UX specifications for web portals and mobile app
 */

export const LABSETU_THEME = {
  brand: {
    name: 'LabSetu',
    tagline: 'Healthcare Diagnostic Logistics & Sample Management Platform',
  },
  colors: {
    primaryTeal: '#0D9488',
    primaryDark: '#0F766E',
    accentBlue: '#2563EB',
    successGreen: '#16A34A',
    warningAmber: '#F59E0B',
    errorRed: '#DC2626',
    background: '#F8FAFC',
    surfaceCard: '#FFFFFF',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    borderLight: '#E2E8F0',
    borderHover: '#CBD5E1',
    sidebarBg: '#FFFFFF',
    headerBg: '#FFFFFF',
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    sizes: {
      h1: '32px',
      h2: '24px',
      h3: '20px',
      body: '16px',
      small: '14px',
      caption: '12px',
    },
    weights: {
      regular: 400,
      medium: 500,
      semiBold: 600,
      bold: 700,
    },
  },
  borderRadius: {
    sm: '6px',
    md: '10px',
    lg: '16px',
    full: '9999px',
  },
  shadows: {
    card: '0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)',
    elevated: '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -2px rgba(15, 23, 42, 0.04)',
  },
} as const;

export type LabSetuTheme = typeof LABSETU_THEME;

