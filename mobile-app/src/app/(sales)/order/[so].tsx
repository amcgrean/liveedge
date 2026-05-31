import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { C, S } from '@/theme/colors';
import { Icon, IconName } from '@/components/ui/Icon';
import { SalesTopBar, StatusPill, LiveBadge, BigButtonRow, Skel, MONO } from '@/components/sales/kit';
import { BigButton } from '@/components/ui/BigButton';
import { fetchOrder, SalesOrder, ORDER_STATUS_LABEL, OrderLine } from '@/data/salesMock';

type StepState = 'done' | 'active' | 'todo';
function TimelineStep({ icon, label, time, state, last }: { icon: IconName; label: string; time: string; state: StepState; last?: boolean }) {
  const done = state === 'done', active = state === 'active';
  const c = done ? C.green : active ? S.picking : C.text4;
  return (
    <View style={styles.tlStep}>
      {!last && <View style={[styles.tlLine, { backgroundColor: done ? C.green : C.line }]} />}
      <View style={[styles.tlDot, { backgroundColor: done ? C.green : '#fff', borderColor: done || active ? c : C.line }, active && styles.tlDotActive]}>
        <Icon name={done ? 'check' : icon} size={16} color={done ? '#fff' : c} strokeWidth={done ? 3 : 2.2} />
      </View>
      <View style={styles.tlBody}>
        <Text style={[styles.tlLabel, { color: done || active ? C.text : C.text4, fontWeight: active ? '800' : done ? '700' : '600' }]}>{label}</Text>
        <Text style={[styles.tlTime, { color: active ? S.picking : C.text3, fontWeight: active ? '700' : '500' }]}>{time}</Text>
      </View>
    </View>
  );
}

const FILL_META: Record<NonNullable<OrderLine['fill']>, ['full' | 'partial' | 'back', string]> = {
  full: ['full', 'Picked'], partial: ['partial', 'Partial'], back: ['back', 'Backorder'],
};

export default function OrderStatusScreen() {
  const { so } = useLocalSearchParams<{ so: string }>();
  const [order, setOrder] = useState<SalesOrder | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => { setLoading(true); setOrder(await fetchOrder(String(so))); setLoading(false); })();
  }, [so]);

  const lines = order?.lines || [];
  const chips: [string, string][] = [
    ['PO#', order?.poNumber || '—'],
    ['Placed', order?.date || '—'],
    ['Req. date', order?.reqDate || '—'],
    ['Branch', order?.branch || '20GR'],
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar back="Orders" title={`SO# ${so}`} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cust}>{order?.cust || 'Order'}</Text>
              {order?.ship && <Text style={styles.ship}>{order.ship}</Text>}
            </View>
            {order && <StatusPill kind={order.status}>{ORDER_STATUS_LABEL[order.status]}</StatusPill>}
          </View>
          <View style={styles.chips}>
            {chips.map(([k, v]) => (
              <View key={k} style={styles.chip}>
                <Text style={styles.chipKey}>{k} </Text>
                <Text style={styles.chipVal}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Fulfillment timeline */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Fulfillment</Text>
            <LiveBadge label="Live" ago="20s ago" />
          </View>
          <TimelineStep icon="check" label="Order placed" time={`${order?.date || 'May 27'} · 9:42 AM`} state="done" />
          <TimelineStep icon="package" label="Picking at yard" time="In progress · 4 of 6 lines pulled" state="active" />
          <TimelineStep icon="box" label="Staged for delivery" time="Pending" state="todo" />
          <TimelineStep icon="truck" label="Out for delivery" time={`Est. ${order?.reqDate || 'May 29'} AM`} state="todo" />
          <TimelineStep icon="fileText" label="Invoiced" time="—" state="todo" last />
        </View>

        {/* Line items */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.cardTitle}>Line items</Text>
            <Text style={styles.lineCount}>{lines.length} lines</Text>
          </View>
          {loading ? (
            <Skel h={200} r={16} />
          ) : (
            <View style={styles.card2}>
              {lines.map((l, i) => {
                const [fk, fl] = FILL_META[l.fill || 'full'];
                return (
                  <View key={l.code} style={[styles.line, { borderBottomWidth: i < lines.length - 1 ? 1 : 0 }]}>
                    <View style={styles.lineQty}>
                      <Text style={styles.lineQtyNum}>{l.qty}</Text>
                      <Text style={styles.lineUom}>{l.uom}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.lineDesc}>{l.desc}</Text>
                      <Text style={styles.lineCode}>{l.code} · @ ${l.price}/{l.uom.toLowerCase()}</Text>
                      <View style={{ marginTop: 7 }}><StatusPill kind={fk} size="sm">{fl}</StatusPill></View>
                    </View>
                    <Text style={styles.lineExt}>${l.ext}</Text>
                  </View>
                );
              })}
              {/* Totals */}
              <View style={styles.totals}>
                {[['Subtotal', '$1,824.32'], ['Freight', '$85.00'], ['Tax (7%)', '$133.61']].map(([k, v]) => (
                  <View key={k} style={styles.totalRow}>
                    <Text style={styles.totalKey}>{k}</Text>
                    <Text style={styles.totalVal}>{v}</Text>
                  </View>
                ))}
                <View style={styles.grandRow}>
                  <Text style={styles.grandKey}>Order total</Text>
                  <Text style={styles.grandVal}>{order?.total || '$2,042.93'}</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Actions */}
        <BigButtonRow>
          <BigButton kind="secondary" icon="fileText" style={styles.actBtn} onPress={() => router.push('/(sales)/new-quote')}>Copy to Quote</BigButton>
          <BigButton kind="primary" icon="phone" style={styles.actBtn}>Call yard</BigButton>
        </BigButtonRow>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  scroll: { paddingBottom: 30 },
  header: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.line },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  cust: { fontSize: 20, fontWeight: '800', color: C.text },
  ship: { fontSize: 13.5, color: C.text3, marginTop: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: { flexDirection: 'row', backgroundColor: C.surface2, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  chipKey: { fontSize: 12, fontWeight: '600', color: C.text4 },
  chipVal: { fontSize: 12, fontWeight: '700', color: C.text2, fontFamily: MONO },
  card: { backgroundColor: '#fff', marginHorizontal: 14, marginTop: 14, borderRadius: 16, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  section: { marginHorizontal: 14, marginTop: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2, paddingBottom: 9 },
  lineCount: { fontSize: 12.5, color: C.text3, fontFamily: MONO },
  card2: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: 'hidden' },
  // timeline
  tlStep: { flexDirection: 'row', gap: 13, position: 'relative' },
  tlLine: { position: 'absolute', left: 15, top: 32, bottom: -6, width: 2 },
  tlDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  tlDotActive: { shadowColor: S.picking, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 2 },
  tlBody: { flex: 1, paddingBottom: 18 },
  tlLabel: { fontSize: 15 },
  tlTime: { fontSize: 12.5, marginTop: 1 },
  // lines
  line: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 12, borderBottomColor: C.lineSoft },
  lineQty: { minWidth: 52, alignItems: 'flex-end' },
  lineQtyNum: { fontSize: 17, fontWeight: '800', color: C.text, fontFamily: MONO },
  lineUom: { fontSize: 10.5, fontWeight: '700', color: C.text4, letterSpacing: 0.4, marginTop: 2 },
  lineDesc: { fontSize: 14, fontWeight: '700', color: C.text, lineHeight: 18 },
  lineCode: { fontSize: 11.5, color: C.text3, fontFamily: MONO, marginTop: 2 },
  lineExt: { fontSize: 15, fontWeight: '800', color: C.text, fontFamily: MONO },
  totals: { paddingHorizontal: 14, paddingVertical: 12, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalKey: { fontSize: 13.5, color: C.text3 },
  totalVal: { fontSize: 13.5, fontWeight: '600', color: C.text2, fontFamily: MONO },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 9, marginTop: 6, borderTopWidth: 1, borderTopColor: C.line },
  grandKey: { fontSize: 15, fontWeight: '800', color: C.text },
  grandVal: { fontSize: 19, fontWeight: '800', color: C.green, fontFamily: MONO },
  actBtn: { flex: 1, height: 50 },
});
