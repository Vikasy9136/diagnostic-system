import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { LABSETU_THEME, ROLE_LABELS, UserRole } from '@diagnostic/shared';
import { LabSetuLogo } from '@diagnostic/shared/web/LabSetuLogo';
import {
  confirmPasswordReset,
  signOut,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { API_BASE_URL, auth } from '../firebase';
import { type DynamicAlertVariant } from './DynamicAlertModal';

interface ResetPasswordPageProps {
  onGoToLogin: (role?: UserRole) => void;
  onGoToForgotPassword: (email?: string) => void;
  onBackToLanding: () => void;
  onShowAlert: (opts: {
    variant: DynamicAlertVariant;
    title: string;
    message: string;
    detail?: string;
    confirmLabel?: string;
  }) => void;
}

type ResetStage = 'verifying' | 'ready' | 'submitting' | 'success' | 'invalid';

function isKnownRole(val: string | null | undefined): val is UserRole {
  return (
    val === UserRole.ADMIN ||
    val === UserRole.SMALL_LAB ||
    val === UserRole.LARGE_LAB ||
    val === UserRole.PHLEBOTOMIST
  );
}

export function ResetPasswordPage({
  onGoToLogin,
  onGoToForgotPassword,
  onBackToLanding,
  onShowAlert,
}: ResetPasswordPageProps) {
  const initialParams = useMemo(() => {
    const sp = new URLSearchParams(window.location.search);
    return {
      oobCode: sp.get('oobCode')?.trim() || '',
      emailHint: sp.get('email')?.trim().toLowerCase() || '',
      roleHint: sp.get('role'),
    };
  }, []);

  const [stage, setStage] = useState<ResetStage>('verifying');
  const [verifiedEmail, setVerifiedEmail] = useState(initialParams.emailHint);
  const [resolvedRole, setResolvedRole] = useState<UserRole>(
    isKnownRole(initialParams.roleHint) ? initialParams.roleHint : UserRole.SMALL_LAB
  );
  const [errorReason, setErrorReason] = useState<string>('');
  const [inlineError, setInlineError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function validateCode() {
      if (!initialParams.oobCode) {
        if (!cancelled) {
          setErrorReason(
            'This password reset link is missing a valid security code. Please request a new reset link.'
          );
          setStage('invalid');
        }
        return;
      }

      try {
        const accountEmail = await verifyPasswordResetCode(auth, initialParams.oobCode);
        const normalized = accountEmail.trim().toLowerCase();
        if (cancelled) return;
        setVerifiedEmail(normalized);

        if (!isKnownRole(initialParams.roleHint)) {
          try {
            const roleRes = await fetch(
              `${API_BASE_URL}/auth/role-check?email=${encodeURIComponent(normalized)}`
            );
            const roleJson = await roleRes.json().catch(() => null);
            if (!cancelled && isKnownRole(roleJson?.data?.role)) {
              setResolvedRole(roleJson.data.role);
            }
          } catch {
            // Optional hint lookup; keep fallback role
          }
        }

        if (!cancelled) {
          setStage('ready');
        }
      } catch (err: unknown) {
        const fbErr = err as { code?: string };
        let friendly =
          'This password reset link is invalid or has already been used. Please request a new link.';
        if (fbErr.code === 'auth/expired-action-code') {
          friendly =
            'This password reset link has expired (links stay valid for 60 minutes). Please request a new reset email.';
        } else if (fbErr.code === 'auth/user-disabled') {
          friendly =
            'This account is currently paused. Please contact your LabSetu Platform Admin before resetting your password.';
        }
        if (!cancelled) {
          setErrorReason(friendly);
          setStage('invalid');
        }
      }
    }

    void validateCode();
    return () => {
      cancelled = true;
    };
  }, [initialParams]);

  const rules = useMemo(() => {
    const hasLength = newPassword.length >= 8;
    const hasUpper = /[A-Z]/.test(newPassword);
    const hasLower = /[a-z]/.test(newPassword);
    const hasNumber = /\d/.test(newPassword);
    const matches = newPassword.length > 0 && newPassword === confirmPassword;
    const score = [hasLength, hasUpper && hasLower, hasNumber, newPassword.length >= 12].filter(
      Boolean
    ).length;

    let label = 'Too Short';
    let level: 'weak' | 'fair' | 'good' | 'strong' = 'weak';
    if (score >= 4) {
      label = 'Strong';
      level = 'strong';
    } else if (score === 3) {
      label = 'Good';
      level = 'good';
    } else if (score === 2) {
      label = 'Fair';
      level = 'fair';
    } else if (newPassword.length > 0) {
      label = 'Weak';
      level = 'weak';
    }

    return {
      hasLength,
      hasUpper,
      hasLower,
      hasNumber,
      matches,
      score: newPassword.length === 0 ? 0 : Math.max(1, score),
      label,
      level,
    };
  }, [newPassword, confirmPassword]);

  async function handleSubmitNewPassword(e: FormEvent) {
    e.preventDefault();
    setInlineError(null);

    if (!rules.hasLength) {
      setInlineError('Your new password must be at least 8 characters long.');
      return;
    }
    if (!rules.hasUpper || !rules.hasLower || !rules.hasNumber) {
      setInlineError(
        'Include at least one uppercase letter, one lowercase letter, and one number for account security.'
      );
      return;
    }
    if (!rules.matches) {
      setInlineError('New Password and Confirm Password do not match.');
      return;
    }

    setStage('submitting');
    try {
      await confirmPasswordReset(auth, initialParams.oobCode, newPassword);
      if (auth.currentUser) {
        await signOut(auth).catch(() => {});
      }
      window.history.replaceState(
        {},
        '',
        `/reset-password?role=${encodeURIComponent(resolvedRole)}&status=done`
      );
      setStage('success');
      onShowAlert({
        variant: 'success',
        title: 'Password Updated',
        message:
          resolvedRole === UserRole.PHLEBOTOMIST
            ? `Password saved for ${verifiedEmail}. Open the LabSetu Mobile App to sign in.`
            : `Your password for ${verifiedEmail} has been updated. You can now sign in.`,
      });
    } catch (err: unknown) {
      const fbErr = err as { code?: string };
      if (
        fbErr.code === 'auth/expired-action-code' ||
        fbErr.code === 'auth/invalid-action-code'
      ) {
        setErrorReason(
          'This reset link has expired or was already used. Please request a fresh reset link.'
        );
        setStage('invalid');
        return;
      }
      const msg =
        fbErr.code === 'auth/weak-password'
          ? 'Please choose a stronger password with at least 8 characters.'
          : 'Could not save your new password right now. Please try again.';
      setInlineError(msg);
      setStage('ready');
      onShowAlert({ variant: 'error', title: 'Update Failed', message: msg });
    }
  }

  const isPhlebo = resolvedRole === UserRole.PHLEBOTOMIST;
  const roleLabel = ROLE_LABELS[resolvedRole] || 'Partner Account';

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

        {!isPhlebo && (
          <button
            type="button"
            className="btn-hero-secondary"
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            onClick={() => onGoToLogin(resolvedRole)}
          >
            Go to Sign In
          </button>
        )}
      </div>

      <div className="auth-flow-center">
        <div className="admin-login-card">
          <div className="admin-login-banner">
            <LabSetuLogo variant="dark" width={38} height={38} alt="LabSetu" />
            <div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                {LABSETU_THEME.brand.name} • Create New Password
              </div>
              <div style={{ fontSize: '0.75rem', color: '#7DD3FC' }}>
                Complete your password setup securely
              </div>
            </div>
          </div>

          <div className="admin-login-body">
            {stage === 'verifying' && (
              <div className="reset-status-card">
                <div className="reset-status-icon loading">⏳</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>
                  Checking Your Security Link...
                </div>
                <p style={{ fontSize: '0.83rem', color: '#64748B', marginTop: '6px' }}>
                  Please wait a moment while we verify your reset link.
                </p>
              </div>
            )}

            {stage === 'invalid' && (
              <div>
                <div className="reset-status-card error">
                  <div className="reset-status-icon error">⚠️</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#B91C1C' }}>
                    Reset Link Expired or Invalid
                  </div>
                  <p
                    style={{
                      fontSize: '0.84rem',
                      color: '#334155',
                      marginTop: '8px',
                      lineHeight: 1.55,
                    }}
                  >
                    {errorReason}
                  </p>
                </div>

                <button
                  type="button"
                  className="btn-primary btn-full"
                  style={{ justifyContent: 'center' }}
                  onClick={() => onGoToForgotPassword(verifiedEmail)}
                >
                  Request a New Reset Link →
                </button>

                {!isPhlebo && (
                  <div style={{ textAlign: 'center', marginTop: '14px' }}>
                    <button
                      type="button"
                      className="btn-link-muted"
                      onClick={() => onGoToLogin(resolvedRole)}
                    >
                      ← Return to Sign In
                    </button>
                  </div>
                )}
              </div>
            )}

            {stage === 'success' && (
              <div>
                <div className="reset-status-card sent">
                  <div className="reset-status-icon success">✓</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#065F46' }}>
                    Password Updated Successfully
                  </div>
                  <p
                    style={{
                      fontSize: '0.84rem',
                      color: '#334155',
                      marginTop: '6px',
                      lineHeight: 1.55,
                    }}
                  >
                    Your new password for <strong>{verifiedEmail}</strong> is active right away.
                  </p>
                  <div style={{ marginTop: '10px' }}>
                    <span className="role-assigned-pill">{roleLabel}</span>
                  </div>
                </div>

                {isPhlebo ? (
                  <div className="phlebo-mobile-notice light" style={{ marginBottom: '0' }}>
                    <strong>📱 Open LabSetu Mobile App:</strong> Field Phlebotomist dashboards are
                    only accessible on the mobile app. Open the LabSetu Mobile App on your phone and
                    sign in using <strong>{verifiedEmail}</strong> and your new password.
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-primary btn-full"
                    style={{ justifyContent: 'center' }}
                    onClick={() => onGoToLogin(resolvedRole)}
                  >
                    Sign In to {roleLabel} →
                  </button>
                )}
              </div>
            )}

            {(stage === 'ready' || stage === 'submitting') && (
              <form onSubmit={(e) => void handleSubmitNewPassword(e)}>
                <div className="step-indicator-pill">
                  <span>🔐 Step 2 of 2</span>
                  <span>•</span>
                  <span>Choose New Password</span>
                </div>

                <div className="role-requirement-banner" style={{ width: '100%', justifyContent: 'space-between' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Account: <strong>{verifiedEmail}</strong>
                  </span>
                  <span className="role-assigned-pill">{roleLabel}</span>
                </div>

                {inlineError && <div className="admin-auth-alert error">{inlineError}</div>}

                <div className="form-group">
                  <label className="form-label" htmlFor="reset-new-password">
                    New Password
                  </label>
                  <div className="admin-password-wrap">
                    <input
                      id="reset-new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      className="form-input"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Create a strong password"
                      style={{ paddingRight: '58px' }}
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      className="admin-password-toggle"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  <div className="password-strength-meter">
                    <div className="password-strength-header">
                      <span>Password Strength</span>
                      <span>{rules.label}</span>
                    </div>
                    <div className="password-strength-bars">
                      {[1, 2, 3, 4].map((slot) => (
                        <div
                          key={slot}
                          className={`password-strength-bar ${
                            rules.score >= slot ? `active ${rules.level}` : ''
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="reset-confirm-password">
                    Confirm New Password
                  </label>
                  <div className="admin-password-wrap">
                    <input
                      id="reset-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="form-input"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your new password"
                      style={{ paddingRight: '58px' }}
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      className="admin-password-toggle"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <ul className="password-requirements-list">
                  <li className={`password-req-item ${rules.hasLength ? 'met' : ''}`}>
                    <span className="req-dot">{rules.hasLength ? '✓' : '•'}</span>
                    <span>At least 8 characters</span>
                  </li>
                  <li className={`password-req-item ${rules.hasUpper ? 'met' : ''}`}>
                    <span className="req-dot">{rules.hasUpper ? '✓' : '•'}</span>
                    <span>One uppercase letter (A-Z)</span>
                  </li>
                  <li className={`password-req-item ${rules.hasLower ? 'met' : ''}`}>
                    <span className="req-dot">{rules.hasLower ? '✓' : '•'}</span>
                    <span>One lowercase letter (a-z)</span>
                  </li>
                  <li className={`password-req-item ${rules.hasNumber ? 'met' : ''}`}>
                    <span className="req-dot">{rules.hasNumber ? '✓' : '•'}</span>
                    <span>One number (0-9)</span>
                  </li>
                  <li className={`password-req-item ${rules.matches ? 'met' : ''}`}>
                    <span className="req-dot">{rules.matches ? '✓' : '•'}</span>
                    <span>Passwords match</span>
                  </li>
                </ul>

                <button
                  type="submit"
                  className="btn-primary btn-full"
                  style={{ justifyContent: 'center' }}
                  disabled={stage === 'submitting'}
                >
                  {stage === 'submitting' ? 'Saving Password...' : 'Save New Password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

