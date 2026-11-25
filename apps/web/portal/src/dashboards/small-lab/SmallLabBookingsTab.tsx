import { useEffect, useMemo, useState } from 'react';
import {
  formatInr,
  formatOrderStatus,
  OrderStatus,
  type PickupOrder,
  type SettlementRecord,
} from '@diagnostic/shared';
import { EmptyStateBox } from '../../components/shared';

export interface SmallLabBookingsTabProps {
  myLabId: string;
  filteredOrders: PickupOrder[];
  settlements: SettlementRecord[];
  orderFilter: string;
  onOrderFilterChange: (filter: string) => void;
  payingSettlementId: string | null;
  onCreateNewBooking: () => void;
  onTrackCustody: (order: PickupOrder) => void;
  onPaySettlement: (settlement: SettlementRecord) => Promise<void>;
  onMarkPaidByLab?: (order: PickupOrder) => Promise<void> | void;
  onOpenSelfQc?: (order: PickupOrder) => void;
  onSelfStartRun?: (order: PickupOrder) => Promise<void>;
  onOpenSelfReport?: (order: PickupOrder) => void;
  onCancelOrder: (order: PickupOrder) => void;
  onRetryBroadcast?: (orderId: string, hikeInr: number) => Promise<void>;
  onPrintBarcodes?: (order: PickupOrder) => void;
  onViewPaymentSlip?: (order: PickupOrder) => void;
  onOpenOrderChat?: (order: PickupOrder) => void;
}

export function SmallLabBookingsTab({
  myLabId,
  filteredOrders,
  settlements,
  orderFilter,
  onOrderFilterChange,
  payingSettlementId,
  onCreateNewBooking,
  onTrackCustody,
  onPaySettlement,
  onMarkPaidByLab,
  onOpenSelfQc: _onOpenSelfQc,
  onSelfStartRun: _onSelfStartRun,
  onOpenSelfReport: _onOpenSelfReport,
  onCancelOrder,
  onRetryBroadcast,
  onPrintBarcodes,
  onViewPaymentSlip,
  onOpenOrderChat,
}: SmallLabBookingsTabProps) {
  const [nowTick, setNowTick] = useState(Date.now());
  const [previewPhotoOrder, setPreviewPhotoOrder] = useState<PickupOrder | null>(null);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [dateFilterMode, setDateFilterMode] = useState<'TODAY' | 'ALL' | 'CUSTOM'>('TODAY');
  const [selectedCustomDate, setSelectedCustomDate] = useState<string>(todayStr);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const todayCount = useMemo(() => {
    return filteredOrders.filter(
      (o) => (o.createdAt || o.scheduledPickupAt || '').slice(0, 10) === todayStr
    ).length;
  }, [filteredOrders, todayStr]);

  const displayOrders = useMemo(() => {
    return filteredOrders.filter((o) => {
      if (dateFilterMode === 'ALL') return true;
      const orderDate = (o.createdAt || o.scheduledPickupAt || '').slice(0, 10);
      if (dateFilterMode === 'TODAY') {
        return orderDate === todayStr;
      }
      if (dateFilterMode === 'CUSTOM') {
        return orderDate === selectedCustomDate;
      }
      return true;
    });
  }, [filteredOrders, dateFilterMode, todayStr, selectedCustomDate]);

  return (
    <div className="chart-card-modern">
      <div className="card-top-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h2 className="card-top-title" style={{ margin: 0 }}>
              All Dispatch Bookings ({displayOrders.length})
            </h2>
            <span
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                background:
                  dateFilterMode === 'TODAY'
                    ? '#CCFBF1'
                    : dateFilterMode === 'ALL'
                    ? '#F1F5F9'
                    : '#FEF3C7',
                color:
                  dateFilterMode === 'TODAY'
                    ? '#0F766E'
                    : dateFilterMode === 'ALL'
                    ? '#475569'
                    : '#92400E',
                border: '1px solid',
                borderColor:
                  dateFilterMode === 'TODAY'
                    ? '#99F6E4'
                    : dateFilterMode === 'ALL'
                    ? '#CBD5E1'
                    : '#FDE68A',
              }}
            >
              {dateFilterMode === 'TODAY'
                ? `📅 Today (${todayStr})`
                : dateFilterMode === 'ALL'
                ? '🌐 All Dates'
                : `📅 Selected: ${selectedCustomDate}`}
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
            Real-time tracking, live rider GPS, payment &amp; self-drop lab actions
          </p>
        </div>

        {/* Date Filter & Status Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Quick Date Toggle Buttons */}
          <div
            style={{
              display: 'inline-flex',
              background: '#F1F5F9',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
            }}
          >
            <button
              type="button"
              onClick={() => setDateFilterMode('TODAY')}
              style={{
                border: 'none',
                background: dateFilterMode === 'TODAY' ? '#0D9488' : 'transparent',
                color: dateFilterMode === 'TODAY' ? '#FFFFFF' : '#475569',
                fontSize: '0.78rem',
                fontWeight: dateFilterMode === 'TODAY' ? 700 : 500,
                padding: '5px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Today ({todayCount})
            </button>
            <button
              type="button"
              onClick={() => setDateFilterMode('ALL')}
              style={{
                border: 'none',
                background: dateFilterMode === 'ALL' ? '#0A2A5E' : 'transparent',
                color: dateFilterMode === 'ALL' ? '#FFFFFF' : '#475569',
                fontSize: '0.78rem',
                fontWeight: dateFilterMode === 'ALL' ? 700 : 500,
                padding: '5px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              All Dates ({filteredOrders.length})
            </button>
          </div>

          {/* Past / Custom Calendar Picker with FUTURE DATES DISABLED */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="date"
              className="form-control"
              value={selectedCustomDate}
              max={todayStr}
              title="Pick current or past date (future dates are disabled)"
              onChange={(e) => {
                const val = e.target.value;
                if (val && val <= todayStr) {
                  setSelectedCustomDate(val);
                  setDateFilterMode('CUSTOM');
                }
              }}
              style={{
                width: '138px',
                padding: '6px 8px',
                fontSize: '0.78rem',
                borderRadius: '8px',
                border:
                  dateFilterMode === 'CUSTOM' ? '1.5px solid #0D9488' : '1px solid #CBD5E1',
                background: dateFilterMode === 'CUSTOM' ? '#F0FDFA' : '#FFFFFF',
              }}
            />
          </div>

          {/* Status Filter */}
          <select
            className="form-select"
            style={{ width: '160px', fontSize: '0.78rem', padding: '6px 10px' }}
            value={orderFilter}
            onChange={(e) => onOrderFilterChange(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            {Object.values(OrderStatus).map((st) => (
              <option key={st} value={st}>
                {formatOrderStatus(st)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {displayOrders.length === 0 ? (
        <EmptyStateBox
          title={
            dateFilterMode === 'TODAY'
              ? `No Bookings Dispatched Today (${todayStr})`
              : dateFilterMode === 'CUSTOM'
              ? `No Bookings on ${selectedCustomDate}`
              : 'No Bookings Found'
          }
          description={
            dateFilterMode === 'TODAY' && filteredOrders.length > 0
              ? `You have ${filteredOrders.length} previous booking(s). Switch to "All Dates" to view them.`
              : 'Dispatch a booking to track sample custody live from collection to verified PDF report.'
          }
          actionLabel={
            dateFilterMode !== 'ALL' && filteredOrders.length > 0
              ? 'View All Dates'
              : '+ Create Booking'
          }
          onAction={
            dateFilterMode !== 'ALL' && filteredOrders.length > 0
              ? () => setDateFilterMode('ALL')
              : onCreateNewBooking
          }
        />
      ) : (
        <div
          className="dispatch-bookings-cards-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: '16px',
            marginTop: '16px',
          }}
        >
          {displayOrders.map((o) => {
            const stl = settlements.find((s) => s.orderId === o.id);
            const isSelfDrop = o.dropType === 'SELF_DROP' || o.targetLabId === myLabId;
            const cancellable =
              o.status === OrderStatus.CREATED ||
              o.status === OrderStatus.READY_FOR_PICKUP ||
              o.status === OrderStatus.ASSIGNED_TO_PHLEBO;
            const needsOnlinePay =
              stl && stl.paymentStatus !== 'PAID' && stl.grossAmountInr >= 1 && o.paymentStatus !== 'PAID';
            const isSearchingPhlebo = o.status === OrderStatus.READY_FOR_PICKUP && !o.phlebotomistId;
            const expiresMs = o.broadcastExpiresAt
              ? new Date(o.broadcastExpiresAt).getTime()
              : new Date(o.createdAt).getTime() + 45000;
            const remSec = Math.max(0, Math.floor((expiresMs - nowTick) / 1000));
            const isTimedOut = isSearchingPhlebo && remSec === 0;
            const isCancelled = o.status === OrderStatus.CANCELLED;

            return (
              <div
                key={o.id}
                className="dispatch-booking-card"
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '16px',
                  border: isCancelled
                    ? '1.5px solid #FECACA'
                    : isSearchingPhlebo
                    ? '1.5px solid #99F6E4'
                    : o.phlebotomistId
                    ? '1.5px solid #BFDBFE'
                    : '1.5px solid #E2E8F0',
                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.05)',
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  position: 'relative',
                  transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
                }}
              >
                {/* 1. Header Row: Order Number, Distance/Pool Tag, Status Badge */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    borderBottom: '1px solid #F1F5F9',
                    paddingBottom: '10px',
                    gap: '10px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '1rem',
                          fontWeight: 800,
                          color: '#0F172A',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {o.orderNumber}
                      </span>
                      {(o.distanceKm || o.broadcastRadiusKm) && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: '#0D9488',
                            backgroundColor: '#F0FDFA',
                            border: '1px solid #CCFBF1',
                            borderRadius: '6px',
                            padding: '1px 6px',
                          }}
                        >
                          {o.distanceKm ? `${o.distanceKm} km` : ''}
                          {o.distanceKm && o.broadcastRadiusKm ? ' • ' : ''}
                          {o.broadcastRadiusKm ? `${o.broadcastRadiusKm}km pool` : ''}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '3px' }}>
                      {new Date(o.createdAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>

                  <div>
                    {isCancelled ? (
                      <span
                        style={{
                          background: '#FEE2E2',
                          color: '#DC2626',
                          border: '1px solid #FECACA',
                          borderRadius: '999px',
                          padding: '3px 10px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ✕ Cancelled
                      </span>
                    ) : (
                      <span className="status-pill-blue" style={{ whiteSpace: 'nowrap' }}>
                        {formatOrderStatus(o.status)}
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Patient & Tests Section */}
                <div
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.92rem' }}>👤</span>
                      <strong style={{ fontSize: '0.88rem', color: '#0F172A' }}>
                        {o.patient.pseudonym}
                      </strong>
                    </div>
                    <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>
                      {o.patient.age}Y / {o.patient.gender?.[0]?.toUpperCase() || 'M'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px', alignItems: 'center' }}>
                    {o.specimens.map((s, sIdx) => (
                      <span
                        key={s.id || sIdx}
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          backgroundColor: '#EFF6FF',
                          color: '#1D4ED8',
                          border: '1px solid #BFDBFE',
                          borderRadius: '6px',
                          padding: '2px 7px',
                        }}
                      >
                        🧪 {s.testName || s.testCode}
                      </span>
                    ))}
                    {o.matchedPackageNames?.length ? (
                      <span
                        className="package-match-pill"
                        style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                      >
                        🎁 {o.matchedPackageNames[0]}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* 3. Drop Destination & Route */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.78rem',
                    color: '#334155',
                  }}
                >
                  <span style={{ fontSize: '0.9rem' }}>🏥</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {o.targetLabName}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                      {isSelfDrop
                        ? 'Self Lab Return'
                        : o.dropType === 'CUSTOM_ADDRESS'
                        ? 'Custom Address'
                        : 'Partner Large Lab'}
                    </div>
                  </div>
                </div>

                {/* 4. Courier & Live Proof Status Box */}
                <div
                  style={{
                    backgroundColor: isSearchingPhlebo ? '#F0FDFA' : '#F8FAFC',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    border: isSearchingPhlebo ? '1px solid #CCFBF1' : '1px solid #E2E8F0',
                  }}
                >
                  {isSearchingPhlebo ? (
                    <div>
                      {!isTimedOut ? (
                        <div>
                          <div style={{ color: '#0D9488', fontWeight: 800, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>📡</span>
                            <span>Searching Phlebo... ({remSec}s)</span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '3px' }}>
                            {o.broadcastRadiusKm || 5} km Pool • Rider: {formatInr(o.courierFeeInr || 100)}
                            {o.surgeIncentiveInr ? ` (+₹${o.surgeIncentiveInr})` : ''}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ color: '#DC2626', fontWeight: 800, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>⚠️</span>
                            <span>No Phlebo Found</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ padding: '3px 9px', fontSize: '0.72rem' }}
                              onClick={() => void onRetryBroadcast?.(o.id, 0)}
                            >
                              🔄 Retry
                            </button>
                            <button
                              type="button"
                              className="btn-primary"
                              style={{ padding: '3px 9px', fontSize: '0.72rem', background: '#D97706', borderColor: '#D97706' }}
                              onClick={() => void onRetryBroadcast?.(o.id, 30)}
                            >
                              ⚡ +₹30 Boost
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.9rem' }}>🚴</span>
                        <div>
                          <strong style={{ fontSize: '0.82rem', color: '#0F172A' }}>
                            {o.phlebotomistName || 'Assigned Courier'}
                          </strong>
                          {o.phleboLiveLocation && (
                            <div style={{ fontSize: '0.7rem', color: '#0D9488', fontWeight: 700 }}>
                              📍 Live GPS Active
                            </div>
                          )}
                        </div>
                      </div>

                      {o.sampleCollectionPhotoUrl && (
                        <button
                          type="button"
                          style={{
                            padding: '3px 8px',
                            fontSize: '0.72rem',
                            backgroundColor: '#ECFDF5',
                            color: '#059669',
                            border: '1px solid #A7F3D0',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 700,
                          }}
                          onClick={() => setPreviewPhotoOrder(o)}
                        >
                          📷 View Sample Photo
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* 5. OTP & Payment Details Strip */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#F1F5F9',
                    fontSize: '0.76rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#64748B', fontWeight: 600 }}>Handover OTP:</span>
                    {isCancelled ? (
                      <span style={{ color: '#94A3B8', textDecoration: 'line-through' }}>
                        {o.handoverOtp || '—'} (Void)
                      </span>
                    ) : (
                      <code
                        style={{
                          fontWeight: 800,
                          color: '#0F172A',
                          backgroundColor: '#FFFFFF',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid #CBD5E1',
                        }}
                      >
                        {o.handoverOtp || '—'}
                      </code>
                    )}
                  </div>

                  <div>
                    {isCancelled ? (
                      <span
                        style={{
                          background: '#F1F5F9',
                          color: '#64748B',
                          border: '1px solid #E2E8F0',
                          borderRadius: '999px',
                          padding: '2px 8px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                        }}
                      >
                        Order Void
                      </span>
                    ) : (
                      <span
                        className={
                          o.paymentStatus === 'PAID' || stl?.paymentStatus === 'PAID'
                            ? 'status-pill-green'
                            : 'status-pill-amber'
                        }
                      >
                        {o.paymentStatus === 'PAID' || stl?.paymentStatus === 'PAID'
                          ? `Paid ${formatInr(stl?.grossAmountInr || o.totalAmountInr || 0)}`
                          : `Due ${formatInr(stl?.grossAmountInr || o.totalAmountInr || 0)}`}
                      </span>
                    )}
                  </div>
                </div>

                {/* 6. Card Action Buttons Toolbar */}
                <div
                  style={{
                    display: 'flex',
                    gap: '6px',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    borderTop: '1px solid #F1F5F9',
                    paddingTop: '10px',
                    marginTop: 'auto',
                  }}
                >
                  {isCancelled ? (
                    <span
                      style={{
                        color: '#94A3B8',
                        fontSize: '0.76rem',
                        fontStyle: 'italic',
                        fontWeight: 600,
                      }}
                    >
                      ✕ Cancelled (All Actions Disabled)
                    </span>
                  ) : (
                    <>
                      {isSearchingPhlebo && (
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ fontSize: '0.74rem', background: '#0D9488', borderColor: '#0D9488', padding: '4px 9px' }}
                          onClick={() => onTrackCustody(o)}
                        >
                          📡 Radar / Hike
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: '0.74rem', padding: '4px 9px' }}
                        onClick={() => onTrackCustody(o)}
                      >
                        {o.phleboLiveLocation ? '📍 Live / Custody' : 'Track Custody'}
                      </button>

                      {o.phlebotomistId && onOpenOrderChat && (
                        <button
                          type="button"
                          className="btn-primary"
                          style={{
                            fontSize: '0.74rem',
                            padding: '4px 9px',
                            background: '#2563EB',
                            borderColor: '#2563EB',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer',
                          }}
                          onClick={() => onOpenOrderChat(o)}
                        >
                          💬 Chat Phlebo
                          {(o.chatUnreadBySmallLab || 0) > 0 && (
                            <span
                              style={{
                                background: '#EF4444',
                                color: '#FFFFFF',
                                borderRadius: '999px',
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                padding: '1px 6px',
                                lineHeight: 1.3,
                              }}
                            >
                              {o.chatUnreadBySmallLab}
                            </span>
                          )}
                        </button>
                      )}

                      {o.specimens && o.specimens.length > 0 && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: '0.74rem', color: '#0F172A', borderColor: '#CBD5E1', padding: '4px 9px' }}
                          onClick={() => onPrintBarcodes?.(o)}
                          title="Print tube barcode stickers for vacutainers"
                        >
                          🏷️ Print Stickers
                        </button>
                      )}

                      {onViewPaymentSlip && o.paymentStatus === 'PAID' && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{
                            fontSize: '0.74rem',
                            color: '#0D9488',
                            borderColor: '#99F6E4',
                            background: '#F0FDFA',
                            fontWeight: 700,
                            padding: '4px 9px',
                          }}
                          onClick={() => onViewPaymentSlip(o)}
                          title="View & Print Official PDF Payment Receipt"
                        >
                          🧾 Receipt Slip
                        </button>
                      )}

                      {needsOnlinePay && stl && (
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ fontSize: '0.74rem', padding: '4px 9px' }}
                          disabled={payingSettlementId === stl.id}
                          onClick={() => void onPaySettlement(stl)}
                        >
                          {payingSettlementId === stl.id ? 'Opening...' : 'Pay Now'}
                        </button>
                      )}

                      {o.paymentStatus !== 'PAID' && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{
                            fontSize: '0.74rem',
                            color: '#0D9488',
                            borderColor: '#0D9488',
                            fontWeight: 600,
                            padding: '4px 9px',
                          }}
                          onClick={() => void onMarkPaidByLab?.(o)}
                          title="Mark as settled directly with the lab so the phlebotomist will not collect payment from the patient."
                        >
                          ✓ Mark Paid by Lab
                        </button>
                      )}

                      {(o.status === OrderStatus.REPORT_UPLOADED || o.status === OrderStatus.COMPLETED) && (
                        <span
                          className="status-pill-green"
                          style={{ fontSize: '0.72rem', fontWeight: 700 }}
                        >
                          ✓ Report Ready
                        </span>
                      )}

                      {cancellable && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ color: '#DC2626', borderColor: '#FECACA', fontSize: '0.74rem', padding: '4px 9px', marginLeft: 'auto' }}
                          onClick={() => onCancelOrder(o)}
                        >
                          Cancel
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {previewPhotoOrder && previewPhotoOrder.sampleCollectionPhotoUrl && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
          onClick={() => setPreviewPhotoOrder(null)}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #E2E8F0',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0F172A', fontWeight: 700 }}>
                  📸 Specimen Photo Proof • {previewPhotoOrder.orderNumber}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                  Patient: {previewPhotoOrder.patient.pseudonym} • Courier: {previewPhotoOrder.phlebotomistName || 'Field Phlebo'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPhotoOrder(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '22px',
                  cursor: 'pointer',
                  color: '#64748B',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
              <img
                src={previewPhotoOrder.sampleCollectionPhotoUrl}
                alt={`Sample proof for ${previewPhotoOrder.orderNumber}`}
                style={{
                  maxWidth: '100%',
                  maxHeight: '420px',
                  borderRadius: '10px',
                  objectFit: 'contain',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  border: '1px solid #E2E8F0',
                }}
              />
              <div
                style={{
                  marginTop: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.8rem',
                  color: '#475569',
                  backgroundColor: '#FFFFFF',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <span>
                  Chiller Temp: <strong>{previewPhotoOrder.arrivalTemperatureCelsius ? `${previewPhotoOrder.arrivalTemperatureCelsius}°C` : '4.0°C'}</strong>
                </span>
                <a
                  href={previewPhotoOrder.sampleCollectionPhotoUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#2563EB', fontWeight: 600, textDecoration: 'none' }}
                >
                  Open Full Resolution ↗
                </a>
              </div>
            </div>

            <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #E2E8F0' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPreviewPhotoOrder(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
