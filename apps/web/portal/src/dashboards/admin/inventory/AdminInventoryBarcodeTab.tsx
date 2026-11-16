import { useState, useEffect, useMemo } from 'react';
import {
  generateCode128Bars,
  type KitAssemblyRecord,
  type KitSerialRecord,
  type TubeSerialRecord,
} from '@diagnostic/shared';
import {
  fetchKitAssembliesHistory,
  fetchKitSerials,
  fetchTubeSerials,
  resolveBarcodeIdentityApi,
  type UniversalBarcodeLookupResponse,
} from '../../../services/inventoryApiService';

interface AdminInventoryBarcodeTabProps {
  onShowAlert: (params: {
    variant: 'info' | 'success' | 'warning' | 'error' | 'confirm';
    title: string;
    message: string;
    detail?: string;
  }) => void;
}

type PrintMode = 'KIT_LABELS' | 'TUBE_LABELS' | 'ASSEMBLY_BATCH' | 'LIVE_INSPECTOR';

const CAP_COLORS: Record<string, { label: string; color: string; prefix: string }> = {
  EDTA_LAVENDER: { label: 'EDTA (Lavender/Purple)', color: '#8B5CF6', prefix: 'EDTA' },
  SERUM_RED_GOLD: { label: 'SST Gel (Gold/Yellow)', color: '#EAB308', prefix: 'SST' },
  SODIUM_FLUORIDE_GREY: { label: 'Fluoride (Grey)', color: '#64748B', prefix: 'FLU' },
  SODIUM_CITRATE_BLUE: { label: 'Citrate (Light Blue)', color: '#3B82F6', prefix: 'CIT' },
  HEPARIN_GREEN: { label: 'Sodium Heparin (Green)', color: '#10B981', prefix: 'HEP' },
};

export function AdminInventoryBarcodeTab({ onShowAlert }: AdminInventoryBarcodeTabProps) {
  const [printMode, setPrintMode] = useState<PrintMode>('KIT_LABELS');
  const [labelSize, setLabelSize] = useState<'50x25' | '38x25'>('50x25');

  // Loaded Serial Data from Backend
  const [kitSerials, setKitSerials] = useState<KitSerialRecord[]>([]);
  const [tubeSerials, setTubeSerials] = useState<TubeSerialRecord[]>([]);
  const [assemblies, setAssemblies] = useState<KitAssemblyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [selectedAssemblyId, setSelectedAssemblyId] = useState<string>('ALL');
  const [selectedKitFilter, setSelectedKitFilter] = useState<string>('ALL');
  const [selectedTubeTypeFilter, setSelectedTubeTypeFilter] = useState<string>('ALL');
  const [searchSerial, setSearchSerial] = useState<string>('');

  // Selected Items for printing
  const [selectedKitIds, setSelectedKitIds] = useState<Set<string>>(new Set());
  const [selectedTubeIds, setSelectedTubeIds] = useState<Set<string>>(new Set());

  // Live Barcode Inspector State
  const [inspectorInput, setInspectorInput] = useState<string>('');
  const [inspectorResult, setInspectorResult] = useState<UniversalBarcodeLookupResponse | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [kits, tubes, asms] = await Promise.all([
        fetchKitSerials({ limit: 100 }),
        fetchTubeSerials({ limit: 200 }),
        fetchKitAssembliesHistory(),
      ]);
      setKitSerials(kits);
      setTubeSerials(tubes);
      setAssemblies(asms);

      // Select all by default for easy batch printing
      setSelectedKitIds(new Set(kits.map((k) => k.kitSerial)));
      setSelectedTubeIds(new Set(tubes.map((t) => t.tubeSerial)));
    } catch (err: any) {
      console.warn('Failed loading serials for barcode center:', err);
    } finally {
      setIsLoading(false);
    }
  }

  // Filtered Kits
  const filteredKits = useMemo(() => {
    return kitSerials.filter((k) => {
      if (selectedAssemblyId !== 'ALL' && k.assemblyId !== selectedAssemblyId) return false;
      if (selectedKitFilter !== 'ALL' && k.kitCode !== selectedKitFilter) return false;
      if (searchSerial) {
        const q = searchSerial.toLowerCase();
        return (
          k.kitSerial.toLowerCase().includes(q) ||
          k.kitName.toLowerCase().includes(q) ||
          k.kitCode.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [kitSerials, selectedAssemblyId, selectedKitFilter, searchSerial]);

  // Filtered Tubes
  const filteredTubes = useMemo(() => {
    return tubeSerials.filter((t) => {
      if (selectedAssemblyId !== 'ALL' && t.assemblyId !== selectedAssemblyId) return false;
      if (selectedTubeTypeFilter !== 'ALL' && t.tubeType !== selectedTubeTypeFilter) return false;
      if (searchSerial) {
        const q = searchSerial.toLowerCase();
        return (
          t.tubeSerial.toLowerCase().includes(q) ||
          t.tubeType.toLowerCase().includes(q) ||
          t.parentKitId?.toLowerCase().includes(q) ||
          t.supplierBatch.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [tubeSerials, selectedAssemblyId, selectedTubeTypeFilter, searchSerial]);

  // Toggle Kit Selection
  function toggleKitSelection(serial: string) {
    const next = new Set(selectedKitIds);
    if (next.has(serial)) next.delete(serial);
    else next.add(serial);
    setSelectedKitIds(next);
  }

  // Toggle Tube Selection
  function toggleTubeSelection(serial: string) {
    const next = new Set(selectedTubeIds);
    if (next.has(serial)) next.delete(serial);
    else next.add(serial);
    setSelectedTubeIds(next);
  }

  // Live Inspector Search
  async function handleInspectBarcode(code: string) {
    if (!code.trim()) return;
    setIsInspecting(true);
    try {
      const res = await resolveBarcodeIdentityApi(code.trim());
      setInspectorResult(res);
    } catch (err: any) {
      onShowAlert({
        variant: 'error',
        title: 'Resolution Error',
        message: err.message || 'Failed resolving barcode identity.',
      });
      setInspectorResult(null);
    } finally {
      setIsInspecting(false);
    }
  }

  // Print Window Execution
  function handlePrintLabelsWindow(mode: 'KITS' | 'TUBES' | 'BATCH') {
    const printWindow = window.open('', '_blank', 'width=900,height=750');
    if (!printWindow) {
      onShowAlert({
        variant: 'error',
        title: 'Popup Blocked',
        message: 'Please allow popups to open the thermal label printing window.',
      });
      return;
    }

    let labelsToRender: Array<{
      type: 'KIT' | 'TUBE';
      title: string;
      code: string;
      subText: string;
      capColor?: string;
      lotText?: string;
      expiryText?: string;
      extraInfo?: string;
    }> = [];

    if (mode === 'KITS') {
      const toPrint = filteredKits.filter((k) => selectedKitIds.has(k.kitSerial));
      labelsToRender = toPrint.map((k) => ({
        type: 'KIT',
        title: k.kitName,
        code: k.kitSerial,
        subText: `${k.kitCode} • BOM v${k.bomVersion}`,
        expiryText: `Exp: ${k.expiryDate}`,
        lotText: `Batch: ${k.assemblyBatch || k.assemblyId}`,
        extraInfo: 'Central Warehouse Pre-Assembled Sealed Kit',
      }));
    } else if (mode === 'TUBES') {
      const toPrint = filteredTubes.filter((t) => selectedTubeIds.has(t.tubeSerial));
      labelsToRender = toPrint.map((t) => {
        const meta = CAP_COLORS[t.tubeType] || { label: t.tubeType, color: '#334155' };
        return {
          type: 'TUBE',
          title: meta.label,
          code: t.tubeSerial,
          subText: `${t.tubeType} • ${t.sku}`,
          capColor: meta.color,
          expiryText: `Exp: ${t.expiryDate}`,
          lotText: `Lot: ${t.supplierBatch}`,
          extraInfo: `Parent: ${t.parentKitId || 'SPARE'}`,
        };
      });
    } else if (mode === 'BATCH') {
      // Print kits + their child tubes consecutively
      const targetAsm = assemblies.find((a) => a.id === selectedAssemblyId) || assemblies[0];
      if (!targetAsm) {
        onShowAlert({
          variant: 'warning',
          title: 'Select Assembly Run',
          message: 'Please choose an assembly run to batch print.',
        });
        return;
      }
      const asmKits = kitSerials.filter((k) => k.assemblyId === targetAsm.id);
      for (const k of asmKits) {
        // Kit Label
        labelsToRender.push({
          type: 'KIT',
          title: k.kitName,
          code: k.kitSerial,
          subText: `${k.kitCode} • BOM v${k.bomVersion}`,
          expiryText: `Exp: ${k.expiryDate}`,
          lotText: `Batch: ${k.assemblyBatch}`,
          extraInfo: 'SEALED DIAGNOSTIC PACK',
        });
        // Contained Tubes
        const childTubes = tubeSerials.filter((t) => t.parentKitId === k.kitSerial);
        for (const ct of childTubes) {
          const meta = CAP_COLORS[ct.tubeType] || { label: ct.tubeType, color: '#334155' };
          labelsToRender.push({
            type: 'TUBE',
            title: meta.label,
            code: ct.tubeSerial,
            subText: `${ct.tubeType}`,
            capColor: meta.color,
            expiryText: `Exp: ${ct.expiryDate}`,
            lotText: `Lot: ${ct.supplierBatch}`,
            extraInfo: `Kit: ${k.kitSerial}`,
          });
        }
      }
    }

    if (labelsToRender.length === 0) {
      onShowAlert({
        variant: 'warning',
        title: 'No Labels Selected',
        message: 'Please select at least one kit or tube to print.',
      });
      return;
    }

    const cardsHtml = labelsToRender
      .map((item, idx) => {
        const bData = generateCode128Bars(item.code);
        const rectsHtml = bData.bars
          .map((b) => `<rect x="${b.x}" y="0" width="${b.width}" height="38" fill="#000000" />`)
          .join('');

        const isKit = item.type === 'KIT';
        return `
        <div class="thermal-card ${isKit ? 'kit-card' : 'tube-card'}">
          <div class="card-header">
            <div class="brand-badge">
              <span class="logo-box">LS</span>
              <div>
                <div class="brand-name">LABSETU DIAGNOSTICS</div>
                <div class="brand-tag">${isKit ? 'PRE-ASSEMBLED KIT' : 'SPECIMEN VACUTAINER'}</div>
              </div>
            </div>
            <div class="cap-indicator">
              ${item.capColor ? `<span class="cap-circle" style="background-color: ${item.capColor};"></span>` : ''}
              <span class="seq-no">#${idx + 1}</span>
            </div>
          </div>

          <div class="card-title">${item.title}</div>
          <div class="card-sub">${item.subText}</div>

          <div class="barcode-box">
            <svg viewBox="0 0 ${bData.totalWidth} 40" class="barcode-svg">
              ${rectsHtml}
            </svg>
            <div class="barcode-text">${item.code}</div>
          </div>

          <div class="card-footer">
            <span>${item.lotText || ''}</span>
            <span>${item.expiryText || ''}</span>
          </div>
          ${item.extraInfo ? `<div class="card-extra">${item.extraInfo}</div>` : ''}
        </div>
      `;
      })
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>LabSetu Thermal Barcode Labels (${labelsToRender.length} Labels)</title>
          <style>
            @page {
              size: auto;
              margin: 4mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              background: #FFFFFF;
              padding: 8px;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(${labelSize === '50x25' ? '210px' : '170px'}, 1fr));
              gap: 8px;
            }
            .thermal-card {
              border: 1.5px solid #0F172A;
              border-radius: 6px;
              padding: 6px 8px;
              background: #FFFFFF;
              page-break-inside: avoid;
              break-inside: avoid;
              display: flex;
              flex-direction: column;
              justifyContent: space-between;
              height: ${labelSize === '50x25' ? '130px' : '110px'};
            }
            .kit-card {
              border: 2px solid #0D9488;
            }
            .card-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 1px solid #CBD5E1;
              padding-bottom: 2px;
            }
            .brand-badge {
              display: flex;
              align-items: center;
              gap: 4px;
            }
            .logo-box {
              background: #0D9488;
              color: #FFFFFF;
              font-size: 8px;
              font-weight: 900;
              padding: 2px 4px;
              border-radius: 3px;
            }
            .brand-name {
              font-size: 9px;
              font-weight: 900;
              color: #0F172A;
              line-height: 1;
            }
            .brand-tag {
              font-size: 6px;
              font-weight: 700;
              color: #0D9488;
              line-height: 1;
              margin-top: 1px;
            }
            .cap-indicator {
              display: flex;
              align-items: center;
              gap: 3px;
            }
            .cap-circle {
              width: 8px;
              height: 8px;
              border-radius: 50%;
              display: inline-block;
              border: 1px solid #64748B;
            }
            .seq-no {
              font-size: 7px;
              font-weight: 700;
              color: #64748B;
            }
            .card-title {
              font-size: 9px;
              font-weight: 800;
              color: #0F172A;
              margin-top: 3px;
              line-height: 1.1;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .card-sub {
              font-size: 7px;
              color: #475569;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .barcode-box {
              text-align: center;
              margin: 2px 0;
            }
            .barcode-svg {
              width: 100%;
              height: 32px;
              display: block;
            }
            .barcode-text {
              font-family: monospace;
              font-size: 9px;
              font-weight: 900;
              color: #000000;
              letter-spacing: 0.5px;
            }
            .card-footer {
              display: flex;
              justify-content: space-between;
              font-size: 7px;
              font-weight: 700;
              color: #334155;
              border-top: 0.5px solid #E2E8F0;
              padding-top: 2px;
            }
            .card-extra {
              font-size: 6px;
              color: #64748B;
              text-align: center;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="grid">
            ${cardsHtml}
          </div>
          <script>
            window.onload = function() {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header Card */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>🏷️</span>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0F172A' }}>
              Thermal Barcode Center &amp; Universal Scanner
            </h2>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.88rem', color: '#64748B' }}>
            Generate cryo-resistant 3-level barcodes (Code 128 / QR) for physical kits, specimen tubes, and inspect scanned labels in real time.
            {isLoading && <span style={{ marginLeft: '10px', color: '#0D9488', fontWeight: 700 }}>• Syncing Serials...</span>}
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>
            <span>Label Size:</span>
            <select
              value={labelSize}
              onChange={(e) => setLabelSize(e.target.value as '50x25' | '38x25')}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1.5px solid #CBD5E1',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              <option value="50x25">50mm × 25mm (Standard)</option>
              <option value="38x25">38mm × 25mm (Compact)</option>
            </select>
          </div>

          {printMode === 'KIT_LABELS' && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => handlePrintLabelsWindow('KITS')}
              style={{ padding: '9px 18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>🖨️</span> Print Selected Kits ({selectedKitIds.size})
            </button>
          )}

          {printMode === 'TUBE_LABELS' && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => handlePrintLabelsWindow('TUBES')}
              style={{ padding: '9px 18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>🖨️</span> Print Selected Tubes ({selectedTubeIds.size})
            </button>
          )}

          {printMode === 'ASSEMBLY_BATCH' && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => handlePrintLabelsWindow('BATCH')}
              style={{ padding: '9px 18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)' }}
            >
              <span>⚡</span> Print Complete Assembly Batch Run
            </button>
          )}
        </div>
      </div>

      {/* Sub-Mode Switcher */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #E2E8F0' }}>
        <button
          type="button"
          onClick={() => setPrintMode('KIT_LABELS')}
          style={{
            padding: '10px 18px',
            background: 'none',
            border: 'none',
            borderBottom: printMode === 'KIT_LABELS' ? '3px solid #0D9488' : '3px solid transparent',
            color: printMode === 'KIT_LABELS' ? '#0D9488' : '#64748B',
            fontWeight: printMode === 'KIT_LABELS' ? 700 : 500,
            fontSize: '0.90rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>📦</span> Physical Kit Labels ({kitSerials.length})
        </button>

        <button
          type="button"
          onClick={() => setPrintMode('TUBE_LABELS')}
          style={{
            padding: '10px 18px',
            background: 'none',
            border: 'none',
            borderBottom: printMode === 'TUBE_LABELS' ? '3px solid #0D9488' : '3px solid transparent',
            color: printMode === 'TUBE_LABELS' ? '#0D9488' : '#64748B',
            fontWeight: printMode === 'TUBE_LABELS' ? 700 : 500,
            fontSize: '0.90rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>🧪</span> Specimen Vacutainer Labels ({tubeSerials.length})
        </button>

        <button
          type="button"
          onClick={() => setPrintMode('ASSEMBLY_BATCH')}
          style={{
            padding: '10px 18px',
            background: 'none',
            border: 'none',
            borderBottom: printMode === 'ASSEMBLY_BATCH' ? '3px solid #0D9488' : '3px solid transparent',
            color: printMode === 'ASSEMBLY_BATCH' ? '#0D9488' : '#64748B',
            fontWeight: printMode === 'ASSEMBLY_BATCH' ? 700 : 500,
            fontSize: '0.90rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>🏭</span> Assembly Run Batch Print ({assemblies.length} Runs)
        </button>

        <button
          type="button"
          onClick={() => setPrintMode('LIVE_INSPECTOR')}
          style={{
            padding: '10px 18px',
            background: 'none',
            border: 'none',
            borderBottom: printMode === 'LIVE_INSPECTOR' ? '3px solid #0D9488' : '3px solid transparent',
            color: printMode === 'LIVE_INSPECTOR' ? '#0D9488' : '#64748B',
            fontWeight: printMode === 'LIVE_INSPECTOR' ? 700 : 500,
            fontSize: '0.90rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>🔍</span> 3-Level Barcode Inspector &amp; Resolver
        </button>
      </div>

      {/* FILTER BAR (Kits & Tubes) */}
      {printMode !== 'LIVE_INSPECTOR' && (
        <div
          style={{
            background: '#F8FAFC',
            borderRadius: '12px',
            padding: '14px 18px',
            border: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search serial, lot, or code..."
              value={searchSerial}
              onChange={(e) => setSearchSerial(e.target.value)}
              style={{
                padding: '7px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '0.84rem',
                width: '240px',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '0.80rem', fontWeight: 700, color: '#475569' }}>Assembly Run:</label>
              <select
                value={selectedAssemblyId}
                onChange={(e) => setSelectedAssemblyId(e.target.value)}
                style={{
                  padding: '7px 10px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                }}
              >
                <option value="ALL">All Assembly Runs</option>
                {assemblies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.assemblyCode} — {a.kitName} ({a.assembledQuantity} kits)
                  </option>
                ))}
              </select>
            </div>

            {printMode === 'KIT_LABELS' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '0.80rem', fontWeight: 700, color: '#475569' }}>Kit Type:</label>
                <select
                  value={selectedKitFilter}
                  onChange={(e) => setSelectedKitFilter(e.target.value)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                  }}
                >
                  <option value="ALL">All Diagnostic Kits</option>
                  <option value="KIT-HEM-CBC">KIT-HEM-CBC (Routine CBC)</option>
                  <option value="KIT-MET-CMP">KIT-MET-CMP (Metabolic CMP)</option>
                  <option value="KIT-COAG-PT">KIT-COAG-PT (Coagulation PT)</option>
                  <option value="KIT-DIA-GLU">KIT-DIA-GLU (Diabetes / Glucose)</option>
                  <option value="KIT-FULL-BODY">KIT-FULL-BODY (Full Body Check)</option>
                </select>
              </div>
            )}

            {printMode === 'TUBE_LABELS' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '0.80rem', fontWeight: 700, color: '#475569' }}>Tube Cap:</label>
                <select
                  value={selectedTubeTypeFilter}
                  onChange={(e) => setSelectedTubeTypeFilter(e.target.value)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                  }}
                >
                  <option value="ALL">All Vacutainer Types</option>
                  <option value="EDTA_LAVENDER">💜 EDTA Lavender</option>
                  <option value="SERUM_RED_GOLD">💛 SST Gel Gold</option>
                  <option value="SODIUM_FLUORIDE_GREY">⚪ Fluoride Grey</option>
                  <option value="SODIUM_CITRATE_BLUE">💙 Citrate Blue</option>
                  <option value="HEPARIN_GREEN">💚 Heparin Green</option>
                </select>
              </div>
            )}
          </div>

          <div style={{ fontSize: '0.82rem', color: '#64748B' }}>
            {printMode === 'KIT_LABELS' && `Showing ${filteredKits.length} kits (${selectedKitIds.size} selected)`}
            {printMode === 'TUBE_LABELS' && `Showing ${filteredTubes.length} tubes (${selectedTubeIds.size} selected)`}
          </div>
        </div>
      )}

      {/* VIEW 1: PHYSICAL KIT LABELS */}
      {printMode === 'KIT_LABELS' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {filteredKits.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
              No kit serials found. Assemble new kits in the "1 Collection = 1 Kit Definitions" tab first.
            </div>
          ) : (
            filteredKits.map((k) => {
              const isSelected = selectedKitIds.has(k.kitSerial);
              const bData = generateCode128Bars(k.kitSerial);

              return (
                <div
                  key={k.id}
                  onClick={() => toggleKitSelection(k.kitSerial)}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: `2px solid ${isSelected ? '#0D9488' : '#E2E8F0'}`,
                    padding: '16px',
                    cursor: 'pointer',
                    position: 'relative',
                    boxShadow: isSelected ? '0 4px 12px rgba(13, 148, 136, 0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ background: '#0D9488', color: '#FFFFFF', fontSize: '0.65rem', fontWeight: 800, padding: '2px 5px', borderRadius: '4px' }}>
                        KIT
                      </span>
                      <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A' }}>
                        {k.kitCode}
                      </span>
                    </div>

                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleKitSelection(k.kitSerial)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ cursor: 'pointer' }}
                    />
                  </div>

                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B', marginBottom: '4px' }}>
                    {k.kitName}
                  </div>

                  <div style={{ fontSize: '0.74rem', color: '#64748B', marginBottom: '12px' }}>
                    Batch: {k.assemblyBatch} • Exp: {k.expiryDate}
                  </div>

                  {/* SVG Code 128 Barcode Preview */}
                  <div style={{ background: '#F8FAFC', padding: '8px', borderRadius: '8px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                    <svg viewBox={`0 0 ${bData.totalWidth} 40`} style={{ width: '100%', height: '36px', display: 'block' }}>
                      {bData.bars.map((b, bIdx) => (
                        <rect key={bIdx} x={b.x} y={0} width={b.width} height={40} fill="#000000" />
                      ))}
                    </svg>
                    <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.84rem', color: '#0F172A', marginTop: '4px' }}>
                      {k.kitSerial}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '0.74rem', color: '#64748B' }}>
                    <span>Status: <strong style={{ color: '#0D9488' }}>{k.currentStatus}</strong></span>
                    <span>BOM v{k.bomVersion}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW 2: SPECIMEN VACUTAINER LABELS */}
      {printMode === 'TUBE_LABELS' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          {filteredTubes.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
              No tube serials found. Assemble new kits to generate serialized tubes.
            </div>
          ) : (
            filteredTubes.map((t) => {
              const isSelected = selectedTubeIds.has(t.tubeSerial);
              const bData = generateCode128Bars(t.tubeSerial);
              const meta = CAP_COLORS[t.tubeType] || { label: t.tubeType, color: '#475569' };

              return (
                <div
                  key={t.id}
                  onClick={() => toggleTubeSelection(t.tubeSerial)}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: `2px solid ${isSelected ? '#0D9488' : '#E2E8F0'}`,
                    padding: '14px',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 4px 12px rgba(13, 148, 136, 0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: meta.color,
                          display: 'inline-block',
                          border: '1px solid rgba(0,0,0,0.2)',
                        }}
                      />
                      <span style={{ fontSize: '0.80rem', fontWeight: 800, color: '#0F172A' }}>
                        {meta.label}
                      </span>
                    </div>

                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTubeSelection(t.tubeSerial)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ cursor: 'pointer' }}
                    />
                  </div>

                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginBottom: '8px' }}>
                    Lot: {t.supplierBatch} • Exp: {t.expiryDate}
                  </div>

                  {/* SVG Code 128 Barcode */}
                  <div style={{ background: '#F8FAFC', padding: '6px', borderRadius: '6px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                    <svg viewBox={`0 0 ${bData.totalWidth} 40`} style={{ width: '100%', height: '32px', display: 'block' }}>
                      {bData.bars.map((b, bIdx) => (
                        <rect key={bIdx} x={b.x} y={0} width={b.width} height={40} fill="#000000" />
                      ))}
                    </svg>
                    <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.80rem', color: '#0F172A', marginTop: '2px' }}>
                      {t.tubeSerial}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '0.70rem', color: '#64748B' }}>
                    <span>Parent: <strong style={{ color: '#0D9488' }}>{t.parentKitId || 'SPARE'}</strong></span>
                    <span>{t.currentStatus}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW 3: ASSEMBLY RUN COMPLETE BATCH PRINT */}
      {printMode === 'ASSEMBLY_BATCH' && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
            Assembly Run Batch Production Print
          </h3>
          <p style={{ margin: '0 0 20px 0', fontSize: '0.86rem', color: '#64748B' }}>
            Select an assembly run below to consecutively print all Kit Pouch stickers followed by their respective specimen vacutainer tube stickers.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {assemblies.map((asm) => {
              const isSelected = selectedAssemblyId === asm.id;

              return (
                <div
                  key={asm.id}
                  onClick={() => setSelectedAssemblyId(asm.id)}
                  style={{
                    background: isSelected ? '#F0FDFA' : '#FFFFFF',
                    borderRadius: '12px',
                    border: `2px solid ${isSelected ? '#0D9488' : '#E2E8F0'}`,
                    padding: '16px',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 4px 12px rgba(13, 148, 136, 0.12)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                      {asm.assemblyCode}
                    </span>
                    <span style={{ fontSize: '0.74rem', background: '#DCFCE7', color: '#166534', padding: '3px 8px', borderRadius: '12px', fontWeight: 700 }}>
                      COMPLETED
                    </span>
                  </div>

                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0D9488', marginBottom: '4px' }}>
                    {asm.kitName}
                  </div>

                  <div style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '12px' }}>
                    Assembled on {new Date(asm.assembledAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} by {asm.assembledByEmail}
                  </div>

                  <div style={{ background: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                    <div>
                      <span style={{ color: '#64748B' }}>Physical Kits:</span>{' '}
                      <strong>{asm.assembledQuantity}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Serialized Tubes:</span>{' '}
                      <strong>{asm.totalTubesSerialized}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAssemblyId(asm.id);
                      handlePrintLabelsWindow('BATCH');
                    }}
                    style={{ width: '100%', marginTop: '12px', padding: '8px', fontSize: '0.82rem', fontWeight: 700 }}
                  >
                    🖨️ Print Run ({asm.assembledQuantity} Kits + {asm.totalTubesSerialized} Tubes)
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 4: 3-LEVEL BARCODE INSPECTOR & RESOLVER */}
      {printMode === 'LIVE_INSPECTOR' && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
            Universal 3-Level Barcode Inspector &amp; Resolver
          </h3>
          <p style={{ margin: '0 0 20px 0', fontSize: '0.86rem', color: '#64748B' }}>
            Scan or type any barcode to inspect its identity across Level 1 (Supplier Box), Level 2 (Pre-Assembled Kit), and Level 3 (Individual Vacutainer).
          </p>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
            <input
              type="text"
              placeholder="e.g. BD-EDTA-3ML-BOX100, LS-KIT-20261115-2426, or LS-TUBE-20261115-022426"
              value={inspectorInput}
              onChange={(e) => setInspectorInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleInspectBarcode(inspectorInput);
              }}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1.5px solid #CBD5E1',
                fontSize: '0.95rem',
                fontFamily: 'monospace',
                fontWeight: 600,
              }}
            />
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleInspectBarcode(inspectorInput)}
              disabled={isInspecting || !inspectorInput.trim()}
              style={{ padding: '12px 24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {isInspecting ? 'Resolving...' : '🔍 Resolve Barcode'}
            </button>
          </div>

          {/* Quick Test Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B' }}>Quick Test Barcodes:</span>
            <button
              type="button"
              onClick={() => {
                setInspectorInput('BD-EDTA-3ML-BOX100');
                handleInspectBarcode('BD-EDTA-3ML-BOX100');
              }}
              style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#F1F5F9', fontSize: '0.76rem', cursor: 'pointer' }}
            >
              📦 Level 1: BD-EDTA-3ML-BOX100
            </button>
            {kitSerials.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setInspectorInput(kitSerials[0].kitSerial);
                  handleInspectBarcode(kitSerials[0].kitSerial);
                }}
                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#F0FDFA', color: '#0D9488', fontSize: '0.76rem', cursor: 'pointer', fontWeight: 600 }}
              >
                📦 Level 2 Kit: {kitSerials[0].kitSerial}
              </button>
            )}
            {tubeSerials.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setInspectorInput(tubeSerials[0].tubeSerial);
                  handleInspectBarcode(tubeSerials[0].tubeSerial);
                }}
                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FAF5FF', color: '#7E22CE', fontSize: '0.76rem', cursor: 'pointer', fontWeight: 600 }}
              >
                🧪 Level 3 Tube: {tubeSerials[0].tubeSerial}
              </button>
            )}
          </div>

          {/* Inspector Result Card */}
          {inspectorResult && (
            <div
              style={{
                background: '#F8FAFC',
                borderRadius: '12px',
                border: '1.5px solid #CBD5E1',
                padding: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      backgroundColor:
                        inspectorResult.level === 'LEVEL_1_SUPPLIER'
                          ? '#FEF3C7'
                          : inspectorResult.level === 'LEVEL_2_KIT'
                          ? '#DCFCE7'
                          : inspectorResult.level === 'LEVEL_3_TUBE'
                          ? '#EDE9FE'
                          : '#FEE2E2',
                      color:
                        inspectorResult.level === 'LEVEL_1_SUPPLIER'
                          ? '#92400E'
                          : inspectorResult.level === 'LEVEL_2_KIT'
                          ? '#166534'
                          : inspectorResult.level === 'LEVEL_3_TUBE'
                          ? '#6B21A8'
                          : '#991B1B',
                    }}
                  >
                    {inspectorResult.level}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem', color: '#0F172A' }}>
                    {inspectorResult.barcode}
                  </span>
                </div>

                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: inspectorResult.identified ? '#16A34A' : '#DC2626' }}>
                  {inspectorResult.identified ? '✓ Recognized & Validated' : '✕ Unrecognized Barcode'}
                </span>
              </div>

              <p style={{ margin: '0 0 16px 0', fontSize: '0.88rem', color: '#334155', fontWeight: 500 }}>
                {inspectorResult.message}
              </p>

              {/* LEVEL 1: Supplier Product Details */}
              {inspectorResult.supplierProduct && (
                <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.84rem', lineHeight: 1.6 }}>
                  <div><strong>Mapped Item:</strong> {inspectorResult.supplierProduct.item?.name} ({inspectorResult.supplierProduct.item?.sku})</div>
                  <div><strong>Package Type:</strong> {inspectorResult.supplierProduct.packageUnit}</div>
                  <div><strong>Conversion Multiplier:</strong> 1 {inspectorResult.supplierProduct.packageUnit} = {inspectorResult.supplierProduct.multiplierToBaseUnit} {inspectorResult.supplierProduct.baseUnit}s</div>
                  <div><strong>Supplier:</strong> {inspectorResult.supplierProduct.mapping?.supplierName}</div>
                </div>
              )}

              {/* LEVEL 2: Kit Details & Contained Tubes */}
              {inspectorResult.kitRecord && (
                <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.84rem', lineHeight: 1.6 }}>
                  <div><strong>Kit Name:</strong> {inspectorResult.kitRecord.kitName} ({inspectorResult.kitRecord.kitCode})</div>
                  <div><strong>Assembly Batch:</strong> {inspectorResult.kitRecord.assemblyBatch}</div>
                  <div><strong>Kit Expiry Date:</strong> {inspectorResult.kitRecord.expiryDate}</div>
                  <div><strong>Current Status:</strong> <span style={{ color: '#0D9488', fontWeight: 700 }}>{inspectorResult.kitRecord.currentStatus}</span></div>

                  {inspectorResult.kitChildTubes && inspectorResult.kitChildTubes.length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <strong>Contained Specimen Tubes ({inspectorResult.kitChildTubes.length}):</strong>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                        {inspectorResult.kitChildTubes.map((ct) => (
                          <div key={ct.id} style={{ display: 'flex', justifyContent: 'space-between', background: '#F8FAFC', padding: '6px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                            <span>🧪 {ct.tubeType} ({ct.tubeSerial})</span>
                            <span>Lot: {ct.supplierBatch} • Exp: {ct.expiryDate}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* LEVEL 3: Specimen Tube Details */}
              {inspectorResult.tubeRecord && (
                <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.84rem', lineHeight: 1.6 }}>
                  <div><strong>Vacutainer Type:</strong> {inspectorResult.tubeRecord.tubeType} ({inspectorResult.tubeRecord.sku})</div>
                  <div><strong>Brand:</strong> {inspectorResult.tubeRecord.brand}</div>
                  <div><strong>Supplier Lot Number:</strong> {inspectorResult.tubeRecord.supplierBatch}</div>
                  <div><strong>Tube Expiry:</strong> {inspectorResult.tubeRecord.expiryDate}</div>
                  <div><strong>Current Status:</strong> <span style={{ color: '#7E22CE', fontWeight: 700 }}>{inspectorResult.tubeRecord.currentStatus}</span></div>
                  <div><strong>Parent Kit:</strong> {inspectorResult.tubeRecord.parentKitId || 'SPARE TUBE'}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
