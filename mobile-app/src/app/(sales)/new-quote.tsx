import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { C, S } from '@/theme/colors';
import { Icon } from '@/components/ui/Icon';
import { BigButton } from '@/components/ui/BigButton';
import { SalesTopBar, StepHeader, LiveBadge, Monogram, EmptyState, MONO } from '@/components/sales/kit';
import { useToast } from '@/context/ToastContext';
import { IS_DEV_MODE } from '@/api/client';
import { salesApi } from '@/api/sales';
import { useDraft, DraftLine } from '@/context/DraftContext';

// Parse a display price string ('4.18' / '—') to a number for subtotal math.
function priceNum(p: string): number {
  const n = parseFloat(p);
  return Number.isFinite(n) ? n : 0;
}

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

// Empty "pick a customer" prompt shown before one is chosen.
function PickCustomerCard() {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/(sales)/pick-customer')} style={styles.pickCustomer}>
      <View style={styles.pickIcon}><Icon name="users" size={22} color={C.green} strokeWidth={2.2} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.pickTitle}>Choose a customer</Text>
        <Text style={styles.pickSub}>Search by name or account #</Text>
      </View>
      <Icon name="chevronRight" size={20} color={C.text4} />
    </TouchableOpacity>
  );
}

export default function NewQuoteScreen() {
  const { customer, lines, setQty, removeLine, clear } = useDraft();
  const { show } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const subtotal = lines.reduce((s, l) => s + l.qty * priceNum(l.price), 0);
  const canSubmit = !!customer && lines.length > 0;

  const submit = async () => {
    if (!customer) { show('Choose a customer first', 'error'); return; }
    if (lines.length === 0) { show('Add at least one item', 'error'); return; }
    // Dev mode (no backend): keep the design demo flow.
    if (IS_DEV_MODE) { clear(); router.push('/(sales)/submitted?kind=quote'); return; }
    setSubmitting(true);
    try {
      const res = await salesApi.createQuote({
        customer: customer.code,
        lines: lines.map((l) => ({ itemId: l.code, quantity: l.qty, uom: l.uom })),
      });
      if (!res.written) {
        show(res.reason || 'Quote writeback is disabled', 'error');
        return;
      }
      const erpId = res.erpId ?? '';
      clear();
      router.replace(`/(sales)/submitted?kind=quote&erpId=${encodeURIComponent(erpId)}`);
    } catch (e: any) {
      show(e?.response?.data?.error || 'Could not create quote', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar back="Cancel" title="New Quote" onBack={() => router.back()} />
      <View style={styles.stepWrap}><StepHeader steps={['Customer', 'Items', 'Review']} current={customer ? 1 : 0} /></View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {customer ? (
          <CustomerChip mono={customer.mono} name={customer.name} sub={`${customer.code}${customer.city ? ` · ${customer.city}` : ''}`} onChange={() => router.push('/(sales)/pick-customer')} />
        ) : (
          <PickCustomerCard />
        )}

        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/(sales)/pick-item')} style={styles.addItemBtn}>
          <Icon name="plusCircle" size={20} color={C.green} strokeWidth={2.2} />
          <Text style={styles.addItemText}>Add items</Text>
        </TouchableOpacity>

        {lines.length > 0 && (
          <>
            <View style={styles.linesHead}>
              <Text style={styles.linesLabel}>{lines.length} LINE ITEM{lines.length > 1 ? 'S' : ''}</Text>
              <LiveBadge label="Live price" ago="now" />
            </View>
            <View style={{ gap: 10 }}>
              {lines.map((l: DraftLine) => (
                <View key={l.code} style={styles.lineCard}>
                  <View style={styles.lineTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.lineDesc}>{l.desc}</Text>
                      <Text style={styles.lineCode}>{l.code}{l.price !== '—' ? ` · $${l.price}/${l.uom.toLowerCase()}` : ''}</Text>
                    </View>
                    <TouchableOpacity style={styles.trash} onPress={() => removeLine(l.code)}><Icon name="trash" size={16} color={C.text3} /></TouchableOpacity>
                  </View>
                  <View style={styles.lineBottom}>
                    <View style={styles.stepper}>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => setQty(l.code, l.qty - 1)}><Icon name="minus" size={15} color={C.text3} /></TouchableOpacity>
                      <Text style={styles.stepQty}>{l.qty}</Text>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => setQty(l.code, l.qty + 1)}><Icon name="plus" size={15} color={C.green} /></TouchableOpacity>
                    </View>
                    {l.price !== '—' && (
                      <Text style={styles.lineExt}>${(l.qty * priceNum(l.price)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {lines.length === 0 && (
          <View style={styles.emptyWrap}>
            <EmptyState icon="tag" title="No items yet" body="Tap “Add items” to search products and build this quote." />
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerTotal}>
          <Text style={styles.footerLabel}>Subtotal · {lines.length} item{lines.length === 1 ? '' : 's'}</Text>
          <Text style={styles.footerValue}>${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        </View>
        <BigButton kind="primary" icon="arrowRight" disabled={!canSubmit} loading={submitting} onPress={submit}>Review Quote</BigButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  stepWrap: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  scroll: { padding: 14, paddingBottom: 40 },
  pickCustomer: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.green, borderRadius: 14, borderStyle: 'dashed' },
  pickIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  pickTitle: { fontSize: 15.5, fontWeight: '800', color: C.text },
  pickSub: { fontSize: 12.5, color: C.text3 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff' },
  addItemText: { fontSize: 15, fontWeight: '700', color: C.text },
  emptyWrap: { paddingTop: 40 },
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
