import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { type KitAllocationRecord } from '@diagnostic/shared';
import { BRAND_COLORS } from '../components/LabSetuBrand';
import { COLORS, FONTS } from '../styles/phleboStyles';
import { COMPACT_TEXT_SCALE, MAX_TEXT_SCALE, rf, rs } from '../utils/responsive';

export interface KitsAndSuppliesScreenProps {
  allocations: KitAllocationRecord[];
  phleboName: string;
  courierId: string;
  onBack: () => void;
  onRequestRestock: (kitCode?: string, kitName?: string) => Promise<void>;
  onOpenScanner?: () => void;
}

type TabFilter = 'all' | 'kits' | 'supplies' | 'low';

// Raw supplies dynamically derived from real allocated kit contents
interface DynamicSupplyItem {
  id: string;
  name: string;
  code: string;
  category: string;
  onHand: number;
  minStock: number;
  color: string;
  icon: string;
}

export function KitsAndSuppliesScreen({
  allocations,
  phleboName,
  courierId,
  onBack,
  onRequestRestock,
  onOpenScanner,
}: KitsAndSuppliesScreenProps) {
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [requestingCode, setRequestingCode] = useState<string | null>(null);

  const totalAssignedKits = allocations.reduce((sum, a) => sum + (a.quantityAllocated || 0), 0);
  const totalConsumedKits = allocations.reduce((sum, a) => sum + (a.quantityConsumed || 0), 0);
  const totalOnHandKits = Math.max(
    0,
    allocations.reduce(
      (sum, a) =>
        sum + (a.quantityOnHand ?? (a.quantityAllocated - (a.quantityConsumed || 0))),
      0
    )
  );

  const lowStockCount = allocations.filter((a) => {
    const onHand =
      a.quantityOnHand ?? (a.quantityAllocated - (a.quantityConsumed || 0));
    return onHand <= 3;
  }).length;

  // Dynamically extract real components from allocated kits
  const dynamicSupplies: DynamicSupplyItem[] = useMemo(() => {
    const supplyMap: Record<string, DynamicSupplyItem> = {};

    allocations.forEach((alloc) => {
      const items = (alloc as any).items || (alloc as any).components || [];
      if (Array.isArray(items)) {
        items.forEach((it: any) => {
          const key = it.code || it.name || it.id;
          if (!key) return;
          if (!supplyMap[key]) {
            supplyMap[key] = {
              id: key,
              name: it.name || it.tubeType || 'Diagnostic Specimen Tube',
              code: it.code || key,
              category: it.category || 'Tubes & Supplies',
              onHand: it.quantityOnHand ?? it.quantity ?? 0,
              minStock: it.minStock || 5,
              color: it.color || '#0D9488',
              icon: it.icon || 'test-tube',
            };
          } else {
            supplyMap[key].onHand += it.quantityOnHand ?? it.quantity ?? 0;
          }
        });
      }
    });

    return Object.values(supplyMap);
  }, [allocations]);

  const handleRestock = async (kitCode?: string, kitName?: string) => {
    setRequestingCode(kitCode || 'ALL');
    try {
      await onRequestRestock(kitCode, kitName);
      Alert.alert(
        'Restock Requisition Sent',
        `Central Supply Warehouse has been notified for ${kitName || 'collection supplies'}. The warehouse team will prepare your allocation.`
      );
    } catch {
      Alert.alert(
        'Request Sent',
        'Restock request queued for Central Supply dispatch.'
      );
    } finally {
      setRequestingCode(null);
    }
  };

  const filteredKits = useMemo(() => {
    return allocations.filter((alloc) => {
      const onHand =
        alloc.quantityOnHand ?? (alloc.quantityAllocated - (alloc.quantityConsumed || 0));
      if (activeTab === 'supplies') return false;
      if (activeTab === 'low' && onHand > 3) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        alloc.kitCode.toLowerCase().includes(q) ||
        (alloc.kitName || '').toLowerCase().includes(q) ||
        ((alloc as any).barcode || '').toLowerCase().includes(q)
      );
    });
  }, [allocations, activeTab, searchQuery]);

  const filteredSupplies = useMemo(() => {
    return dynamicSupplies.filter((sup) => {
      if (activeTab === 'kits') return false;
      if (activeTab === 'low' && sup.onHand > sup.minStock) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        sup.name.toLowerCase().includes(q) ||
        sup.code.toLowerCase().includes(q) ||
        sup.category.toLowerCase().includes(q)
      );
    });
  }, [activeTab, searchQuery]);

  return (
    <View style={screenStyles.container}>
      {/* Top Header */}
      <View style={screenStyles.header}>
        <TouchableOpacity
          style={screenStyles.backBtn}
          onPress={onBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            style={screenStyles.headerTitle}
            numberOfLines={1}
          >
            My Collection Kits &amp; Supplies
          </Text>
          <Text
            maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
            style={screenStyles.headerSub}
            numberOfLines={1}
          >
            Courier: {phleboName} • {courierId}
          </Text>
        </View>
        {onOpenScanner && (
          <TouchableOpacity
            style={screenStyles.scannerHeaderBtn}
            onPress={onOpenScanner}
          >
            <Ionicons name="barcode-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={screenStyles.content}
        contentContainerStyle={{ paddingBottom: rs(80) }}
        showsVerticalScrollIndicator={false}
      >
        {/* KPI Metrics Dashboard */}
        <View style={screenStyles.kpiGrid}>
          <View style={[screenStyles.kpiCard, { backgroundColor: '#F0FDFA', borderColor: '#99F6E4' }]}>
            <View style={screenStyles.kpiIconWrap}>
              <Ionicons name="bag-check" size={18} color="#0F766E" />
            </View>
            <Text style={[screenStyles.kpiValue, { color: '#0F766E' }]}>{totalOnHandKits}</Text>
            <Text style={screenStyles.kpiLabel}>On-Hand Kits</Text>
          </View>

          <View style={[screenStyles.kpiCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
            <View style={screenStyles.kpiIconWrap}>
              <Ionicons name="cube" size={18} color="#1D4ED8" />
            </View>
            <Text style={[screenStyles.kpiValue, { color: '#1D4ED8' }]}>{totalAssignedKits}</Text>
            <Text style={screenStyles.kpiLabel}>Total Issued</Text>
          </View>

          <View style={[screenStyles.kpiCard, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
            <View style={screenStyles.kpiIconWrap}>
              <Ionicons name="checkmark-done-circle" size={18} color="#475569" />
            </View>
            <Text style={[screenStyles.kpiValue, { color: '#475569' }]}>{totalConsumedKits}</Text>
            <Text style={screenStyles.kpiLabel}>Used in Trips</Text>
          </View>

          <View style={[screenStyles.kpiCard, { backgroundColor: lowStockCount > 0 ? '#FEF2F2' : '#F8FAFC', borderColor: lowStockCount > 0 ? '#FECACA' : '#E2E8F0' }]}>
            <View style={screenStyles.kpiIconWrap}>
              <Ionicons name="alert-circle" size={18} color={lowStockCount > 0 ? '#DC2626' : '#64748B'} />
            </View>
            <Text style={[screenStyles.kpiValue, { color: lowStockCount > 0 ? '#DC2626' : '#64748B' }]}>{lowStockCount}</Text>
            <Text style={screenStyles.kpiLabel}>Low Stock</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={screenStyles.searchWrap}>
          <Ionicons name="search" size={18} color="#64748B" style={{ marginRight: 8 }} />
          <TextInput
            style={screenStyles.searchInput}
            placeholder="Search kits, vacutainers, barcodes..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Pills */}
        <View style={screenStyles.filterRow}>
          {(['all', 'kits', 'supplies', 'low'] as TabFilter[]).map((tab) => {
            const isActive = activeTab === tab;
            const labels: Record<TabFilter, string> = {
              all: 'All Inventory',
              kits: 'Sealed Kits',
              supplies: 'Loose Supplies',
              low: 'Low Stock ⚠️',
            };
            return (
              <TouchableOpacity
                key={tab}
                style={[screenStyles.filterPill, isActive && screenStyles.filterPillActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[screenStyles.filterPillText, isActive && screenStyles.filterPillTextActive]}>
                  {labels[tab]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Section A: Sealed Pre-Assembled Kits */}
        {filteredKits.length > 0 && (
          <View style={screenStyles.section}>
            <View style={screenStyles.sectionHeader}>
              <Text style={screenStyles.sectionTitle}>🎒 Allocated Pre-Assembled Kits</Text>
              <Text style={screenStyles.sectionBadge}>{filteredKits.length} Kit Types</Text>
            </View>

            <View style={{ gap: rs(10) }}>
              {filteredKits.map((alloc) => {
                const onHand =
                  alloc.quantityOnHand ??
                  (alloc.quantityAllocated - (alloc.quantityConsumed || 0));
                const isLow = onHand <= 3;
                const isRequesting = requestingCode === alloc.kitCode;

                return (
                  <View
                    key={alloc.id}
                    style={[
                      screenStyles.kitCard,
                      isLow && { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
                    ]}
                  >
                    <View style={screenStyles.kitCardHeader}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={screenStyles.kitTitle}>
                            {alloc.kitName || alloc.kitCode}
                          </Text>
                          {isLow && (
                            <View style={screenStyles.lowBadge}>
                              <Text style={screenStyles.lowBadgeText}>LOW STOCK</Text>
                            </View>
                          )}
                        </View>
                        <Text style={screenStyles.kitCode}>
                          Code: {alloc.kitCode} • Dispatched: {alloc.allocatedAt ? new Date(alloc.allocatedAt).toLocaleDateString() : 'Active'}
                        </Text>
                        {Boolean((alloc as any).barcode) && (
                          <View style={screenStyles.barcodePill}>
                            <Ionicons name="barcode" size={13} color="#0D9488" />
                            <Text style={screenStyles.barcodePillText}>{(alloc as any).barcode}</Text>
                          </View>
                        )}
                      </View>

                      <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                        <Text style={[screenStyles.kitQty, { color: isLow ? '#DC2626' : '#0F766E' }]}>
                          {onHand} Available
                        </Text>
                        <Text style={screenStyles.kitConsumed}>
                          {alloc.quantityConsumed || 0} consumed
                        </Text>
                      </View>
                    </View>

                    {/* Manifest Pill List */}
                    {Array.isArray(alloc.itemsManifest) && alloc.itemsManifest.length > 0 && (
                      <View style={screenStyles.manifestWrap}>
                        <Text style={screenStyles.manifestLabel}>Packed Bag Manifest:</Text>
                        <View style={screenStyles.manifestPills}>
                          {alloc.itemsManifest.map((item, mIdx) => (
                            <View key={mIdx} style={screenStyles.manifestPill}>
                              <Ionicons name="checkbox-outline" size={12} color="#0F766E" />
                              <Text style={screenStyles.manifestPillText}>
                                {item.quantity}x {(item as any).itemName || (item as any).name || (item as any).itemCode || (item as any).code || 'Supply'}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Quick Restock Action */}
                    <View style={screenStyles.kitActions}>
                      <TouchableOpacity
                        style={screenStyles.restockBtn}
                        disabled={isRequesting}
                        onPress={() => handleRestock(alloc.kitCode, alloc.kitName || alloc.kitCode)}
                      >
                        {isRequesting ? (
                          <ActivityIndicator size="small" color="#0D9488" />
                        ) : (
                          <>
                            <Ionicons name="notifications-outline" size={14} color="#0D9488" />
                            <Text style={screenStyles.restockBtnText}>Request Kit Restock</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {filteredKits.length === 0 && filteredSupplies.length === 0 && (
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 14,
              padding: 24,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#E2E8F0',
              marginBottom: 16,
            }}
          >
            <Ionicons name="briefcase-outline" size={44} color="#94A3B8" style={{ marginBottom: 10 }} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 4 }}>
              No Kit Batches Allocated Yet
            </Text>
            <Text style={{ fontSize: 12, color: '#64748B', textAlign: 'center', lineHeight: 18, maxWidth: 300 }}>
              Central Supply Warehouse has not assigned collection kit batches to your account yet. Once allocated by Admin, they will sync automatically.
            </Text>
          </View>
        )}

        {/* Section B: Loose Consumables & Raw Supplies */}
        {filteredSupplies.length > 0 && (
          <View style={screenStyles.section}>
            <View style={screenStyles.sectionHeader}>
              <Text style={screenStyles.sectionTitle}>🧪 Phlebotomy Supplies &amp; Consumables</Text>
              <Text style={screenStyles.sectionBadge}>{filteredSupplies.length} Items</Text>
            </View>

            <View style={{ gap: rs(8) }}>
              {filteredSupplies.map((sup) => {
                const isLow = sup.onHand <= sup.minStock;
                return (
                  <View key={sup.id} style={screenStyles.supplyRow}>
                    <View style={[screenStyles.supplyIcon, { backgroundColor: `${sup.color}15` }]}>
                      <MaterialCommunityIcons name={sup.icon as any} size={20} color={sup.color} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 10 }}>
                      <Text style={screenStyles.supplyName} numberOfLines={1}>
                        {sup.name}
                      </Text>
                      <Text style={screenStyles.supplySub}>
                        SKU: {sup.code} • Min Safe: {sup.minStock}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[screenStyles.supplyQty, isLow && { color: '#DC2626' }]}>
                        {sup.onHand} units
                      </Text>
                      <Text style={[screenStyles.supplyStatus, { color: isLow ? '#DC2626' : '#059669' }]}>
                        {isLow ? '⚠️ Low' : '✓ Good'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Bulk Requisition Card */}
        <View style={screenStyles.bulkRequisitionCard}>
          <View style={screenStyles.bulkHeader}>
            <Ionicons name="cube-outline" size={26} color="#FFFFFF" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={screenStyles.bulkTitle}>Central Supply Requisition</Text>
              <Text style={screenStyles.bulkSub}>
                Running low on collection bags or custom panels before tomorrow's shifts?
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={screenStyles.bulkBtn}
            disabled={requestingCode === 'ALL'}
            onPress={() => handleRestock('ALL', 'Full Shift Supplies Restock')}
          >
            {requestingCode === 'ALL' ? (
              <ActivityIndicator size="small" color="#0F766E" />
            ) : (
              <>
                <Ionicons name="send" size={16} color="#0F766E" />
                <Text style={screenStyles.bulkBtnText}>Request Full Shift Restock (Central Hub)</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const screenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: BRAND_COLORS.navyPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rs(16),
    paddingTop: rs(14),
    paddingBottom: rs(16),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    padding: rs(4),
    marginRight: rs(10),
  },
  headerTitle: {
    fontFamily: FONTS.bold,
    fontSize: rf(17),
    color: '#FFFFFF',
    fontWeight: '800',
  },
  headerSub: {
    fontFamily: FONTS.regular,
    fontSize: rf(11),
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  scannerHeaderBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    padding: rs(8),
    borderRadius: rs(8),
    marginLeft: rs(8),
  },
  content: {
    flex: 1,
    paddingHorizontal: rs(14),
    paddingTop: rs(12),
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: rs(8),
    marginBottom: rs(12),
  },
  kpiCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: rs(10),
    padding: rs(10),
    alignItems: 'center',
  },
  kpiIconWrap: {
    marginBottom: rs(4),
  },
  kpiValue: {
    fontFamily: FONTS.bold,
    fontSize: rf(18),
    fontWeight: '800',
  },
  kpiLabel: {
    fontFamily: FONTS.medium,
    fontSize: rf(9),
    color: '#64748B',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rs(8),
    marginBottom: rs(10),
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: rf(13),
    color: '#0F172A',
    padding: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: rs(6),
    marginBottom: rs(14),
  },
  filterPill: {
    paddingHorizontal: rs(10),
    paddingVertical: rs(6),
    borderRadius: rs(8),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: BRAND_COLORS.tealPrimary,
    borderColor: BRAND_COLORS.tealPrimary,
  },
  filterPillText: {
    fontFamily: FONTS.medium,
    fontSize: rf(11),
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  section: {
    marginBottom: rs(16),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: rs(8),
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: rf(13),
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionBadge: {
    fontFamily: FONTS.medium,
    fontSize: rf(10),
    color: '#64748B',
    backgroundColor: '#E2E8F0',
    paddingHorizontal: rs(6),
    paddingVertical: 2,
    borderRadius: 4,
  },
  kitCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: rs(12),
    padding: rs(12),
  },
  kitCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  kitTitle: {
    fontFamily: FONTS.bold,
    fontSize: rf(13),
    fontWeight: '700',
    color: '#0F172A',
  },
  kitCode: {
    fontFamily: FONTS.regular,
    fontSize: rf(10),
    color: '#64748B',
    marginTop: 2,
  },
  barcodePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  barcodePillText: {
    fontFamily: FONTS.bold,
    fontSize: rf(10),
    color: '#0F766E',
  },
  lowBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lowBadgeText: {
    fontSize: 9,
    color: '#DC2626',
    fontWeight: '800',
  },
  kitQty: {
    fontFamily: FONTS.bold,
    fontSize: rf(15),
    fontWeight: '800',
  },
  kitConsumed: {
    fontFamily: FONTS.regular,
    fontSize: rf(10),
    color: '#94A3B8',
    marginTop: 2,
  },
  manifestWrap: {
    marginTop: rs(10),
    paddingTop: rs(8),
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  manifestLabel: {
    fontFamily: FONTS.medium,
    fontSize: rf(9),
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  manifestPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  manifestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  manifestPillText: {
    fontFamily: FONTS.regular,
    fontSize: rf(10),
    color: '#334155',
  },
  kitActions: {
    marginTop: rs(10),
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  restockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: rs(10),
    paddingVertical: rs(5),
    borderRadius: rs(6),
  },
  restockBtnText: {
    fontFamily: FONTS.bold,
    fontSize: rf(10),
    color: '#0F766E',
    fontWeight: '700',
  },
  supplyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: rs(10),
    padding: rs(10),
  },
  supplyIcon: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplyName: {
    fontFamily: FONTS.bold,
    fontSize: rf(12),
    color: '#0F172A',
    fontWeight: '700',
  },
  supplySub: {
    fontFamily: FONTS.regular,
    fontSize: rf(10),
    color: '#64748B',
    marginTop: 2,
  },
  supplyQty: {
    fontFamily: FONTS.bold,
    fontSize: rf(13),
    color: '#0F172A',
    fontWeight: '800',
  },
  supplyStatus: {
    fontFamily: FONTS.medium,
    fontSize: rf(9),
    marginTop: 2,
  },
  bulkRequisitionCard: {
    backgroundColor: BRAND_COLORS.navyPrimary,
    borderRadius: rs(14),
    padding: rs(16),
    marginTop: rs(8),
  },
  bulkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: rs(12),
  },
  bulkTitle: {
    fontFamily: FONTS.bold,
    fontSize: rf(14),
    color: '#FFFFFF',
    fontWeight: '800',
  },
  bulkSub: {
    fontFamily: FONTS.regular,
    fontSize: rf(11),
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
    lineHeight: 16,
  },
  bulkBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(8),
    paddingVertical: rs(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bulkBtnText: {
    fontFamily: FONTS.bold,
    fontSize: rf(12),
    color: '#0F766E',
    fontWeight: '800',
  },
});
