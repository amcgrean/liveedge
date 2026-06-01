import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { C, S } from '@/theme/colors';
import { Icon } from '@/components/ui/Icon';
import { BigButton } from '@/components/ui/BigButton';
import { SalesTopBar, StepHeader } from '@/components/sales/kit';
import { CustomerChip } from './new-quote';
import { useOnline } from '@/hooks/useOnline';
import { useToast } from '@/context/ToastContext';
import { IS_DEV_MODE } from '@/api/client';
import { salesApi } from '@/api/sales';
import { useDraft } from '@/context/DraftContext';

const SHIP_TOS = [
  { name: 'Jobsite — Hickory Ln', addr: '3402 Hickory Ln, Clive IA', icon: 'pin' as const, seq: 1 },
  { name: 'Will Call — 20GR Grimes', addr: 'Pick up at counter', icon: 'building' as const, seq: 2 },
  { name: 'Main office', addr: '4220 NW 86th St, Urbandale IA', icon: 'pin' as const, seq: 3 },
];

function priceNum(p: string): number {
  const n = parseFloat(p);
  return Number.isFinite(n) ? n : 0;
}

export default function NewOrderScreen() {
  const online = useOnline();
  const { show } = useToast();
  const { customer, lines, clear } = useDraft();
  const [ship, setShip] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const subtotal = lines.reduce((s, l) => s + l.qty * priceNum(l.price), 0);
  const canSubmit = !!customer && lines.length > 0;

  const submit = async () => {
    if (!customer) { show('Choose a customer first', 'error'); return; }
    if (lines.length === 0) { show('Add at least one item', 'error'); return; }
    // Dev mode: keep the design demo, including the offline-queued variant.
    if (IS_DEV_MODE) {
      clear();
      router.push(online ? '/(sales)/submitted?kind=order' : '/(sales)/submitted?kind=order&queued=1');
      return;
    }
    // Offline auto-submit-from-outbox is intentionally deferred for writes
    // (idempotency must be designed + tested before we let retries re-create
    // orders). For now, require connectivity to submit.
    if (!online) { show('You\'re offline — reconnect to submit this order', 'error'); return; }
    setSubmitting(true);
    try {
      const res = await salesApi.createOrder({
        customer: customer.code,
        shipToSequence: SHIP_TOS[ship].seq,
        validate: true,
        lines: lines.map((l) => ({ itemId: l.code, quantity: l.qty, uom: l.uom })),
      });
      if (!res.written) { show(res.reason || 'Order writeback is disabled', 'error'); return; }
      const erpId = res.erpId ?? '';
      clear();
      router.replace(`/(sales)/submitted?kind=order&erpId=${encodeURIComponent(erpId)}`);
    } catch (e: any) {
      show(e?.response?.data?.error || 'Could not create order', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const itemSummary = lines.length > 0
    ? `${lines.length} line item${lines.length > 1 ? 's' : ''} · $${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : 'No items yet';

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar back="Cancel" title="New Order" onBack={() => router.back()} />
      <View style={styles.stepWrap}><StepHeader steps={['Customer', 'Items', 'Delivery', 'Review']} current={canSubmit ? 2 : customer ? 1 : 0} /></View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {customer ? (
          <CustomerChip mono={customer.mono} name={customer.name} sub={`${customer.code} · ${itemSummary}`} onChange={() => router.push('/(sales)/pick-customer')} />
        ) : (
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/(sales)/pick-customer')} style={styles.pickCustomer}>
            <View style={styles.pickIcon}><Icon name="users" size={22} color={C.green} strokeWidth={2.2} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pickTitle}>Choose a customer</Text>
              <Text style={styles.pickSub}>Search by name or account #</Text>
            </View>
            <Icon name="chevronRight" size={20} color={C.text4} />
          </TouchableOpacity>
        )}

        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/(sales)/pick-item')} style={styles.addItemBtn}>
          <Icon name="plusCircle" size={20} color={C.green} strokeWidth={2.2} />
          <Text style={styles.addItemText}>{lines.length > 0 ? `Edit items · ${lines.length}` : 'Add items'}</Text>
        </TouchableOpacity>

        <Text style={styles.label}>SHIP TO</Text>
        <View style={{ gap: 10 }}>
          {SHIP_TOS.map((s, i) => {
            const sel = i === ship;
            return (
              <TouchableOpacity key={s.name} activeOpacity={0.85} onPress={() => setShip(i)} style={[styles.shipCard, { borderColor: sel ? C.green : C.line }]}>
                <View style={[styles.shipIcon, { backgroundColor: sel ? S.deliverySoft : C.surface2 }]}>
                  <Icon name={s.icon} size={18} color={sel ? C.green : C.text3} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.shipName}>{s.name}</Text>
                  <Text style={styles.shipAddr}>{s.addr}</Text>
                </View>
                <View style={[styles.radio, { borderColor: sel ? C.green : C.line, backgroundColor: sel ? C.green : '#fff' }]}>
                  {sel && <Icon name="check" size={13} color="#fff" strokeWidth={3.5} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>REQUESTED DELIVERY DATE</Text>
        <TouchableOpacity activeOpacity={0.8} style={styles.dateBtn}>
          <View style={styles.dateIcon}><Icon name="calendar" size={18} color={C.text2} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateLabel}>Fri · May 29, 2026</Text>
            <Text style={styles.dateHint}>AM window · yard can fulfill</Text>
          </View>
          <Icon name="chevronDown" size={18} color={C.text3} />
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <BigButton kind="primary" icon="arrowRight" disabled={!canSubmit} loading={submitting} onPress={submit}>Review Order</BigButton>
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
  label: { fontSize: 13, fontWeight: '800', color: C.text3, letterSpacing: 0.6, paddingHorizontal: 2, paddingTop: 18, paddingBottom: 9 },
  shipCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, backgroundColor: '#fff', borderWidth: 1.5, borderRadius: 14 },
  shipIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  shipName: { fontSize: 15, fontWeight: '700', color: C.text },
  shipAddr: { fontSize: 12.5, color: C.text3 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, borderRadius: 14 },
  dateIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  dateLabel: { fontSize: 15, fontWeight: '700', color: C.text },
  dateHint: { fontSize: 12.5, color: C.green, fontWeight: '600' },
  footer: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 30, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
});
