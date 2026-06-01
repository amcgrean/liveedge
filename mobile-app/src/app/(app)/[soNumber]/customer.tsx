import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Icon } from '@/components/ui/Icon';
import { C } from '@/theme/colors';
import { useStopOrLookup } from '@/hooks/useStopOrLookup';
import { BigButton } from '@/components/ui/BigButton';
import { fetchOrderLines, OrderLineRow } from '@/api/dispatch';

function formatMoney(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `$${n.toFixed(2)}`;
}

function formatQty(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  // Integer if it's a clean count, else 2 decimals for fractional UOMs.
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export default function CustomerSheetScreen() {
  const { soNumber } = useLocalSearchParams<{ soNumber: string }>();
  const { stop, loading } = useStopOrLookup(soNumber);

  // Live order lines from the dispatch /lines endpoint. Independent of the
  // mock `stop.orderLines` field so real SOs always show real items.
  const [lines, setLines] = useState<OrderLineRow[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const [linesError, setLinesError] = useState<string | null>(null);

  useEffect(() => {
    if (!stop?.so) return;
    let alive = true;
    setLinesLoading(true);
    setLinesError(null);
    fetchOrderLines(stop.so, stop.branchCode)
      .then((rows) => {
        if (!alive) return;
        setLines(rows);
      })
      .catch((err) => {
        if (!alive) return;
        setLinesError(err instanceof Error ? err.message : 'Failed to load line items');
      })
      .finally(() => {
        if (!alive) return;
        setLinesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [stop?.so, stop?.branchCode]);

  // Loading / not-found states render a real UI with a way out instead of
  // returning null (which looks frozen).
  if (!stop) {
    return (
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={() => router.back()}
        />
        <SafeAreaView style={styles.sheet}>
          <View style={[styles.grabberWrap, { paddingTop: 30, paddingBottom: 30, alignItems: 'center', gap: 12 }]}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }}>
              {loading ? 'Loading order…' : 'Order details not available'}
            </Text>
            {!loading && (
              <Text style={{ fontSize: 13, color: C.text3, textAlign: 'center', paddingHorizontal: 20 }}>
                We couldn’t load contents for SO# {soNumber}. The order header may not be reachable from this branch.
              </Text>
            )}
            <BigButton kind="primary" onPress={() => router.back()} style={{ marginTop: 6 }}>
              Back to delivery
            </BigButton>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const dial = (phone?: string) => {
    if (phone) Linking.openURL(`tel:${phone.replace(/\D/g, '')}`);
  };

  return (
    <View style={styles.backdrop}>
      {/* Tappable backdrop to dismiss */}
      <TouchableOpacity
        style={StyleSheet.absoluteFillObject}
        activeOpacity={1}
        onPress={() => router.back()}
      />

      <SafeAreaView style={styles.sheet}>
        {/* Grabber */}
        <View style={styles.grabberWrap}>
          <View style={styles.grabber} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerLabel}>CUSTOMER DETAILS</Text>
            <Text style={styles.headerName}>{stop.name}</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Icon name="x" size={18} color={C.text2} strokeWidth={2.4} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {/* Primary contact */}
          {stop.primaryContact && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => dial(stop.primaryContact?.phone)}
              style={styles.primaryContact}
            >
              <View style={styles.callIcon}>
                <Icon name="phone" size={20} color="white" strokeWidth={2.4} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.primaryLabel}>PRIMARY CONTACT</Text>
                <Text style={styles.primaryName}>{stop.primaryContact.name}</Text>
                <Text style={styles.primaryPhone}>{stop.primaryContact.phone}</Text>
              </View>
              <Text style={styles.callCta}>CALL</Text>
            </TouchableOpacity>
          )}

          {/* Site contact */}
          {stop.siteContact && (
            <View style={styles.siteContact}>
              <View style={styles.siteInitials}>
                <Text style={styles.siteInitialsText}>{stop.siteContact.initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.siteLabel}>SITE CONTACT</Text>
                <Text style={styles.siteName}>
                  {stop.siteContact.name} · {stop.siteContact.role}
                </Text>
                <Text style={styles.siteMeta}>
                  {stop.siteContact.phone}
                  {stop.siteContact.hours ? ` · ${stop.siteContact.hours}` : ''}
                </Text>
              </View>
            </View>
          )}

          {/* Site access */}
          {stop.siteAccess && (
            <View style={styles.accessBox}>
              <Text style={styles.accessLabel}>SITE ACCESS</Text>
              <Text style={styles.accessText}>
                {stop.siteAccess.split('[GATE]').map((part, i, arr) =>
                  i < arr.length - 1 ? (
                    <Text key={i}>
                      {part}
                      <Text style={styles.gateCode}> {stop.gateCode} </Text>
                    </Text>
                  ) : (
                    <Text key={i}>{part}</Text>
                  )
                )}
              </Text>
            </View>
          )}

          {/* Order lines — real data from /api/dispatch/orders/[so]/lines */}
          <View style={styles.linesSection}>
            <View style={styles.linesHeader}>
              <Text style={styles.linesTitle}>Order line items</Text>
              {!linesLoading && (
                <Text style={styles.linesCount}>
                  {lines.length} {lines.length === 1 ? 'item' : 'items'}
                </Text>
              )}
            </View>
            {linesLoading ? (
              <View style={[styles.linesCard, { padding: 28, alignItems: 'center' }]}>
                <ActivityIndicator color={C.green} />
              </View>
            ) : linesError ? (
              <View style={[styles.linesCard, { padding: 18 }]}>
                <Text style={{ fontSize: 13, color: C.err, fontWeight: '600' }}>
                  Couldn’t load line items: {linesError}
                </Text>
              </View>
            ) : lines.length === 0 ? (
              <View style={[styles.linesCard, { padding: 18 }]}>
                <Text style={{ fontSize: 13, color: C.text3 }}>
                  No line items returned for this SO.
                </Text>
              </View>
            ) : (
              <View style={styles.linesCard}>
                {lines.map((l, i) => {
                  const key = `${l.sequence ?? i}-${l.item_code ?? i}`;
                  const ext = l.extended_price ?? null;
                  const uom = l.uom?.trim() || '';
                  return (
                    <View
                      key={key}
                      style={[
                        styles.lineRow,
                        i < lines.length - 1 && styles.lineRowBorder,
                      ]}
                    >
                      <View style={{ minWidth: 56, alignItems: 'flex-end' }}>
                        <Text style={styles.lineQty}>{formatQty(l.qty_ordered)}</Text>
                        {uom ? (
                          <Text style={{ fontSize: 10, color: C.text4, fontWeight: '700', letterSpacing: 0.4, marginTop: 2 }}>
                            {uom}
                          </Text>
                        ) : null}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.lineDesc} numberOfLines={2}>
                          {l.description ?? '—'}
                        </Text>
                        <Text style={styles.lineCode}>
                          {l.item_code ?? '—'}
                          {l.size ? ` · ${l.size}` : ''}
                        </Text>
                      </View>
                      <Text style={styles.lineWt}>{formatMoney(ext)}</Text>
                    </View>
                  );
                })}
                {(() => {
                  const subtotal = lines.reduce(
                    (sum, l) => sum + (l.extended_price ?? 0),
                    0
                  );
                  return subtotal > 0 ? (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Subtotal</Text>
                      <Text style={styles.totalValue}>{formatMoney(subtotal)}</Text>
                    </View>
                  ) : null;
                })()}
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
    elevation: 20,
  },
  grabberWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  grabber: { width: 40, height: 5, borderRadius: 2.5, backgroundColor: C.line },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.text3,
    letterSpacing: 0.6,
  },
  headerName: { fontSize: 20, fontWeight: '700', color: C.text, marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingBottom: 30 },
  primaryContact: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    backgroundColor: C.greenSoft,
    borderWidth: 1.5,
    borderColor: C.green,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  callIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.green,
    letterSpacing: 0.6,
  },
  primaryName: { fontSize: 17, fontWeight: '700', color: C.text },
  primaryPhone: { fontSize: 14, color: C.text2, fontFamily: 'Menlo' },
  callCta: { fontSize: 13, fontWeight: '700', color: C.green },
  siteContact: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  siteInitials: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  siteInitialsText: { color: C.text2, fontSize: 15, fontWeight: '700' },
  siteLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.text3,
    letterSpacing: 0.6,
  },
  siteName: { fontSize: 16, fontWeight: '700', color: C.text },
  siteMeta: { fontSize: 13, color: C.text3 },
  accessBox: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    backgroundColor: C.goldSoft,
    borderWidth: 1.5,
    borderColor: '#f1e0a4',
    borderRadius: 12,
  },
  accessLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: C.gold,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  accessText: { fontSize: 14, color: C.text, lineHeight: 21 },
  gateCode: {
    fontFamily: 'Menlo',
    fontWeight: '800',
    backgroundColor: '#ffffff',
    paddingHorizontal: 6,
    color: C.text,
  },
  linesSection: { marginTop: 14, paddingHorizontal: 16 },
  linesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  linesTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  linesCount: { fontSize: 12, color: C.text3, fontFamily: 'Menlo' },
  linesCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    overflow: 'hidden',
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  lineRowBorder: { borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  lineQty: {
    width: 38,
    textAlign: 'right',
    fontFamily: 'Menlo',
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },
  lineDesc: { fontSize: 13, color: C.text, fontWeight: '600' },
  lineCode: { fontSize: 11, color: C.text3, fontFamily: 'Menlo' },
  lineWt: { fontSize: 12, color: C.text3, fontFamily: 'Menlo' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  totalLabel: { fontSize: 13, color: C.text3, fontWeight: '600' },
  totalValue: { fontSize: 16, color: C.text, fontWeight: '800', fontFamily: 'Menlo' },
});
