import {
  type EmailMetadataValue,
  type EmailTemplateType,
  NotificationCategory,
  NotificationPriority,
  ROLE_LABELS,
  type SendNotificationPayload,
  UserRole,
} from '@diagnostic/shared';

export interface RenderedEmailTemplate {
  templateType: EmailTemplateType;
  subject: string;
  text: string;
  html: string;
}

const DEFAULT_PORTAL_URL = 'https://labsetu-diagnostics.web.app';

export function escapeHtml(input: unknown): string {
  const str = String(input ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeHref(url: string | undefined, fallback = DEFAULT_PORTAL_URL): string {
  if (!url) return fallback;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // Fallback below
  }
  return fallback;
}

function formatIstTimestamp(iso?: string): string {
  const dt = iso ? new Date(iso) : new Date();
  if (Number.isNaN(dt.getTime())) {
    return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  }
  return dt.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMetaRow(label: string, value: EmailMetadataValue): string {
  if (value === undefined || value === null || value === '') return '';
  return `
    <tr>
      <td style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: #64748B; border-bottom: 1px solid #E2E8F0; width: 38%;">
        ${escapeHtml(label)}
      </td>
      <td style="padding: 8px 12px; font-size: 13px; font-weight: 600; color: #0F172A; border-bottom: 1px solid #E2E8F0;">
        ${escapeHtml(String(value))}
      </td>
    </tr>
  `;
}

function buildMetadataTable(rows: Array<[string, EmailMetadataValue]>): string {
  const rendered = rows.map(([k, v]) => formatMetaRow(k, v)).filter(Boolean).join('');
  if (!rendered) return '';
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-collapse: collapse; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden; margin: 16px 0;">
      ${rendered}
    </table>
  `;
}

function renderCtaButton(label: string, url: string, bgColor: string): string {
  const safeHref = sanitizeHref(url);
  return `
    <div style="margin: 22px 0 14px 0; text-align: center;">
      <a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer"
         style="display: inline-block; background: ${bgColor}; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 700; padding: 13px 26px; border-radius: 10px; letter-spacing: 0.01em;">
        ${escapeHtml(label)}
      </a>
    </div>
  `;
}

function wrapLabSetuEmail(opts: {
  headerBg: string;
  accentColor: string;
  eyebrow: string;
  headerTitle: string;
  headerSubtitle: string;
  badgeText?: string;
  badgeBg?: string;
  badgeColor?: string;
  bodyHtml: string;
  timestampIso?: string;
  footerNote?: string;
}): string {
  const istTime = formatIstTimestamp(opts.timestampIso);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(opts.headerTitle)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #0F172A;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F1F5F9; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 16px; overflow: hidden;">
          <tr>
            <td style="background: ${opts.headerBg}; padding: 24px 28px; color: #FFFFFF; border-bottom: 4px solid ${opts.accentColor};">
              <div style="font-size: 11px; font-weight: 800; letter-spacing: 0.09em; text-transform: uppercase; color: #99F6E4; margin-bottom: 6px;">
                ${escapeHtml(opts.eyebrow)}
              </div>
              <div style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: #FFFFFF; line-height: 1.25;">
                ${escapeHtml(opts.headerTitle)}
              </div>
              <div style="font-size: 13px; color: #E2E8F0; margin-top: 5px;">
                ${escapeHtml(opts.headerSubtitle)}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 26px 28px 22px 28px;">
              ${
                opts.badgeText
                  ? `<div style="margin-bottom: 14px;">
                      <span style="display: inline-block; padding: 5px 12px; border-radius: 999px; background: ${opts.badgeBg || '#F0FDFA'}; color: ${opts.badgeColor || '#0F766E'}; font-size: 11px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase;">
                        ${escapeHtml(opts.badgeText)}
                      </span>
                    </div>`
                  : ''
              }
              ${opts.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 16px 28px; font-size: 12px; color: #64748B; line-height: 1.55;">
              <div style="font-weight: 600; color: #475569; margin-bottom: 3px;">
                LabSetu Diagnostics Network
              </div>
              <div>${escapeHtml(opts.footerNote || 'Connected Diagnostic Sample Pickup, Cold-Chain Logistics & Reporting')}</div>
              <div style="margin-top: 4px; color: #94A3B8;">Sent ${escapeHtml(istTime)} IST</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// =========================================================================
// 1. ONE-TIME EMAIL OTP TEMPLATE
// =========================================================================
export function buildOtpEmailTemplate(params: {
  displayName: string;
  email: string;
  role: UserRole;
  otpCode: string;
  expiresMinutes?: number;
  clientType?: 'WEB' | 'MOBILE';
}): RenderedEmailTemplate {
  const roleLabel = ROLE_LABELS[params.role] || String(params.role);
  const mins = params.expiresMinutes || 10;
  const surface =
    params.role === UserRole.PHLEBOTOMIST || params.clientType === 'MOBILE'
      ? 'LabSetu Mobile App'
      : 'LabSetu Website Portal';

  const subject = `LabSetu Sign-In OTP: ${params.otpCode} (${roleLabel})`;
  const text = [
    `Hello ${params.displayName} (${roleLabel}),`,
    '',
    `Your LabSetu one-time verification code is: ${params.otpCode}`,
    `Valid for: ${mins} minutes`,
    `Sign-in surface: ${surface}`,
    '',
    'For your account security, never share this code with anyone.',
    'If you did not request this OTP, you can safely ignore this email.',
  ].join('\n');

  const bodyHtml = `
    <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #0F172A;">
      Hello <strong>${escapeHtml(params.displayName)}</strong>,
    </p>
    <p style="margin: 0 0 18px 0; font-size: 14px; line-height: 1.6; color: #475569;">
      Use the 6-digit verification code below to sign in to your <strong>${escapeHtml(roleLabel)}</strong> workspace on the <strong>${escapeHtml(surface)}</strong>.
    </p>
    <div style="background: #F0FDFA; border: 2px dashed #0D9488; border-radius: 14px; padding: 20px 16px; text-align: center; margin: 18px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #0F766E; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
        One-Time Sign-In Code
      </div>
      <div style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #062226;">
        ${escapeHtml(params.otpCode)}
      </div>
      <div style="font-size: 12px; font-weight: 600; color: #0F766E; margin-top: 10px;">
        Expires in ${mins} minutes • Single-use code
      </div>
    </div>
    ${buildMetadataTable([
      ['Registered Email', params.email],
      ['Assigned Role', roleLabel],
      ['Sign-In App', surface],
    ])}
    <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 10px; padding: 12px 14px; font-size: 12px; color: #92400E; line-height: 1.55;">
      <strong>Security Tip:</strong> Do not share this code with anyone, including team coordinators or support staff. If you did not request a sign-in code, ignore this email.
    </div>
  `;

  return {
    templateType: 'OTP_LOGIN',
    subject,
    text,
    html: wrapLabSetuEmail({
      headerBg: '#062226',
      accentColor: '#0D9488',
      eyebrow: 'Account Verification',
      headerTitle: 'LabSetu Sign-In Verification Code',
      headerSubtitle: 'Secure passwordless access for your verified account',
      badgeText: `OTP Verification • ${roleLabel}`,
      badgeBg: '#CCFBF1',
      badgeColor: '#0F766E',
      bodyHtml,
      footerNote: 'Automated one-time login verification from LabSetu Diagnostics.',
    }),
  };
}

// =========================================================================
// 2. PASSWORD RESET LINK TEMPLATE
// =========================================================================
export function buildPasswordResetEmailTemplate(params: {
  displayName: string;
  email: string;
  role: UserRole;
  resetUrl: string;
  portalOrigin?: string;
}): RenderedEmailTemplate {
  const roleLabel = ROLE_LABELS[params.role] || String(params.role);
  const safeResetUrl = sanitizeHref(params.resetUrl);
  const isPhlebo = params.role === UserRole.PHLEBOTOMIST;

  const subject = `Reset Your LabSetu Password (${roleLabel})`;
  const text = [
    `Hello ${params.displayName},`,
    '',
    `We received a request to set or reset the password for your LabSetu ${roleLabel} account (${params.email}).`,
    '',
    'Open the secure link below to choose a new password:',
    safeResetUrl,
    '',
    isPhlebo
      ? 'After setting your new password, return to the LabSetu Mobile App to sign in.'
      : 'After setting your new password, you can sign in immediately on the LabSetu Portal.',
    '',
    'This link stays active for 60 minutes. If you did not request a password change, you can safely ignore this email — your existing password has not changed.',
  ].join('\n');

  const bodyHtml = `
    <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #0F172A;">
      Hello <strong>${escapeHtml(params.displayName)}</strong>,
    </p>
    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #475569;">
      We received a request to set or reset the password for your <strong>${escapeHtml(roleLabel)}</strong> account. Click the button below to choose a new password.
    </p>
    ${renderCtaButton('Reset Your Password →', safeResetUrl, '#2563EB')}
    ${buildMetadataTable([
      ['Account Email', params.email],
      ['Assigned Role', roleLabel],
      [
        'Sign-In Access',
        isPhlebo ? 'LabSetu Mobile App Only' : 'LabSetu Website Portal',
      ],
      ['Link Validity', '60 minutes (Single use)'],
    ])}
    <div style="background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 10px; padding: 12px 14px; margin: 14px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px;">
        Trouble with the button? Copy and open this link:
      </div>
      <div style="font-family: 'SFMono-Regular', Consolas, monospace; font-size: 11px; color: #1D4ED8; word-break: break-all; line-height: 1.5;">
        ${escapeHtml(safeResetUrl)}
      </div>
    </div>
    <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px; padding: 12px 14px; font-size: 12px; color: #1E40AF; line-height: 1.55;">
      <strong>Didn&apos;t ask for this?</strong> Simply ignore this email. Your existing password remains active and unchanged.
    </div>
  `;

  return {
    templateType: 'PASSWORD_RESET',
    subject,
    text,
    html: wrapLabSetuEmail({
      headerBg: '#0F172A',
      accentColor: '#2563EB',
      eyebrow: 'Password Recovery',
      headerTitle: 'Set or Reset Your Password',
      headerSubtitle: `Secure account recovery for ${roleLabel}`,
      badgeText: `Password Reset • ${roleLabel}`,
      badgeBg: '#DBEAFE',
      badgeColor: '#1D4ED8',
      bodyHtml,
      footerNote: 'Do not forward this reset link to anyone else.',
    }),
  };
}

// =========================================================================
// 3. SAFETY / EMERGENCY / COLD-CHAIN ALERT TEMPLATE
// =========================================================================
export function buildAlertEmailTemplate(
  payload: SendNotificationPayload,
  createdAt?: string
): RenderedEmailTemplate {
  const isCritical =
    payload.priority === NotificationPriority.CRITICAL ||
    payload.category === NotificationCategory.TEMPERATURE_ALERT;
  const meta = payload.metadata || {};
  const actionUrl = sanitizeHref(
    payload.actionUrl,
    `${DEFAULT_PORTAL_URL}/login?role=ADMIN`
  );
  const actionLabel = payload.actionLabel || 'Open Operations Desk →';

  const headerBg = isCritical ? '#7F1D1D' : '#78350F';
  const accentColor = isCritical ? '#EF4444' : '#F59E0B';
  const badgeBg = isCritical ? '#FEE2E2' : '#FEF3C7';
  const badgeColor = isCritical ? '#B91C1C' : '#B45309';

  const categoryText =
    payload.category === NotificationCategory.TEMPERATURE_ALERT
      ? 'COLD-CHAIN TEMPERATURE ALERT'
      : isCritical
      ? 'CRITICAL PRIORITY ALERT'
      : 'HIGH PRIORITY ALERT';

  const subject = `[LabSetu ALERT] ${payload.title}`;
  const text = [
    `${categoryText}`,
    payload.title,
    '',
    payload.message,
    payload.orderId ? `Booking / Order ID: ${payload.orderId}` : '',
    meta.temperatureCelsius !== undefined
      ? `Recorded Temperature: ${meta.temperatureCelsius}°C (Safe range: 2°C – 8°C)`
      : '',
    meta.phleboName ? `Field Courier: ${meta.phleboName}` : '',
    `Open portal: ${actionUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  const bodyHtml = `
    <div style="background: ${badgeBg}; border-left: 4px solid ${accentColor}; border-radius: 10px; padding: 14px 16px; margin-bottom: 16px;">
      <div style="font-size: 12px; font-weight: 800; color: ${badgeColor}; text-transform: uppercase; letter-spacing: 0.05em;">
        ${escapeHtml(categoryText)}
      </div>
      <h2 style="margin: 6px 0 6px 0; font-size: 18px; font-weight: 800; color: #0F172A;">
        ${escapeHtml(payload.title)}
      </h2>
      <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #1E293B;">
        ${escapeHtml(payload.message)}
      </p>
    </div>
    ${buildMetadataTable([
      ['Booking / Reference', payload.orderId || meta.orderNumber],
      [
        'Recorded Temperature',
        meta.temperatureCelsius !== undefined ? `${meta.temperatureCelsius}°C (Safe: 2°C – 8°C)` : undefined,
      ],
      ['Origin Lab', meta.smallLabName],
      ['Reference Lab', meta.targetLabName],
      ['Courier / Operator', meta.phleboName || meta.operatorName],
      ['Priority', payload.priority || NotificationPriority.HIGH],
    ])}
    <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px 14px; font-size: 13px; color: #334155; line-height: 1.55;">
      <strong>Recommended Next Step:</strong> Review specimen custody logs immediately, contact the assigned field phlebotomist, and dispatch replacement insulated gel packs or backup courier if needed.
    </div>
    ${renderCtaButton(actionLabel, actionUrl, isCritical ? '#DC2626' : '#D97706')}
  `;

  return {
    templateType: 'EMERGENCY_ALERT',
    subject,
    text,
    html: wrapLabSetuEmail({
      headerBg,
      accentColor,
      eyebrow: 'Immediate Attention Needed',
      headerTitle: payload.title,
      headerSubtitle: 'LabSetu Live Cold-Chain & Safety Monitoring',
      badgeText: `${categoryText} • ${payload.priority || NotificationPriority.HIGH}`,
      badgeBg,
      badgeColor,
      bodyHtml,
      timestampIso: createdAt,
      footerNote: 'Automated urgent safety dispatch from LabSetu Operations Monitoring.',
    }),
  };
}

// =========================================================================
// 4. DIAGNOSTIC PDF REPORT READY TEMPLATE
// =========================================================================
export function buildPdfReportEmailTemplate(
  payload: SendNotificationPayload,
  createdAt?: string
): RenderedEmailTemplate {
  const meta = payload.metadata || {};
  const reportUrl = sanitizeHref(
    payload.actionUrl || (typeof meta.downloadUrl === 'string' ? meta.downloadUrl : undefined),
    `${DEFAULT_PORTAL_URL}/login?role=SMALL_LAB`
  );
  const reportId = meta.reportId || payload.orderId || 'Verified Report';
  const orderNumber = meta.orderNumber || payload.orderId;
  const fileName = meta.fileName || 'Diagnostic-Report.pdf';

  const subject = `[LabSetu Report PDF] ${payload.title}`;
  const text = [
    'Verified Diagnostic Report Available',
    payload.title,
    '',
    payload.message,
    `Report ID: ${reportId}`,
    orderNumber ? `Booking ID: ${orderNumber}` : '',
    meta.patientName ? `Patient: ${meta.patientName}` : '',
    meta.testsSummary ? `Test Panels: ${meta.testsSummary}` : '',
    meta.targetLabName ? `Reference Hub: ${meta.targetLabName}` : '',
    meta.pathologistName ? `Verified By: ${meta.pathologistName}` : '',
    `Document: ${fileName}`,
    '',
    `Download Verified Report: ${reportUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  const bodyHtml = `
    <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #0F172A;">
      A pathologist-verified diagnostic report is now ready for review and download.
    </p>
    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #475569;">
      ${escapeHtml(payload.message)}
    </p>
    <div style="background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 12px; padding: 14px 16px; margin-bottom: 14px;">
      <div style="font-size: 11px; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: 0.05em;">
        Verified Report File
      </div>
      <div style="font-size: 15px; font-weight: 700; color: #064E3B; margin-top: 4px; word-break: break-word;">
        ${escapeHtml(String(fileName))}
      </div>
    </div>
    ${buildMetadataTable([
      ['Report ID', reportId],
      ['Booking / Order ID', orderNumber],
      ['Patient Name / Code', meta.patientName],
      ['Diagnostic Panels', meta.testsSummary],
      ['Collection Center', meta.smallLabName],
      ['Reference Testing Lab', meta.targetLabName],
      ['Signed-Off Pathologist', meta.pathologistName],
      ['Turnaround Time', meta.turnaroundMinutes],
    ])}
    ${renderCtaButton(
      payload.actionLabel || 'Download Verified Report PDF →',
      reportUrl,
      '#059669'
    )}
    <div style="font-size: 12px; color: #64748B; text-align: center;">
      This report is also archived under the <strong>Diagnostic Reports</strong> tab in your LabSetu portal.
    </div>
  `;

  return {
    templateType: 'PDF_REPORT',
    subject,
    text,
    html: wrapLabSetuEmail({
      headerBg: '#064E3B',
      accentColor: '#10B981',
      eyebrow: 'Verified Report Published',
      headerTitle: payload.title,
      headerSubtitle: 'Quality-checked digital report ready for download',
      badgeText: `Verified Report • ${String(reportId)}`,
      badgeBg: '#D1FAE5',
      badgeColor: '#065F46',
      bodyHtml,
      timestampIso: createdAt,
      footerNote: 'Digital diagnostic report notification from LabSetu Network.',
    }),
  };
}

// =========================================================================
// 5. PAYMENT CONFIRMATION & PARTNER PAYOUT RECEIPT TEMPLATE
// =========================================================================
export function buildPaymentReceiptEmailTemplate(
  payload: SendNotificationPayload,
  createdAt?: string
): RenderedEmailTemplate {
  const isPayout = payload.category === NotificationCategory.PAYOUT_SETTLED;
  const meta = payload.metadata || {};
  const amountText =
    meta.amountInr !== undefined && meta.amountInr !== ''
      ? `₹${Number(meta.amountInr).toLocaleString('en-IN')}`
      : undefined;
  const actionUrl = sanitizeHref(
    payload.actionUrl,
    `${DEFAULT_PORTAL_URL}/login?role=${
      payload.recipientRole && payload.recipientRole !== 'ALL' ? payload.recipientRole : 'ADMIN'
    }`
  );

  const subject = `[LabSetu ${isPayout ? 'Payout' : 'Receipt'}] ${payload.title}`;
  const text = [
    isPayout ? 'Partner Payout Settlement Receipt' : 'Online Payment Receipt',
    payload.title,
    amountText ? `Amount: ${amountText}` : '',
    payload.message,
    payload.orderId ? `Booking ID: ${payload.orderId}` : '',
    meta.referenceId ? `Reference / Payment ID: ${meta.referenceId}` : '',
    meta.paymentMethod ? `Method: ${meta.paymentMethod}` : '',
    meta.destinationSummary ? `Account: ${meta.destinationSummary}` : '',
    `View Billing Ledger: ${actionUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  const bodyHtml = `
    <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6; color: #334155;">
      ${escapeHtml(payload.message)}
    </p>
    ${
      amountText
        ? `<div style="background: ${isPayout ? '#F0FDFA' : '#EFF6FF'}; border: 1px solid ${isPayout ? '#99F6E4' : '#BFDBFE'}; border-radius: 12px; padding: 18px; text-align: center; margin: 14px 0;">
            <div style="font-size: 11px; font-weight: 800; color: ${isPayout ? '#0F766E' : '#1D4ED8'}; text-transform: uppercase; letter-spacing: 0.06em;">
              ${isPayout ? 'Disbursed Payout Amount' : 'Verified Payment Amount'}
            </div>
            <div style="font-size: 30px; font-weight: 800; color: #0F172A; margin-top: 4px;">
              ${escapeHtml(amountText)}
            </div>
          </div>`
        : ''
    }
    ${buildMetadataTable([
      ['Booking / Invoice ID', payload.orderId || meta.orderNumber],
      ['Transaction / UTR Ref', meta.referenceId],
      ['Payment Mode', meta.paymentMethod],
      ['Collection Center', meta.smallLabName],
      ['Reference Lab / Payee', meta.targetLabName || meta.recipientName],
      ['Destination Account', meta.destinationSummary],
      ['Settlement Status', isPayout ? 'PROCESSED' : 'PAID & VERIFIED'],
    ])}
    ${renderCtaButton(
      payload.actionLabel || 'View Billing & Payouts →',
      actionUrl,
      isPayout ? '#0D9488' : '#0284C7'
    )}
  `;

  return {
    templateType: 'PAYMENT_RECEIPT',
    subject,
    text,
    html: wrapLabSetuEmail({
      headerBg: isPayout ? '#062226' : '#0F172A',
      accentColor: isPayout ? '#0D9488' : '#0284C7',
      eyebrow: isPayout ? 'Partner Payout Settlement' : 'Payment Confirmation',
      headerTitle: payload.title,
      headerSubtitle: isPayout
        ? 'Settlement transfer confirmation & UTR summary'
        : 'Verified digital collection receipt',
      badgeText: isPayout ? 'Payout Settled' : 'Payment Verified',
      badgeBg: isPayout ? '#CCFBF1' : '#E0F2FE',
      badgeColor: isPayout ? '#0F766E' : '#0369A1',
      bodyHtml,
      timestampIso: createdAt,
      footerNote: 'Financial ledger notification from LabSetu Diagnostics.',
    }),
  };
}

// =========================================================================
// 6. ACCOUNT PROVISIONED / WELCOME EMAIL TEMPLATE
// =========================================================================
export function buildAccountWelcomeEmailTemplate(params: {
  displayName: string;
  email: string;
  role: UserRole;
  labId?: string;
  phlebotomistId?: string;
  hasPassword?: boolean;
  portalOrigin?: string;
  createdAt?: string;
}): RenderedEmailTemplate {
  const roleLabel = ROLE_LABELS[params.role] || String(params.role);
  const origin = sanitizeHref(params.portalOrigin, DEFAULT_PORTAL_URL);
  const isPhlebo = params.role === UserRole.PHLEBOTOMIST;
  const loginUrl = `${origin}/login?role=${encodeURIComponent(params.role)}`;
  const setupPasswordUrl = `${origin}/forgot-password?email=${encodeURIComponent(params.email)}&role=${encodeURIComponent(params.role)}`;

  const subject = `Welcome to LabSetu — ${roleLabel} Account Ready`;
  const text = [
    `Hello ${params.displayName},`,
    '',
    `Your LabSetu Diagnostics account has been created with the role: ${roleLabel}.`,
    `Account Email: ${params.email}`,
    params.labId ? `Facility ID: ${params.labId}` : '',
    params.phlebotomistId ? `Courier ID: ${params.phlebotomistId}` : '',
    '',
    isPhlebo
      ? 'Sign-In Instructions: Please open the LabSetu Mobile App and sign in using Email OTP or Email & Password. Website dashboard login is disabled for Field Phlebotomist accounts.'
      : `Sign in to your portal here: ${loginUrl} (using Google Sign-In, Email OTP, or Password).`,
    '',
    `Need to set or update your password? Visit: ${setupPasswordUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  const bodyHtml = `
    <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #0F172A;">
      Welcome <strong>${escapeHtml(params.displayName)}</strong>,
    </p>
    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #475569;">
      Your <strong>${escapeHtml(roleLabel)}</strong> account is now active on the LabSetu Diagnostics Network.
    </p>
    ${buildMetadataTable([
      ['Email Address', params.email],
      ['Assigned Role', roleLabel],
      ['Assigned Lab ID', params.labId],
      ['Assigned Courier ID', params.phlebotomistId],
      [
        'Allowed Sign-In Methods',
        isPhlebo
          ? params.hasPassword
            ? 'LabSetu Mobile App • Email & Password, Email OTP'
            : 'LabSetu Mobile App • Email OTP or Set Password'
          : params.hasPassword
          ? 'Google Sign-In, Email OTP, Email & Password'
          : 'Google Sign-In, Email OTP, or Set Password',
      ],
    ])}
    ${
      isPhlebo
        ? `<div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 10px; padding: 14px 16px; font-size: 13px; color: #92400E; line-height: 1.55; margin: 16px 0;">
            <strong>Mobile App Exclusive:</strong> Field Phlebotomist accounts sign in exclusively through the <strong>LabSetu Mobile App</strong>. You can use the button below to set your password anytime.
           </div>
           ${renderCtaButton('Set Your Account Password →', setupPasswordUrl, '#4F46E5')}`
        : `${renderCtaButton(`Open ${roleLabel} Sign-In →`, loginUrl, '#0D9488')}
           <div style="text-align: center; margin-top: 6px;">
             <a href="${escapeHtml(setupPasswordUrl)}" target="_blank" rel="noopener noreferrer" style="font-size: 13px; font-weight: 600; color: #2563EB; text-decoration: none;">
               Need a password? Set or reset your password →
             </a>
           </div>`
    }
  `;

  return {
    templateType: 'ACCOUNT_WELCOME',
    subject,
    text,
    html: wrapLabSetuEmail({
      headerBg: '#062226',
      accentColor: '#4F46E5',
      eyebrow: 'Workspace Access Activated',
      headerTitle: `Welcome to LabSetu Diagnostics`,
      headerSubtitle: `${roleLabel} onboarding & sign-in instructions`,
      badgeText: `Account Active • ${roleLabel}`,
      badgeBg: '#EEF2FF',
      badgeColor: '#4338CA',
      bodyHtml,
      timestampIso: params.createdAt,
      footerNote: 'Your access is role-locked and managed by your LabSetu Platform Admin.',
    }),
  };
}

// =========================================================================
// 7. OPERATIONAL NOTIFICATION TEMPLATE
// =========================================================================
export function buildNotificationEmailTemplate(
  payload: SendNotificationPayload,
  createdAt?: string
): RenderedEmailTemplate {
  const meta = payload.metadata || {};
  const categoryLabels: Partial<Record<NotificationCategory, string>> = {
    [NotificationCategory.BOOKING_CREATED]: 'New Sample Pickup Booking',
    [NotificationCategory.PICKUP_ASSIGNED]: 'Courier Pickup Assigned',
    [NotificationCategory.SAMPLE_COLLECTED]: 'Sample Collection Update',
    [NotificationCategory.LAB_VERIFICATION]: 'Lab Verification Update',
    [NotificationCategory.SYSTEM_ALERT]: 'Operations Update',
  };
  const friendlyCategory =
    (payload.category && categoryLabels[payload.category]) || 'Platform Notification';
  const targetRole =
    payload.recipientRole && payload.recipientRole !== 'ALL' ? payload.recipientRole : UserRole.ADMIN;
  const actionUrl = sanitizeHref(
    payload.actionUrl,
    `${DEFAULT_PORTAL_URL}/login?role=${encodeURIComponent(targetRole)}`
  );

  const subject = `[LabSetu] ${payload.title}`;
  const text = [
    friendlyCategory,
    payload.title,
    '',
    payload.message,
    payload.orderId ? `Booking ID: ${payload.orderId}` : '',
    meta.handoverOtp ? `Handover OTP: ${meta.handoverOtp}` : '',
    meta.smallLabName ? `Origin Lab: ${meta.smallLabName}` : '',
    meta.targetLabName ? `Reference Lab: ${meta.targetLabName}` : '',
    '',
    `View in LabSetu Portal: ${actionUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  const bodyHtml = `
    <h2 style="margin: 0 0 10px 0; font-size: 18px; font-weight: 800; color: #0F172A;">
      ${escapeHtml(payload.title)}
    </h2>
    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.65; color: #334155;">
      ${escapeHtml(payload.message)}
    </p>
    ${buildMetadataTable([
      ['Booking / Reference ID', payload.orderId || meta.orderNumber],
      ['Priority', payload.priority],
      ['Origin Lab', meta.smallLabName],
      ['Reference Lab', meta.targetLabName],
      ['Assigned Courier', meta.phleboName],
      ['Handover Code', meta.handoverOtp],
    ])}
    ${renderCtaButton(payload.actionLabel || 'Open LabSetu Dashboard →', actionUrl, '#0D9488')}
  `;

  return {
    templateType: 'OPERATIONAL_NOTIFICATION',
    subject,
    text,
    html: wrapLabSetuEmail({
      headerBg: '#062226',
      accentColor: '#0D9488',
      eyebrow: friendlyCategory,
      headerTitle: 'LabSetu Operations Notification',
      headerSubtitle: 'Real-time sample dispatch and workflow update',
      badgeText: friendlyCategory,
      badgeBg: '#F0FDFA',
      badgeColor: '#0F766E',
      bodyHtml,
      timestampIso: createdAt,
      footerNote: 'Automated workflow notification from LabSetu Diagnostics Network.',
    }),
  };
}

// =========================================================================
// UNIFIED RESOLVER & QUEUED MAIL INFERENCE
// =========================================================================
export function resolveNotificationEmailTemplate(
  payload: SendNotificationPayload,
  createdAt?: string
): RenderedEmailTemplate {
  const chosenType: EmailTemplateType =
    payload.templateType || inferTemplateType(payload.category, payload.priority, payload.title);

  switch (chosenType) {
    case 'PDF_REPORT':
      return buildPdfReportEmailTemplate(payload, createdAt);
    case 'EMERGENCY_ALERT':
      return buildAlertEmailTemplate(payload, createdAt);
    case 'PAYMENT_RECEIPT':
      return buildPaymentReceiptEmailTemplate(payload, createdAt);
    case 'ACCOUNT_WELCOME': {
      const meta = payload.metadata || {};
      const role =
        payload.recipientRole && payload.recipientRole !== 'ALL'
          ? payload.recipientRole
          : UserRole.SMALL_LAB;
      return buildAccountWelcomeEmailTemplate({
        displayName: String(meta.displayName || 'LabSetu Partner'),
        email: payload.recipientEmail || '',
        role,
        labId: meta.labId ? String(meta.labId) : payload.labId,
        phlebotomistId: meta.phlebotomistId ? String(meta.phlebotomistId) : undefined,
        hasPassword: Boolean(meta.hasPassword),
        portalOrigin: meta.portalOrigin ? String(meta.portalOrigin) : undefined,
        createdAt,
      });
    }
    case 'OPERATIONAL_NOTIFICATION':
    default:
      return buildNotificationEmailTemplate(payload, createdAt);
  }
}

function inferTemplateType(
  category?: NotificationCategory,
  priority?: NotificationPriority,
  title = ''
): EmailTemplateType {
  if (category === NotificationCategory.REPORT_UPLOADED || /report ready|pdf report/i.test(title)) {
    return 'PDF_REPORT';
  }
  if (
    category === NotificationCategory.TEMPERATURE_ALERT ||
    priority === NotificationPriority.CRITICAL ||
    /sos|excursion|emergency/i.test(title)
  ) {
    return 'EMERGENCY_ALERT';
  }
  if (
    category === NotificationCategory.PAYMENT_RECEIVED ||
    category === NotificationCategory.PAYOUT_SETTLED
  ) {
    return 'PAYMENT_RECEIPT';
  }
  if (/welcome to labsetu/i.test(title)) {
    return 'ACCOUNT_WELCOME';
  }
  return 'OPERATIONAL_NOTIFICATION';
}

