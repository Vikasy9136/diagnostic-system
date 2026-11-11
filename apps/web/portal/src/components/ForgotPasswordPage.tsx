import { useEffect, useState, type FormEvent } from 'react';
import { LABSETU_THEME, ROLE_LABELS, type UserRole } from '@diagnostic/shared';
import { API_BASE_URL } from '../firebase';
import { type DynamicAlertVariant } from './DynamicAlertModal';

interface ForgotPasswordPageProps {
  initialEmail?: string;
  selectedRole?: UserRole;
  onBackToLogin: () => void;
  onBackToLanding: () => void;
  onShowAlert: (opts: {
    variant: DynamicAlertVariant;
    title: string;
    message: string;
    detail?: string;
    confirmLabel?: string;
  }) => void;
}

interface SentResetSummary {
  email: string;
  role: UserRole;
  roleLabel: string;
}

export function ForgotPasswordPage({
  initialEmail = '',
  selectedRole,
  onBackToLogin,
  onBackToLanding,
  onShowAlert,
}: ForgotPasswordPageProps) {
  const [email, setEmail] = useState(initialEmail);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [sentSummary, setSentSummary] = useState<SentResetSummary | null>(null);

  useEffect(() => {
    if (initialEmail && !email) {
      setEmail(initialEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEmail]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function submitResetRequest(targetEmail: string) {
    const normalized = targetEmail.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      const msg = 'Please enter your registered email address.';
      setInlineError(msg);
      onShowAlert({ variant: 'warning', title: 'Email Required', message: msg });
      return;
    }

    setInlineError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'web',
        },
        body: JSON.stringify({
          email: normalized,
          origin: window.location.origin,
          portalRole: selectedRole,
          clientType: 'WEB',
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const errCode = json?.error?.code;
        const errMsg =
          json?.error?.message ||
          'We could not send a password reset link right now. Please check your email and try again.';
        setInlineError(errMsg);
        onShowAlert({
          variant: 'error',
          title:
            errCode === 'USER_NOT_PROVISIONED'
              ? 'Email Not Added Yet'
              : errCode === 'ACCOUNT_SUSPENDED'
              ? 'Account Paused'
              : 'Unable to Send Reset Link',
          message: errMsg,
        });
        return;
      }

      const assignedRole = (json?.data?.role as UserRole) || selectedRole || ('SMALL_LAB' as UserRole);
      const roleLabel =
        (json?.data?.roleLabel as string) || ROLE_LABELS[assignedRole] || 'Partner Account';

      setSentSummary({ email: normalized, role: assignedRole, roleLabel });
      setCooldown(60);
      onShowAlert({
        variant: 'success',
        title: 'Password Reset Email Sent',
        message: `We emailed a secure reset link to ${normalized}. Open the link in your inbox to choose a new password.`,
      });
    } catch {
      const msg =
        'Unable to reach the password recovery service right now. Please check your internet connection and try again.';
      setInlineError(msg);
      onShowAlert({
        variant: 'warning',
        title: 'Service Temporarily Unavailable',
        message: msg,
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    void submitResetRequest(email);
  }

  return (
    <div className="auth-flow-shell">
      <div className="portal-login-topbar">
        <button
          type="button"
          className="btn-hero-secondary"
          style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          onClick={onBackToLanding}
        >
          ← Back to LabSetu Home
        </button>

        <button
          type="button"
          className="btn-hero-secondary"
          style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          onClick={onBackToLogin}
        >
          ← Back to Sign In
        </button>
      </div>

      <div className="auth-flow-center">
        <div className="admin-login-card">
          <div className="admin-login-banner">
            <div className="brand-logo-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                {LABSETU_THEME.brand.name} • Password Recovery
              </div>
              <div style={{ fontSize: '0.75rem', color: '#7DD3FC' }}>
                Set or reset the password for your registered account
              </div>
            </div>
          </div>

          <div className="admin-login-body">
            {sentSummary ? (
              <div>
                <div className="reset-status-card sent">
                  <div className="reset-status-icon sent">✉️</div>
                  <div style={{ fontSize: '1.08rem', fontWeight: 800, color: '#065F46' }}>
                    Reset Link Delivered
                  </div>
                  <p
                    style={{
                      fontSize: '0.84rem',
                      color: '#334155',
                      marginTop: '6px',
                      lineHeight: 1.55,
                    }}
                  >
                    A secure password setup / reset email has been sent to{' '}
                    <strong>{sentSummary.email}</strong>.
                  </p>
                  <div style={{ marginTop: '12px' }}>
                    <span className="role-assigned-pill">
                      Registered Role: {sentSummary.roleLabel}
                    </span>
                  </div>
                </div>

                {sentSummary.role === 'PHLEBOTOMIST' && (
                  <div className="phlebo-mobile-notice light">
                    <strong>📱 Field Phlebotomist Note:</strong> Open the reset link from your
                    email to set your new password, then sign in inside the{' '}
                    <strong>LabSetu Mobile App</strong>.
                  </div>
                )}

                <div className="auth-tip-box">
                  <strong>Didn&apos;t see it yet?</strong> Check your Spam, Promotions, or Updates
                  folder for an email titled <em>&ldquo;Reset Your LabSetu Password&rdquo;</em>. Links
                  stay active for 60 minutes.
                </div>

                <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                  <button
                    type="button"
                    className="btn-primary btn-full"
                    disabled={cooldown > 0 || submitting}
                    onClick={() => void submitResetRequest(sentSummary.email)}
                  >
                    {submitting
                      ? 'Sending Again...'
                      : cooldown > 0
                      ? `Resend Reset Link in ${cooldown}s`
                      : 'Resend Reset Link'}
                  </button>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <button
                      type="button"
                      className="btn-link-muted"
                      onClick={() => {
                        setSentSummary(null);
                        setInlineError(null);
                      }}
                    >
                      Try Different Email
                    </button>
                    <button
                      type="button"
                      className="btn-link-muted"
                      onClick={onBackToLogin}
                    >
                      Back to Sign In →
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit}>
                <div className="step-indicator-pill">
                  <span>🔑 Step 1 of 2</span>
                  <span>•</span>
                  <span>Request Reset Email</span>
                </div>

                <p className="admin-login-subtitle" style={{ marginBottom: '16px' }}>
                  Enter the email address added by your LabSetu Admin. We will send you a secure,
                  single-use link to set a new password.
                </p>

                {inlineError && <div className="admin-auth-alert error">{inlineError}</div>}

                <div className="form-group">
                  <label className="form-label" htmlFor="forgot-email">
                    Registered Email Address
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    className="form-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary btn-full"
                  style={{ justifyContent: 'center' }}
                  disabled={submitting}
                >
                  {submitting ? 'Sending Secure Link...' : 'Send Password Reset Link →'}
                </button>

                <div
                  style={{
                    marginTop: '16px',
                    paddingTop: '14px',
                    borderTop: '1px solid #E2E8F0',
                    textAlign: 'center',
                  }}
                >
                  <button
                    type="button"
                    className="btn-link-muted"
                    onClick={onBackToLogin}
                  >
                    Remembered your password? Back to Sign In
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

