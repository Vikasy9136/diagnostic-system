import {
  ADMIN_SUB_ROLE_LABELS,
  ROLE_LABELS,
  type UserProfile,
  UserRole,
} from '@diagnostic/shared';
import { type AlertTriggerFn } from '../types';
import { type AdminPasswordTarget } from './adminTypes';

export interface AdminUsersTabProps {
  managedUsers: UserProfile[];
  filteredUsers: UserProfile[];
  roleFilter: 'ALL' | UserRole;
  onRoleFilterChange: (role: 'ALL' | UserRole) => void;
  rootAdminEmail: string;
  onOpenAddUserModal: (role: UserRole) => void;
  onOpenSetPasswordDialog: (target: AdminPasswordTarget) => void;
  onEditUser: (user: UserProfile) => void;
  onToggleUserStatus: (user: UserProfile, nextActive: boolean) => void;
  onShowAlert: AlertTriggerFn;
}

export function AdminUsersTab({
  managedUsers,
  filteredUsers,
  roleFilter,
  onRoleFilterChange,
  rootAdminEmail,
  onOpenAddUserModal,
  onOpenSetPasswordDialog,
  onEditUser,
  onToggleUserStatus,
  onShowAlert,
}: AdminUsersTabProps) {
  return (
    <div className="chart-card-modern">
      <div className="card-top-header">
        <div>
          <h2 className="card-top-title">Role-Based User Directory</h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
            Only emails added here by Platform Admin can sign in—strictly locked to their assigned role.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => onOpenAddUserModal(UserRole.SMALL_LAB)}>
          + Add Role User
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {(['ALL', UserRole.ADMIN, UserRole.SMALL_LAB, UserRole.LARGE_LAB, UserRole.PHLEBOTOMIST] as const).map((r) => (
          <button
            key={r}
            type="button"
            className={roleFilter === r ? 'btn-primary' : 'btn-secondary'}
            onClick={() => onRoleFilterChange(r)}
          >
            {r === 'ALL' ? `All (${managedUsers.length})` : ROLE_LABELS[r]}
          </button>
        ))}
      </div>

      <div className="data-table-container">
        <table className="modern-data-table">
          <thead>
            <tr>
              <th>Name / Facility</th>
              <th>Email</th>
              <th>Assigned Role</th>
              <th>Lab / Courier ID</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.email}>
                <td><strong>{u.displayName}</strong></td>
                <td>{u.email}</td>
                <td>
                  <span className="status-pill-blue">{ROLE_LABELS[u.role]}</span>
                  {u.role === UserRole.ADMIN && (
                    <div style={{ fontSize: '0.72rem', color: '#0F766E', fontWeight: 600, marginTop: '4px' }}>
                      {ADMIN_SUB_ROLE_LABELS[u.adminSubRole || 'SUPER_ADMIN']}
                    </div>
                  )}
                </td>
                <td>
                  <span className="user-code-badge">
                    {u.userCode || u.labId || u.phlebotomistId || u.employeeId || 'Global'}
                  </span>
                  {(u.labId || u.phlebotomistId) &&
                    u.userCode &&
                    u.userCode !== (u.labId || u.phlebotomistId) && (
                      <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '3px' }}>
                        Facility: {u.labId || u.phlebotomistId}
                      </div>
                    )}
                  {u.parentLabId && (
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                      Branch of {u.parentLabId}
                    </div>
                  )}
                </td>
                <td>
                  <span className={u.isActive ? 'status-pill-green' : 'status-pill-red'}>
                    {u.isActive ? '● Active' : '● Paused'}
                  </span>
                  <div
                    style={{
                      fontSize: '0.68rem',
                      marginTop: '4px',
                      color: u.initialPasswordSet ? '#0F766E' : '#64748B',
                      fontWeight: 600,
                    }}
                  >
                    {u.initialPasswordSet ? '🔑 Password Set' : 'OTP / Google Auth'}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {u.email.toLowerCase() === rootAdminEmail.toLowerCase() ? (
                      <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Root Super Admin</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            onOpenSetPasswordDialog({
                              email: u.email,
                              name: u.displayName,
                              userCode: u.userCode || u.labId || u.phlebotomistId || u.employeeId,
                              roleLabel: ROLE_LABELS[u.role],
                              hasPassword: u.initialPasswordSet,
                            })
                          }
                        >
                          🔑 {u.initialPasswordSet ? 'Reset Pwd' : 'Set Pwd'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => onEditUser(u)}
                        >
                          Edit Access
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            onShowAlert({
                              variant: 'confirm',
                              title: u.isActive ? 'Pause Account?' : 'Activate Account?',
                              message: `${u.isActive ? 'Pause' : 'Restore'} sign-in access for ${u.email}?`,
                              onConfirm: () => onToggleUserStatus(u, !u.isActive),
                            })
                          }
                        >
                          {u.isActive ? 'Pause' : 'Activate'}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
