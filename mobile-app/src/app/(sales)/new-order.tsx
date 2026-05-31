import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { C, S } from '@/theme/colors';
import { Icon } from '@/components/ui/Icon';
import { BigButton } from '@/components/ui/BigButton';
import { SalesTopBar, StepHeader } from '@/components/sales/kit';
import { CustomerChip } from './new-quote';
import { useOnline } from '@/hooks/useOnline';

const SHIP_TOS = [
  { name: 'Jobsite — Hickory Ln', addr: '3402 Hickory Ln, Clive IA', icon: 'pin' as const },
  { name: 'Will Call — 20GR Grimes', addr: 'Pick up at counter', icon: 'building' as const },
  { name: 'Main office', addr: '4220 NW 86th St, Urbandale IA', icon: 'pin' as const },
];

export default function NewOrderScreen() {
  const online = useOnline();
  const [ship, setShip] = useState(0);

  // Offline → the order is queued to the outbox; online → submitted to ERP.
  const submit = () => router.push(online ? '/(sales)/submitted?kind=order' : '/(sales)/submitted?kind=order&queued=1');

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar back="Cancel" title="New Order" onBack={() => router.back()} />
      <View style={styles.promo}>
        <Icon name="swap" size={14} color={C.green} strokeWidth={2.4} />
        <Text style={styles.promoText}>Promoted from quote Q-2026-0488 · lines carried over</Text>
      </View>
      <View style={styles.stepWrap}><StepHeader steps={['Customer', 'Items', 'Delivery', 'Review']} current={2} /></View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <CustomerChip mono="HC" name="Holstead Construction" sub="C-10428 · 3 line items · $1,168.32" />

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
        <BigButton kind="primary" icon="arrowRight" onPress={submit}>Review Order</BigButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  promo: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: S.deliverySoft, borderBottomWidth: 1, borderBottomColor: '#b6e6c8', paddingHorizontal: 16, paddingVertical: 7 },
  promoText: { fontSize: 12.5, fontWeight: '700', color: '#1f6b43' },
  stepWrap: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  scroll: { padding: 14, paddingBottom: 40 },
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
