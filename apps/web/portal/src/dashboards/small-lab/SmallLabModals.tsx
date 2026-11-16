import { type FormEvent } from 'react';
import {
  type DiagnosticReportRecord,
  generateCode128Bars,
  type PickupOrder,
  SpecimenQualityStatus,
  TUBE_METADATA,
  TubeType,
} from '@diagnostic/shared';
import { ModalFrame } from '../../components/shared';
import { type FormatLabelFn } from '../types';

export interface SmallLabAddPatientModalProps {
  open: boolean;
  onClose: () => void;
  ptName: string;
  onPtNameChange: (val: string) => void;
  ptAge: number;
  onPtAgeChange: (age: number) => void;
  ptGender: 'MALE' | 'FEMALE' | 'OTHER';
  onPtGenderChange: (g: 'MALE' | 'FEMALE' | 'OTHER') => void;
  ptPhone: string;
  onPtPhoneChange: (val: string) => void;
  ptAddress: string;
  onPtAddressChange: (val: string) => void;
  savingPatient: boolean;
  onSubmit: (e: FormEvent) => Promise<void>;
}

export function SmallLabAddPatientModal({
  open,
  onClose,
  ptName,
  onPtNameChange,
  ptAge,
  onPtAgeChange,
  ptGender,
  onPtGenderChange,
  ptPhone,
  onPtPhoneChange,
  ptAddress,
  onPtAddressChange,
  savingPatient,
  onSubmit,
}: SmallLabAddPatientModalProps) {
  return (
    <ModalFrame open={open} onClose={onClose} title="Add New Patient" disableClose={savingPatient}>
      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="form-group">
          <label className="form-label">Full Name / Pseudonym</label>
          <input className="form-input" value={ptName} onChange={(e) => onPtNameChange(e.target.value)} required />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div className="form-group">
            <label className="form-label">Age</label>
            <input
              type="number"
              className="form-input"
              value={ptAge}
              onChange={(e) => onPtAgeChange(Number(e.target.value))}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Gender</label>
            <select
              className="form-select"
              value={ptGender}
              onChange={(e) => onPtGenderChange(e.target.value as 'MALE' | 'FEMALE' | 'OTHER')}
            >
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Mobile Number</label>
          <input className="form-input" value={ptPhone} onChange={(e) => onPtPhoneChange(e.target.value)} required />
        </div>
        <div className="form-group">
          <label className="form-label">Address (Optional)</label>
          <input className="form-input" value={ptAddress} onChange={(e) => onPtAddressChange(e.target.value)} />
        </div>
        <div className="modal-footer" style={{ padding: 0, borderTop: 'none', marginTop: '8px' }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={savingPatient}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={savingPatient}>
            {savingPatient ? 'Saving...' : 'Save Patient'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export interface SmallLabSelfQcModalProps {
  order: PickupOrder | null;
  facilityName: string;
  onClose: () => void;
  temp: string;
  onTempChange: (val: string) => void;
  quality: SpecimenQualityStatus;
  onQualityChange: (q: SpecimenQualityStatus) => void;
  submitting: boolean;
  onSubmit: (e: FormEvent) => Promise<void>;
  formatLabel: FormatLabelFn;
}

export function SmallLabSelfQcModal({
  order,
  facilityName,
  onClose,
  temp,
  onTempChange,
  quality,
  onQualityChange,
  submitting,
  onSubmit,
  formatLabel,
}: SmallLabSelfQcModalProps) {
  if (!order) return null;
  return (
    <ModalFrame
      open={Boolean(order)}
      onClose={onClose}
      title={`Mark Self-Drop Sample Received • ${order.orderNumber}`}
      disableClose={submitting}
    >
      <form onSubmit={(e) => void onSubmit(e)}>
        <p style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '12px' }}>
          Confirm receipt at <strong>{facilityName}</strong> and log cold-chain cooler check.
        </p>
        <div className="form-group">
          <label className="form-label">Arrival Temperature (°C)</label>
          <input
            type="number"
            step="0.1"
            className="form-input"
            value={temp}
            onChange={(e) => onTempChange(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Specimen Integrity Status</label>
          <select
            className="form-select"
            value={quality}
            onChange={(e) => onQualityChange(e.target.value as SpecimenQualityStatus)}
          >
            {Object.values(SpecimenQualityStatus).map((st) => (
              <option key={st} value={st}>
                {formatLabel(st)}
              </option>
            ))}
          </select>
        </div>
        <div className="modal-footer" style={{ padding: 0, borderTop: 'none', marginTop: '8px' }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : 'Mark Received & Passed QC'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export interface SmallLabSelfReportModalProps {
  order: PickupOrder | null;
  onClose: () => void;
  pathologistName: string;
  onPathologistNameChange: (val: string) => void;
  onSelectFile: (file: File | null) => void;
  uploading: boolean;
  onSubmit: (e: FormEvent) => Promise<void>;
}

export function SmallLabSelfReportModal({
  order,
  onClose,
  pathologistName,
  onPathologistNameChange,
  onSelectFile,
  uploading,
  onSubmit,
}: SmallLabSelfReportModalProps) {
  if (!order) return null;
  return (
    <ModalFrame
      open={Boolean(order)}
      onClose={onClose}
      title={`Upload In-House Report • ${order.orderNumber}`}
      disableClose={uploading}
    >
      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="form-group">
          <label className="form-label">Signing Pathologist / Lab Signatory</label>
          <input
            className="form-input"
            value={pathologistName}
            onChange={(e) => onPathologistNameChange(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Verified Report File (PDF / Document)</label>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.txt"
            className="form-input"
            onChange={(e) => onSelectFile(e.target.files?.[0] || null)}
          />
        </div>
        <div className="modal-footer" style={{ padding: 0, borderTop: 'none', marginTop: '8px' }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={uploading}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={uploading}>
            {uploading ? 'Uploading...' : 'Publish Verified Report'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export interface SmallLabPrintReportModalProps {
  report: DiagnosticReportRecord | null;
  onClose: () => void;
  formatLabel: FormatLabelFn;
}

export function SmallLabPrintReportModal({
  report,
  onClose,
  formatLabel,
}: SmallLabPrintReportModalProps) {
  if (!report) return null;
  return (
    <ModalFrame
      open={Boolean(report)}
      onClose={onClose}
      title={`Diagnostic Report Preview • ${report.orderNumber}`}
      maxWidth="720px"
      footer={
        <>
          <a
            href={report.downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary no-print"
            style={{ textDecoration: 'none' }}
          >
            ⬇️ Download Attached PDF
          </a>
          <button type="button" className="btn-primary no-print" onClick={() => window.print()}>
            🖨️ Print Report
          </button>
        </>
      }
    >
      <div className="printable-report-sheet">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '2px solid #0F172A',
            paddingBottom: '14px',
            marginBottom: '16px',
          }}
        >
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>{report.targetLabName}</div>
            <div style={{ fontSize: '0.8rem', color: '#475569' }}>
              Diagnostic Processing Facility • LabSetu Partner Network
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#475569' }}>
            <div>
              <strong>Report ID:</strong> {report.id}
            </div>
            <div>
              <strong>Booking Ref:</strong> {report.orderNumber}
            </div>
            <div>
              <strong>Verified:</strong> {new Date(report.verifiedAt || report.createdAt).toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px',
            fontSize: '0.84rem',
          }}
        >
          <div>
            <strong>Patient:</strong> {report.patientName}
          </div>
          <div>
            <strong>Patient ID:</strong> {report.patientId}
          </div>
          <div>
            <strong>Referring Collection Center:</strong> {report.smallLabName}
          </div>
          <div>
            <strong>Specimen Quality:</strong> {formatLabel(report.qualityStatus || SpecimenQualityStatus.INTACT)}
          </div>
        </div>

        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '0.86rem', fontWeight: 700, marginBottom: '8px', color: '#0F172A' }}>
            Authorized Diagnostic Panels / Tests Performed
          </div>
          <div style={{ padding: '12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.86rem', lineHeight: 1.6 }}>
            {report.testsSummary}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTop: '1px solid #CBD5E1',
            paddingTop: '16px',
            marginTop: '24px',
            fontSize: '0.82rem',
          }}
        >
          <div style={{ color: '#64748B' }}>
            File Attachment: <strong>{report.fileName}</strong>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 800, color: '#0F172A' }}>{report.pathologistName}</div>
            <div style={{ fontSize: '0.74rem', color: '#64748B' }}>Authorized Signatory / MD Pathologist</div>
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}

export interface SmallLabPrintBarcodesModalProps {
  order: PickupOrder | null;
  onClose: () => void;
}

export function SmallLabPrintBarcodesModal({
  order,
  onClose,
}: SmallLabPrintBarcodesModalProps) {
  if (!order) return null;
  const specimens = order.specimens || [];

  return (
    <ModalFrame
      open={Boolean(order)}
      onClose={onClose}
      title={`🏷️ Vacutainer Barcode Stickers • Booking ${order.orderNumber}`}
      maxWidth="680px"
      footer={
        <>
          <button type="button" className="btn-secondary no-print" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn-primary no-print"
            style={{ background: '#0D9488', borderColor: '#0D9488' }}
            onClick={() => window.print()}
          >
            🖨️ Print {specimens.length} Tube Stickers
          </button>
        </>
      }
    >
      <div style={{ marginBottom: '14px', fontSize: '0.84rem', color: '#64748B' }} className="no-print">
        Standard 50mm × 25mm (2" × 1") thermal label layout. Paste each printed barcode sticker onto the corresponding vacutainer tube before phlebotomist custody handover.
      </div>

      <div
        className="printable-stickers-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '14px',
        }}
      >
        {specimens.map((s, idx) => {
          const tubeMeta = TUBE_METADATA[s.tubeType] || TUBE_METADATA[TubeType.SERUM_RED_GOLD];
          const barcodeData = generateCode128Bars(s.barcode);

          return (
            <div
              key={s.id || idx}
              className="barcode-sticker-card"
              style={{
                border: '1.5px solid #0F172A',
                borderRadius: '6px',
                padding: '8px 10px',
                background: '#FFFFFF',
                pageBreakInside: 'avoid',
                position: 'relative',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid #CBD5E1',
                  paddingBottom: '4px',
                  marginBottom: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    flexShrink: 0
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                      <path d="M10 2v7.31M14 2v7.31M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                      {order.patient.pseudonym.toUpperCase()} • {order.patient.age}Y/{order.patient.gender?.[0] || 'M'}
                    </div>
                    <div style={{ fontSize: '0.52rem', fontWeight: 700, color: '#0D9488', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      LABSETU DIAGNOSTICS
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: '4px',
                    color: '#FFFFFF',
                    backgroundColor: tubeMeta.colorHex,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  }}
                >
                  {tubeMeta.shortTag} • {tubeMeta.capColorName}
                </div>
              </div>

              <div style={{ fontSize: '0.72rem', color: '#334155', fontWeight: 600, marginBottom: '4px' }}>
                {s.testName} ({s.testCode})
              </div>

              {/* Barcode SVG */}
              <div style={{ textAlign: 'center', margin: '4px 0' }}>
                <svg
                  viewBox={`0 0 ${barcodeData.totalWidth} 44`}
                  style={{ width: '100%', height: '40px', display: 'block' }}
                >
                  {barcodeData.bars.map((bar, bIdx) => (
                    <rect key={bIdx} x={bar.x} y={0} width={bar.width} height={44} fill="#000000" />
                  ))}
                </svg>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    fontSize: '0.74rem',
                    letterSpacing: '1px',
                    marginTop: '2px',
                    color: '#0F172A',
                  }}
                >
                  {s.barcode}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.64rem',
                  color: '#64748B',
                  borderTop: '1px dashed #CBD5E1',
                  paddingTop: '3px',
                  marginTop: '4px',
                }}
              >
                <span>Order: {order.orderNumber}</span>
                <span>
                  {new Date(order.createdAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </ModalFrame>
  );
}
