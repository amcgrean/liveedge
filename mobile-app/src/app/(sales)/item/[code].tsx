import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { C, S, BRANCHES, BranchCode } from '@/theme/colors';
import { Icon } from '@/components/ui/Icon';
import { BigButton } from '@/components/ui/BigButton';
import { SalesTopBar, LiveBadge, Skel, MONO } from '@/components/sales/kit';
import { fetchItem, fetchItemAvailability, SalesItem } from '@/data/salesMock';
import type { ItemAvailability } from '@/api/sales';

export default function ItemDetailScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user } = useAuth();
  const { show } = useToast();
  const branchCode = (user?.branch || '20GR') as BranchCode;

  const [item, setItem] = useState<SalesItem | undefined>();
  const [avail, setAvail] = useState<ItemAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [qty, setQty] = useState(24);

  const load = async () => {
    setLoading(true); setError(false); setAvail(null);
    try {
      const it = await fetchItem(String(code));
      if (!it) throw new Error('not found');
      setItem(it);
      // Phase 2: overlay per-branch on-hand + live price (best-effort).
      fetchItemAvailability(String(code)).then(setAvail).catch(() => {});
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [code]);

  // Live customer price when the ERP returned one, else the Phase 1 mirror price.
  const live = !!(avail?.priceLive && avail.price != null);
  const priceStr = live ? avail!.price!.toFixed(2) : (item?.price && item.price !== '—' ? item.price : null);

  // Per-branch on-hand: prefer the live mirror byBranch (named from theme),
  // else the item's byBranch, else a single-branch fallback.
  const branches =
    avail && avail.byBranch.length
      ? avail.byBranch.map((b) => ({
          code: b.code,
          name: BRANCHES.find((x) => x.code === b.code)?.name ?? b.code,
          onhand: b.onhand ?? 0,
        }))
      : item?.byBranch ||
        BRANCHES.map((b) => ({ code: b.code, name: b.name, onhand: b.code === branchCode ? item?.onhand || 0 : 0 }));
  const stockOk = (item?.onhand || 0) > 0;

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <SalesTopBar back="Items" title={String(code)} onBack={() => router.back()} />
        <View style={styles.errorWrap}>
          <View style={styles.errorIcon}><Icon name="alert" size={38} color={C.err} strokeWidth={2} /></View>
          <Text style={styles.errorTitle}>Couldn't reach the ERP</Text>
          <Text style={styles.errorBody}>Live price & availability timed out. Your connection looks slow — try again, or use the last known price.</Text>
          <BigButton kind="primary" icon="refresh" fullWidth={false} style={{ marginTop: 22, paddingHorizontal: 26 }} onPress={load}>Retry</BigButton>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar back="Items" title={item?.code || String(code)} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroRow}>
            <View style={styles.imgPlaceholder}><Icon name="box" size={30} color={C.text4} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.itemDesc}>{item?.desc || '…'}</Text>
              <Text style={styles.itemCode}>{item?.code || code} · {item?.category || 'Item'}</Text>
              <View style={styles.stockChip}>
                <View style={[styles.stockDot, { backgroundColor: stockOk ? C.ok : C.err }]} />
                <Text style={[styles.stockText, { color: stockOk ? C.ok : C.err }]}>{stockOk ? `In stock at ${branchCode}` : `Out at ${branchCode}`}</Text>
              </View>
            </View>
          </View>

          {/* Live price block */}
          <View style={styles.priceBlock}>
            <View style={{ flex: 1 }}>
              <Text style={styles.priceLabel}>Your price · {branchCode}</Text>
              {loading ? <Skel w={120} h={30} style={{ marginTop: 6 }} /> : (
                <View style={styles.priceRow}>
                  <Text style={styles.priceBig}>{priceStr ? `$${priceStr}` : '—'}</Text>
                  <Text style={styles.priceUom}>/ {(live && avail?.uom) || item?.uom}</Text>
                </View>
              )}
              {item?.list && <Text style={styles.priceList}>List ${item.list} · <Text style={styles.priceContract}>contract −15%</Text></Text>}
            </View>
            {live
              ? <LiveBadge label="Live" ago="now" />
              : <LiveBadge label="On-hand" ago="cached" tone="stale" />}
          </View>
        </View>

        {/* On-hand per branch */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>On-hand by branch</Text>
            <Text style={styles.uomTag}>{item?.uom}</Text>
          </View>
          <View style={styles.card}>
            {branches.map((b, i) => {
              const here = b.code === branchCode;
              return (
                <View key={b.code} style={[styles.branchRow, { borderBottomWidth: i < branches.length - 1 ? 1 : 0, backgroundColor: here ? S.deliverySoft : '#fff' }]}>
                  <Text style={styles.branchCode}>{b.code}</Text>
                  <Text style={styles.branchName}>{b.name}{here && <Text style={styles.yourYard}>  · YOUR YARD</Text>}</Text>
                  {b.onhand > 0
                    ? <Text style={styles.branchQty}>{b.onhand.toLocaleString()}</Text>
                    : <Text style={styles.branchOut}>OUT</Text>}
                </View>
              );
            })}
          </View>
          <View style={styles.note}>
            <Icon name="info" size={13} color={C.text4} />
            <Text style={styles.noteText}>Availability is live committed on-hand, not reserved against open orders.</Text>
          </View>
        </View>
      </ScrollView>

      {/* Sticky add bar */}
      <View style={styles.addBar}>
        <View style={styles.stepper}>
          <TouchableOpacity style={styles.stepBtn} onPress={() => setQty((q) => Math.max(1, q - 1))}><Icon name="minus" size={18} color={C.text2} /></TouchableOpacity>
          <Text style={styles.stepQty}>{qty}</Text>
          <TouchableOpacity style={styles.stepBtn} onPress={() => setQty((q) => q + 1)}><Icon name="plus" size={18} color={C.green} /></TouchableOpacity>
        </View>
        <BigButton kind="primary" icon="plusCircle" style={{ flex: 1, height: 52 }} onPress={() => { show(`Added ${qty} ${item?.uom} to quote`, 'success'); router.push('/(sales)/new-quote'); }}>Add to Quote</BigButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  scroll: { paddingBottom: 110 },
  hero: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: C.line },
  heroRow: { flexDirection: 'row', gap: 14 },
  imgPlaceholder: { width: 84, height: 84, borderRadius: 14, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  itemDesc: { fontSize: 18, fontWeight: '800', color: C.text, lineHeight: 22 },
  itemCode: { fontSize: 12.5, color: C.text3, fontFamily: MONO, marginTop: 3 },
  stockChip: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9 },
  stockDot: { width: 8, height: 8, borderRadius: 4 },
  stockText: { fontSize: 12, fontWeight: '800' },
  priceBlock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, padding: 14, backgroundColor: S.liveSoft, borderWidth: 1.5, borderColor: '#b6e6c8', borderRadius: 14 },
  priceLabel: { fontSize: 11.5, fontWeight: '800', color: S.live, letterSpacing: 0.5, textTransform: 'uppercase' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  priceBig: { fontSize: 32, fontWeight: '800', color: C.text, fontFamily: MONO, letterSpacing: -0.6 },
  priceUom: { fontSize: 14, fontWeight: '700', color: C.text3 },
  priceList: { fontSize: 12, color: C.text3, marginTop: 4 },
  priceContract: { color: S.live, fontWeight: '700' },
  section: { marginHorizontal: 14, marginTop: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingBottom: 9 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  uomTag: { fontSize: 12, color: C.text3, fontFamily: MONO },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: 'hidden' },
  branchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderBottomColor: C.lineSoft },
  branchCode: { fontFamily: MONO, fontSize: 12.5, fontWeight: '800', color: C.text3, width: 44 },
  branchName: { flex: 1, fontSize: 15, fontWeight: '700', color: C.text },
  yourYard: { fontSize: 11, fontWeight: '800', color: C.green },
  branchQty: { fontSize: 16, fontWeight: '800', color: C.text, fontFamily: MONO },
  branchOut: { fontSize: 12.5, fontWeight: '800', color: C.err },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingTop: 8 },
  noteText: { flex: 1, fontSize: 12, color: C.text4 },
  addBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 30, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.line, borderRadius: 12, overflow: 'hidden', height: 52 },
  stepBtn: { width: 44, height: 52, alignItems: 'center', justifyContent: 'center' },
  stepQty: { width: 44, textAlign: 'center', fontSize: 18, fontWeight: '800', color: C.text, fontFamily: MONO },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  errorIcon: { width: 84, height: 84, borderRadius: 24, backgroundColor: C.errSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  errorTitle: { fontSize: 19, fontWeight: '800', color: C.text },
  errorBody: { fontSize: 14.5, color: C.text3, marginTop: 8, lineHeight: 21, textAlign: 'center', maxWidth: 290 },
});
