import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAnyPermission, requirePermissions } from '../middleware/rbac';
import { optionalAuth } from '../middleware/auth';
import {
  createInventoryItem,
  createInventorySupplier,
  createSupplierBarcodeMapping,
  getCentralWarehouses,
  getInventoryItems,
  getInventorySuppliers,
  getSupplierBarcodeMappings,
  resolveSupplierBarcode,
  updateInventoryItem,
} from '../services/inventory-master.service';
import {
  getStockBatches,
  getStockInwardHistory,
  getStockTransactions,
  getWarehouseStockBalances,
  processStockInward,
} from '../services/stock-inward.service';
import {
  createKitDefinition,
  getKitActiveBOM,
  getKitDefinitionById,
  getKitDefinitions,
} from '../services/kit-master.service';
import {
  executeKitAssembly,
  getKitAssembliesHistory,
  validateKitAssemblyFeasibility,
} from '../services/kit-assembly.service';
import {
  getKitSerials,
  getKitSerialWithTubes,
  getTubeSerials,
  resolveBarcodeIdentity,
} from '../services/serialization.service';
import {
  confirmKitIssueReceipt,
  getKitIssuesHistory,
  getPhleboKitsInventory,
  initiatePhleboPeerTransfer,
  issueKitsToPhlebotomist,
  respondToPhleboPeerTransfer,
} from '../services/kit-issue-transfer.service';
import {
  handoverKitToLab,
  openKitForBooking,
  verifyBookingTubeScan,
} from '../services/kit-consumption-handover.service';
import {
  createStockAdjustment,
  getStockAdjustments,
} from '../services/stock-adjustments.service';
import {
  closeScannerBridgeSession,
  createScannerBridgeSession,
  getRecentScannerEvents,
  getScannerBridgeEvents,
  mapUnknownScannerEvent,
  pairMobileDevice,
  pushScannedBarcode,
  updateScannerBridgeMode,
} from '../services/scanner-bridge.service';
import {
  getInventoryDashboardSummary,
  getStockTransactionsLedger,
} from '../services/inventory-dashboard.service';
import { initializeFirebase } from '../config/firebase';
import { DEV_DATA_STORE } from '../services/devStore';

export const inventoryRouter = Router();

// Apply authentication to all inventory endpoints
inventoryRouter.use(optionalAuth);

// ---------------------------------------------------------------------------
// 1. Items Master Catalog
// ---------------------------------------------------------------------------

inventoryRouter.get('/items', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const items = await getInventoryItems({ category, search, isActive: true });
    return res.json({ success: true, count: items.length, items });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching inventory items' });
  }
});

inventoryRouter.post(
  '/items',
  requireAnyPermission('MANAGE_INVENTORY_MASTER', 'MANAGE_CENTRAL_WAREHOUSE'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const actorUid = req.user?.uid || 'admin-root';
      const created = await createInventoryItem(req.body, actorUid);
      return res.status(201).json({ success: true, item: created });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message || 'Failed creating inventory item' });
    }
  }
);

inventoryRouter.put(
  '/items/:id',
  requireAnyPermission('MANAGE_INVENTORY_MASTER', 'MANAGE_CENTRAL_WAREHOUSE'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const actorUid = req.user?.uid || 'admin-root';
      const updated = await updateInventoryItem(req.params.id, req.body, actorUid);
      return res.json({ success: true, item: updated });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message || 'Failed updating inventory item' });
    }
  }
);

// ---------------------------------------------------------------------------
// 2. Suppliers Directory
// ---------------------------------------------------------------------------

inventoryRouter.get('/suppliers', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const suppliers = await getInventorySuppliers();
    return res.json({ success: true, count: suppliers.length, suppliers });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching suppliers' });
  }
});

inventoryRouter.post(
  '/suppliers',
  requireAnyPermission('MANAGE_INVENTORY_MASTER', 'MANAGE_STOCK_INWARD'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const actorUid = req.user?.uid || 'admin-root';
      const supplier = await createInventorySupplier(req.body, actorUid);
      return res.status(201).json({ success: true, supplier });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message || 'Failed creating supplier' });
    }
  }
);

// ---------------------------------------------------------------------------
// 3. Supplier Barcode Mappings & Resolver
// ---------------------------------------------------------------------------

inventoryRouter.get('/mappings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const itemId = typeof req.query.itemId === 'string' ? req.query.itemId : undefined;
    const mappings = await getSupplierBarcodeMappings(itemId);
    return res.json({ success: true, count: mappings.length, mappings });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching barcode mappings' });
  }
});

inventoryRouter.post(
  '/mappings',
  requireAnyPermission('MANAGE_INVENTORY_MASTER', 'MANAGE_STOCK_INWARD'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const actorUid = req.user?.uid || 'admin-root';
      const mapping = await createSupplierBarcodeMapping(req.body, actorUid);
      return res.status(201).json({ success: true, mapping });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message || 'Failed creating barcode mapping' });
    }
  }
);

/**
 * Resolves a scanned or typed barcode
 * GET /api/v1/inventory/resolve-barcode/:barcode
 */
inventoryRouter.get('/resolve-barcode/:barcode', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { barcode } = req.params;
    if (!barcode) {
      return res.status(400).json({ success: false, error: 'Barcode parameter is required.' });
    }
    const resolution = await resolveSupplierBarcode(barcode);
    return res.json({ success: true, ...resolution });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Barcode resolution failed.' });
  }
});

// ---------------------------------------------------------------------------
// 4. Stock Inwarding & Conversion
// ---------------------------------------------------------------------------

inventoryRouter.post(
  '/inward',
  requireAnyPermission('MANAGE_STOCK_INWARD', 'MANAGE_CENTRAL_WAREHOUSE'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const actor = {
        uid: req.user?.uid || 'admin-root',
        email: req.user?.email || 'admin@labsetu.com',
      };
      const result = await processStockInward(req.body, actor);
      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message || 'Stock inward failed.' });
    }
  }
);

inventoryRouter.get('/inward-history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const history = await getStockInwardHistory(limit);
    return res.json({ success: true, count: history.length, history });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching inward history.' });
  }
});

// ---------------------------------------------------------------------------
// 5. Batches, Ledger & Warehouses
// ---------------------------------------------------------------------------

inventoryRouter.get('/batches', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const itemId = typeof req.query.itemId === 'string' ? req.query.itemId : undefined;
    const batches = await getStockBatches(itemId);
    return res.json({ success: true, count: batches.length, batches });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching stock batches.' });
  }
});

inventoryRouter.get('/transactions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const transactions = await getStockTransactions(limit);
    return res.json({ success: true, count: transactions.length, transactions });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching stock transactions.' });
  }
});

inventoryRouter.get('/warehouses', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const warehouses = await getCentralWarehouses();
    return res.json({ success: true, warehouses });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching warehouses.' });
  }
});

inventoryRouter.get('/warehouse-balances', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const warehouseId = typeof req.query.warehouseId === 'string' ? req.query.warehouseId : 'WH-CENTRAL-MAIN';
    const balances = await getWarehouseStockBalances(warehouseId);
    return res.json({ success: true, count: balances.length, balances });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching warehouse balances.' });
  }
});

// ---------------------------------------------------------------------------
// 6. Kit Master & Pre-Assembly Production Engine
// ---------------------------------------------------------------------------

inventoryRouter.get('/kits', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const kits = await getKitDefinitions();
    return res.json({ success: true, count: kits.length, kits });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching kit definitions' });
  }
});

inventoryRouter.get('/kits/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const kit = await getKitDefinitionById(req.params.id);
    if (!kit) return res.status(404).json({ success: false, error: 'Kit definition not found' });
    const bom = await getKitActiveBOM(req.params.id);
    return res.json({ success: true, kit, bom });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching kit definition' });
  }
});

inventoryRouter.post(
  '/kits',
  requireAnyPermission('MANAGE_INVENTORY_MASTER', 'MANAGE_CENTRAL_WAREHOUSE'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const actor = {
        uid: req.user?.uid || 'admin-root',
        email: req.user?.email || 'admin@labsetu.com',
      };
      const result = await createKitDefinition(req.body, actor);
      return res.status(201).json({ success: true, ...result });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message || 'Failed creating kit definition' });
    }
  }
);

inventoryRouter.get('/kits/:id/bom', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bom = await getKitActiveBOM(req.params.id);
    if (!bom) return res.status(404).json({ success: false, error: 'BOM recipe not found' });
    return res.json({ success: true, bom });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching kit BOM' });
  }
});

inventoryRouter.post('/kits/validate-assembly', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { kitDefinitionId, quantityToAssemble, warehouseId } = req.body;
    if (!kitDefinitionId || !quantityToAssemble) {
      return res.status(400).json({ success: false, error: 'kitDefinitionId and quantityToAssemble are required.' });
    }
    const result = await validateKitAssemblyFeasibility(
      kitDefinitionId,
      Number(quantityToAssemble),
      warehouseId || 'WH-CENTRAL-MAIN'
    );
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Feasibility validation failed.' });
  }
});

inventoryRouter.post(
  '/kits/assemble',
  requireAnyPermission('ASSEMBLE_DIAGNOSTIC_KITS', 'MANAGE_CENTRAL_WAREHOUSE'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const actor = {
        uid: req.user?.uid || 'admin-root',
        email: req.user?.email || 'admin@labsetu.com',
      };
      const result = await executeKitAssembly(req.body, actor);
      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message || 'Kit assembly production run failed.' });
    }
  }
);

inventoryRouter.get('/kit-assemblies', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const assemblies = await getKitAssembliesHistory(limit);
    return res.json({ success: true, count: assemblies.length, assemblies });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching kit assemblies history.' });
  }
});

// ---------------------------------------------------------------------------
// 6. Serialization & 3-Level Barcode Engine
// ---------------------------------------------------------------------------

inventoryRouter.get('/serials/kits', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;
    const kitCode = typeof req.query.kitCode === 'string' ? req.query.kitCode : undefined;
    const assignedPhleboId = typeof req.query.assignedPhleboId === 'string' ? req.query.assignedPhleboId : undefined;
    const limit = Number(req.query.limit) || 100;
    const kits = await getKitSerials({ status, kitCode, assignedPhleboId, limit });
    return res.json({ success: true, count: kits.length, kits });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching kit serials' });
  }
});

inventoryRouter.get('/serials/kits/:serial', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await getKitSerialWithTubes(req.params.serial);
    if (!data.kit) return res.status(404).json({ success: false, error: 'Kit serial not found' });
    return res.json({ success: true, ...data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching kit serial details' });
  }
});

inventoryRouter.get('/serials/tubes', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parentKitId = typeof req.query.parentKitId === 'string' ? req.query.parentKitId : undefined;
    const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;
    const tubeType = typeof req.query.tubeType === 'string' ? (req.query.tubeType as any) : undefined;
    const limit = Number(req.query.limit) || 100;
    const tubes = await getTubeSerials({ parentKitId, status, tubeType, limit });
    return res.json({ success: true, count: tubes.length, tubes });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching tube serials' });
  }
});

inventoryRouter.get('/serials/resolve/:barcode', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await resolveBarcodeIdentity(req.params.barcode);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Barcode resolution failed' });
  }
});

// ---------------------------------------------------------------------------
// 7. Kit Issuance, Courier Custody & Peer Transfers (Milestone 5 & 6)
// ---------------------------------------------------------------------------

inventoryRouter.post(
  '/issues/dispatch',
  requireAnyPermission('ISSUE_KITS_TO_PHLEBO', 'MANAGE_CENTRAL_WAREHOUSE'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const actor = {
        uid: req.user?.uid || 'admin-root',
        email: req.user?.email || 'admin@labsetu.com',
      };
      const result = await issueKitsToPhlebotomist(req.body, actor);
      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message || 'Kit issuance failed' });
    }
  }
);

inventoryRouter.post('/issues/confirm-receipt', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { kitSerials, phlebotomistId } = req.body;
    const pId = phlebotomistId || req.user?.uid;
    if (!pId) return res.status(400).json({ success: false, error: 'Phlebotomist ID is required.' });
    const result = await confirmKitIssueReceipt(kitSerials || [], pId);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed confirming receipt' });
  }
});

inventoryRouter.get('/issues/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const history = await getKitIssuesHistory(limit);
    return res.json({ success: true, count: history.length, history });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching issues history' });
  }
});

inventoryRouter.get('/phlebo-stock/:phleboId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await getPhleboKitsInventory(req.params.phleboId);
    return res.json({ success: true, ...data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching phlebo kit stock' });
  }
});

inventoryRouter.post('/transfers/initiate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const senderId = req.body.senderPhleboId || req.user?.uid;
    const result = await initiatePhleboPeerTransfer({
      ...req.body,
      senderPhleboId: senderId,
    });
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Transfer initiation failed' });
  }
});

inventoryRouter.post('/transfers/respond', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const receiverId = req.body.receiverPhleboId || req.user?.uid;
    const result = await respondToPhleboPeerTransfer({
      ...req.body,
      receiverPhleboId: receiverId,
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Transfer response failed' });
  }
});

// ---------------------------------------------------------------------------
// 8. Kit Consumption, Tube Validation & Handover (Milestones 7, 8 & 9)
// ---------------------------------------------------------------------------

inventoryRouter.post('/kits/open-booking', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { kitSerialId, orderId, orderNumber } = req.body;
    const phleboId = req.body.phleboId || req.user?.uid;
    const phleboName = req.body.phleboName || req.user?.displayName || req.user?.email || 'Phlebotomist';
    if (!kitSerialId || !orderId || !phleboId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: kitSerialId, orderId, and phleboId are mandatory.',
      });
    }

    const result = await openKitForBooking({
      kitSerialId,
      orderId,
      orderNumber,
      phleboId,
      phleboName,
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed opening kit for booking' });
  }
});

inventoryRouter.post('/tubes/verify-scan', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tubeBarcode, orderId, expectedTestCode, selectedTubeType, kitSerialId } = req.body;
    if (!tubeBarcode || !orderId || !expectedTestCode) {
      return res.status(400).json({
        success: false,
        error: 'tubeBarcode, orderId, and expectedTestCode are required for scan verification.',
      });
    }

    const result = await verifyBookingTubeScan({
      tubeBarcode,
      orderId,
      expectedTestCode,
      selectedTubeType,
      kitSerialId,
    });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Tube scan verification failed' });
  }
});

inventoryRouter.post('/kits/handover-lab', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { kitSerialId, orderId, targetLabId, receivingTechnicianName, handoverOtp, temperatureCelsius } = req.body;
    if (!kitSerialId || !orderId || !targetLabId || !receivingTechnicianName || temperatureCelsius === undefined) {
      return res.status(400).json({
        success: false,
        error: 'kitSerialId, orderId, targetLabId, receivingTechnicianName, and temperatureCelsius are required.',
      });
    }

    const result = await handoverKitToLab({
      kitSerialId,
      orderId,
      targetLabId,
      receivingTechnicianName,
      handoverOtp,
      temperatureCelsius: Number(temperatureCelsius),
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Lab handover failed' });
  }
});

// ---------------------------------------------------------------------------
// 9. Stock Adjustments & Damage Write-Offs (Milestone 10)
// ---------------------------------------------------------------------------

inventoryRouter.post(
  '/adjustments',
  requireAnyPermission('MANAGE_CENTRAL_WAREHOUSE', 'MANAGE_INVENTORY_MASTER'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const performedByEmail = req.user?.email || 'admin@labsetu.com';
      const result = await createStockAdjustment({
        ...req.body,
        performedByEmail,
      });
      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message || 'Stock adjustment failed' });
    }
  }
);

inventoryRouter.get(
  '/adjustments',
  requireAnyPermission('MANAGE_STOCK_ADJUSTMENTS', 'MANAGE_CENTRAL_WAREHOUSE'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const itemId = typeof req.query.itemId === 'string' ? req.query.itemId : undefined;
      const limit = Number(req.query.limit) || 50;
      const adjustments = await getStockAdjustments({ itemId, limit });
      return res.json({ success: true, count: adjustments.length, adjustments });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'Failed fetching adjustments' });
    }
  }
);

// ---------------------------------------------------------------------------
// 10. Real-Time Mobile-to-Desktop Scanner Bridge (Milestone 11)
// ---------------------------------------------------------------------------

inventoryRouter.post('/scanner-bridge/session', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const operatorEmail = req.user?.email || 'operator@labsetu.com';
    const mode = req.body?.mode === 'MULTI_SCAN' ? 'MULTI_SCAN' : 'ONE_SCAN';
    const context = req.body?.context ? String(req.body.context) : undefined;
    const warehouseId = req.body?.warehouseId ? String(req.body.warehouseId) : undefined;
    const session = createScannerBridgeSession({ operatorEmail, mode, context, warehouseId });
    return res.status(201).json({ success: true, session });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed creating scanner session' });
  }
});

inventoryRouter.post('/scanner-bridge/:sessionId/pair', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { pairingToken, deviceId, deviceName } = req.body;
    if (!pairingToken || !deviceId) {
      return res.status(400).json({ success: false, error: 'pairingToken and deviceId are required.' });
    }
    const session = pairMobileDevice({
      sessionId: req.params.sessionId,
      pairingToken,
      deviceId,
      deviceName,
    });
    return res.json({ success: true, session });
  } catch (err: any) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message || 'Pairing failed', code: err.code });
  }
});

inventoryRouter.post('/scanner-bridge/:sessionId/scan', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { pairingToken, eventId, barcode, symbology, deviceId, metadata } = req.body;
    if (!barcode) {
      return res.status(400).json({ success: false, error: 'barcode string is required.' });
    }
    const result = await pushScannedBarcode({
      sessionId: req.params.sessionId,
      pairingToken,
      eventId,
      barcode,
      symbology,
      deviceId,
      metadata,
    });
    return res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err: any) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message || 'Push scanned barcode failed', code: err.code });
  }
});

inventoryRouter.get('/scanner-bridge/:sessionId/events', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sinceIndex = req.query.since ? Number(req.query.since) : undefined;
    const result = getScannerBridgeEvents({ sessionId: req.params.sessionId, sinceIndex });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message || 'Failed fetching scanner events', code: err.code });
  }
});

inventoryRouter.patch('/scanner-bridge/:sessionId/mode', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mode = req.body?.mode === 'MULTI_SCAN' ? 'MULTI_SCAN' : 'ONE_SCAN';
    const session = updateScannerBridgeMode(req.params.sessionId, mode);
    return res.json({ success: true, sessionId: session.sessionId, mode: session.mode });
  } catch (err: any) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message || 'Failed updating mode' });
  }
});

inventoryRouter.post('/scanner-bridge/:sessionId/close', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const session = closeScannerBridgeSession(req.params.sessionId);
    return res.json({ success: true, sessionId: session.sessionId, status: session.status });
  } catch (err: any) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message || 'Failed closing session' });
  }
});

inventoryRouter.get('/scanner-bridge/events/recent', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    return res.json({ success: true, events: getRecentScannerEvents() });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching recent events' });
  }
});

inventoryRouter.post('/scanner-bridge/events/:eventId/map', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { itemId, itemName, sku } = req.body;
    if (!itemId) return res.status(400).json({ success: false, error: 'itemId is required.' });
    const ev = mapUnknownScannerEvent({ eventId: req.params.eventId, itemId, itemName: itemName || itemId, sku });
    return res.json({ success: true, event: ev });
  } catch (err: any) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message || 'Failed mapping event' });
  }
});

// ---------------------------------------------------------------------------
// 11. Inventory Dashboard & Stock Valuation (Milestone 12)
// ---------------------------------------------------------------------------

inventoryRouter.get(
  '/dashboard-summary',
  requireAnyPermission('VIEW_INVENTORY_DASHBOARD', 'VIEW_INVENTORY_VALUATION', 'MANAGE_CENTRAL_WAREHOUSE'),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const summary = await getInventoryDashboardSummary();
      return res.json({ success: true, ...summary });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'Failed generating dashboard summary' });
    }
  }
);

inventoryRouter.get(
  '/stock-ledger',
  requireAnyPermission('VIEW_TRACEABILITY_AUDIT', 'VIEW_INVENTORY_DASHBOARD', 'MANAGE_CENTRAL_WAREHOUSE'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const limit = Number(req.query.limit) || 100;
      const itemId = typeof req.query.itemId === 'string' ? req.query.itemId : undefined;
      const batchNumber = typeof req.query.batchNumber === 'string' ? req.query.batchNumber : undefined;
      const transactionType = typeof req.query.transactionType === 'string' ? (req.query.transactionType as any) : undefined;
      const ledger = await getStockTransactionsLedger({ limitCount: limit, itemId, batchNumber, transactionType });
      return res.json({ success: true, count: ledger.length, ledger });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'Failed fetching stock ledger' });
    }
  }
);

// ---------------------------------------------------------------------------
// 12. Dynamic Enterprise Feature Activation Settings
// ---------------------------------------------------------------------------

inventoryRouter.get('/settings', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const { db, isMockMode } = initializeFirebase();
    if (!isMockMode && db) {
      const snap = await db.collection('settings').doc('inventory').get();
      if (snap.exists) {
        return res.json({ success: true, settings: snap.data() });
      }
    }
    const mem = (DEV_DATA_STORE.platformSettings?.inventorySettings as any) || {
      enterpriseKitInventoryActive: false,
      enforceKitScanOnCollection: false,
    };
    return res.json({ success: true, settings: mem });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching inventory settings' });
  }
});

inventoryRouter.post(
  '/settings',
  requireAnyPermission('MANAGE_CENTRAL_WAREHOUSE', 'MANAGE_SETTINGS', 'FULL_PLATFORM_CONTROL'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { db, isMockMode } = initializeFirebase();
      const now = new Date().toISOString();
      const patch = {
        ...req.body,
        updatedAt: now,
        activatedByEmail: req.user?.email || 'admin@labsetu.com',
      };
      if (!isMockMode && db) {
        await db.collection('settings').doc('inventory').set(patch, { merge: true });
      }
      if (!DEV_DATA_STORE.platformSettings) {
        DEV_DATA_STORE.platformSettings = {};
      }
      DEV_DATA_STORE.platformSettings.inventorySettings = {
        ...((DEV_DATA_STORE.platformSettings.inventorySettings as any) || {}),
        ...patch,
      };
      return res.json({ success: true, settings: patch });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message || 'Failed updating inventory settings' });
    }
  }
);



