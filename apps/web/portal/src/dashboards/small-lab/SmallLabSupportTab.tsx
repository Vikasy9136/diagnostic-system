export interface SmallLabSupportTabProps {
  facilityName: string;
  facilityId: string;
  accountEmail: string;
}

export function SmallLabSupportTab({
  facilityName,
  facilityId,
  accountEmail,
}: SmallLabSupportTabProps) {
  return (
    <div className="settings-grid-2">
      <div className="chart-card-modern">
        <h2 className="card-top-title">Cold-Chain Packaging &amp; Handover SOP</h2>
        <div
          style={{
            marginTop: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            fontSize: '0.86rem',
            color: '#475569',
          }}
        >
          <div>
            <strong>1. Vacutainer Cap Match:</strong> Match every test vial color (EDTA Purple, SST Red/Gold, Fluoride
            Grey) before sealing chiller pouch.
          </div>
          <div>
            <strong>2. Cold-Chain Band:</strong> Maintain pre-chilled gel packs at <strong>2°C – 8°C</strong> for
            blood/serum samples.
          </div>
          <div>
            <strong>3. Handover Verification:</strong> Provide the booking&apos;s 5-digit Handover OTP only at physical
            collection / receiving confirmation.
          </div>
        </div>
      </div>
      <div className="chart-card-modern">
        <h2 className="card-top-title">24x7 Operations Support Desk</h2>
        <p style={{ marginTop: '10px', fontSize: '0.86rem', color: '#64748B', lineHeight: 1.6 }}>
          Active Facility: <strong>{facilityName}</strong> ({facilityId})
          <br />
          Account Email: <strong>{accountEmail}</strong>
          <br />
          Cold-Chain Dispatch Hotline: <strong>1800-889-SETU</strong>
        </p>
      </div>
    </div>
  );
}

