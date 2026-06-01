import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { C, S } from '@/theme/colors';
import { Icon } from '@/components/ui/Icon';
import { BigButton } from '@/components/ui/BigButton';
import { SalesTopBar, SearchBar, StepHeader, LiveBadge, Monogram, MONO } from '@/components/sales/kit';
import { useToast } from '@/context/ToastContext';
import { IS_DEV_MODE } from '@/api/client';
import { salesApi } from '@/api/sales';

interface DraftLine { qty: number; uom: string; code: string; desc: string; price: number }

// TODO(Phase 3 follow-up): the customer + lines are still seeded from the
// design mock. Wire a real customer picker + item-search add into these
// screens; the submit path below already posts whatever's in state.
const DRAFT_CUSTOMER = 'C-10428';

export function CustomerChip({ mono, name, sub, onChange }: { mono: string; name: string; sub: string; onChange?: () => void }) {
  return (
    <View style={styles.chip}>
      <Monogram text={mono} size={40} color={C.green} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.chipName}>{name}</Text>
        <Text style={styles.chipSub}>{sub}</Text>
      </View>
      {onChange && <TouchableOpacity onPress={onChange}><Text style={styles.chipChange}>Change</Text></TouchableOpacity>}
    </View>
  );
}

export default function NewQuoteScreen() {
  const [lines, setLines] = useState<DraftLine[]>([
    { qty: 24, uom: 'EA', code: 'SPF2X4-92', desc: 'SPF 2×4 92⅝" Stud', price: 4.18 },
    { qty: 18, uom: 'SHT', code: 'OSB-716-4X8', desc: 'OSB Sheathing 7/16" 4×8', price: 18.40 },
    { qty: 8, uom: 'EA', code: 'LVL-11875', desc: 'LVL 1¾×11⅞ × 16′', price: 92.10 },
  ]);

  const { show } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const setQty = (i: number, delta: number) => setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, qty: Math.max(1, l.qty + delta) } : l));
  const remove = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const submit = async () => {
    // Dev mode (no backend): keep the design demo flow.
    if (IS_DEV_MODE) { router.push('/(sales)/submitted?kind=quote'); return; }
    setSubmitting(true);
    try {
      const res = await salesApi.createQuote({
        customer: DRAFT_CUSTOMER,
        lines: lines.map((l) => ({ itemId: l.code, quantity: l.qty, uom: l.uom })),
      });
      if (!res.written) {
        // Writeback flag is off — surface clearly rather than faking success.
        show(res.reason || 'Quote writeback is disabled', 'error');
        return;
      }
      router.replace(`/(sales)/submitted?kind=quote&erpId=${encodeURIComponent(res.erpId ?? '')}`);
    } catch (e: any) {
      show(e?.response?.data?.error || 'Could not create quote', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar back="Cancel" title="New Quote" onBack={() => router.back()} />
      {/* draft-saving banner */}
      <View style={styles.draftBanner}>
        <Icon name="check" size={14} color={S.draft} strokeWidth={3} />
        <Text style={styles.draftText}>Draft saved · Q-2026-0488 · auto-saves as you go</Text>
      </View>
      <View style={styles.stepWrap}><StepHeader steps={['Customer', 'Items', 'Review']} current={1} /></View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <CustomerChip mono="HC" name="Holstead Construction" sub="C-10428 · Urbandale, IA" onChange={() => router.push('/(sales)/customers')} />
        <View style={{ marginTop: 14 }}>
          <SearchBar editable placeholder="Add item — search # or description…" />
        </View>
        <View style={styles.linesHead}>
          <Text style={styles.linesLabel}>{lines.length} LINE ITEMS</Text>
          <LiveBadge label="Live price" ago="now" />
        </View>
        <View style={{ gap: 10 }}>
          {lines.map((l, i) => (
            <View key={l.code} style={styles.lineCard}>
              <View style={styles.lineTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.lineDesc}>{l.desc}</Text>
                  <Text style={styles.lineCode}>{l.code} · ${l.price.toFixed(2)}/{l.uom.toLowerCase()}</Text>
                </View>
                <TouchableOpacity style={styles.trash} onPress={() => remove(i)}><Icon name="trash" size={16} color={C.text3} /></TouchableOpacity>
              </View>
              <View style={styles.lineBottom}>
                <View style={styles.stepper}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setQty(i, -1)}><Icon name="minus" size={15} color={C.text3} /></TouchableOpacity>
                  <Text style={styles.stepQty}>{l.qty}</Text>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setQty(i, 1)}><Icon name="plus" size={15} color={C.green} /></TouchableOpacity>
                </View>
                <Text style={styles.lineExt}>${(l.qty * l.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerTotal}>
          <Text style={styles.footerLabel}>Subtotal · {lines.length} items</Text>
          <Text style={styles.footerValue}>${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        </View>
        <BigButton kind="primary" icon="arrowRight" loading={submitting} onPress={submit}>Review Quote</BigButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  draftBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: S.draftSoft, borderBottomWidth: 1, borderBottomColor: '#f1e0a4', paddingHorizontal: 16, paddingVertical: 7 },
  draftText: { fontSize: 12.5, fontWeight: '700', color: '#7a6726' },
  stepWrap: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  scroll: { padding: 14, paddingBottom: 40 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, borderRadius: 14 },
  chipName: { fontSize: 15.5, fontWeight: '800', color: C.text },
  chipSub: { fontSize: 12.5, color: C.text3 },
  chipChange: { fontSize: 13, fontWeight: '700', color: C.green },
  linesHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: 14, paddingBottom: 8 },
  linesLabel: { fontSize: 13, fontWeight: '800', color: C.text3, letterSpacing: 0.6 },
  lineCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 13 },
  lineTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  lineDesc: { fontSize: 14.5, fontWeight: '700', color: C.text, lineHeight: 19 },
  lineCode: { fontSize: 11.5, color: C.text3, fontFamily: MONO, marginTop: 2 },
  trash: { width: 30, height: 30, borderRadius: 8, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  lineBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 11 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.line, borderRadius: 10, overflow: 'hidden', height: 38 },
  stepBtn: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  stepQty: { minWidth: 34, textAlign: 'center', fontSize: 15, fontWeight: '800', color: C.text, fontFamily: MONO },
  lineExt: { fontSize: 16, fontWeight: '800', color: C.text, fontFamily: MONO },
  footer: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 30, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
  footerTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  footerLabel: { fontSize: 13.5, color: C.text3, fontWeight: '600' },
  footerValue: { fontSize: 20, fontWeight: '800', color: C.text, fontFamily: MONO },
});
