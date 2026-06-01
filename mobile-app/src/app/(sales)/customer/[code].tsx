import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { C } from '@/theme/colors';
import { Icon } from '@/components/ui/Icon';
import {
  SalesTopBar, SegTabs, StatusPill, Monogram, LiveBadge, EmptyState, Skel, MONO,
} from '@/components/sales/kit';
import {
  fetchCustomerDetail, SalesCustomer, SalesOrder, ORDER_STATUS_LABEL,
} from '@/data/salesMock';

const TABS = ['Open Orders', 'History', 'Ship-To', 'Contact'];

export default function CustomerDetailScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [cust, setCust] = useState<SalesCustomer | undefined>();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [tab, setTab] = useState('Open Orders');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const detail = await fetchCustomerDetail(String(code));
        setCust(detail.customer);
        setOrders(detail.orders);
      } finally {
        setLoading(false);
      }
    })();
  }, [code]);

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar back="Customers" title={cust?.name || String(code)} onBack={() => router.back()} />

      {/* Identity header */}
      <View style={styles.header}>
        <View style={styles.idRow}>
          <Monogram text={cust?.mono || '··'} size={54} color={cust?.tone || C.green} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name}>{cust?.name || String(code)}</Text>
            <View style={styles.idMeta}>
              <Text style={styles.code}>{cust?.code || code}</Text>
              {cust?.tag && <View style={styles.tag}><Text style={styles.tagText}>{cust.tag}</Text></View>}
            </View>
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/(sales)/new-quote')} style={[styles.actionBtn, styles.actionPrimary]}>
            <Icon name="fileText" size={18} color="#fff" strokeWidth={2.3} />
            <Text style={styles.actionPrimaryText}>New Quote</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/(sales)/new-order')} style={[styles.actionBtn, styles.actionSecondary]}>
            <Icon name="plusCircle" size={18} color={C.green} strokeWidth={2.2} />
            <Text style={styles.actionSecondaryText}>New Order</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} style={[styles.actionSquare]}>
            <Icon name="phone" size={19} color={C.text2} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsWrap}>
        <SegTabs tabs={TABS} active={tab} onSelect={setTab} />
      </View>

      {loading ? (
        <View style={{ padding: 14, gap: 10 }}><Skel h={92} r={14} /><Skel h={92} r={14} /></View>
      ) : tab !== 'Open Orders' ? (
        <EmptyState icon="info" title={`${tab} coming soon`} body={`This tab is wired to live ERP data when the backend lands. ${tab} for ${cust?.name || 'this customer'} will appear here.`} />
      ) : orders.length === 0 ? (
        <EmptyState icon="clipboard" title="No open orders" body={`${cust?.name || 'This customer'} has no orders in progress right now. Start a quote or order to get going.`} cta="New Quote" ctaIcon="fileText" onCta={() => router.push('/(sales)/new-quote')} />
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <View style={styles.metaRow}>
            <Text style={styles.count}>{orders.length} open orders</Text>
            <LiveBadge label="Live" ago="8s ago" />
          </View>
          {orders.map((o) => (
            <TouchableOpacity key={o.so} activeOpacity={0.8} onPress={() => router.push(`/(sales)/order/${o.so}`)} style={styles.orderCard}>
              <View style={styles.orderTop}>
                <Text style={styles.orderSo}>SO# {o.so}</Text>
                <StatusPill kind={o.status} size="sm">{ORDER_STATUS_LABEL[o.status]}</StatusPill>
              </View>
              <Text style={styles.orderMeta}>{o.date} · {o.items} items · {o.ship}</Text>
              <View style={styles.orderBottom}>
                <Text style={styles.orderTotal}>{o.total}</Text>
                <View style={styles.statusLink}>
                  <Text style={styles.statusLinkText}>Status</Text>
                  <Icon name="chevronRight" size={17} color={C.green} />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  header: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  idRow: { flexDirection: 'row', gap: 13, alignItems: 'center' },
  name: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.2 },
  idMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  code: { fontSize: 12.5, fontWeight: '700', color: C.text3, fontFamily: MONO },
  tag: { backgroundColor: C.surface2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagText: { fontSize: 11, fontWeight: '700', color: C.text3 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 14 },
  actionBtn: { flex: 1, height: 44, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  actionPrimary: { backgroundColor: C.green },
  actionPrimaryText: { fontSize: 14.5, fontWeight: '700', color: '#fff' },
  actionSecondary: { borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff' },
  actionSecondaryText: { fontSize: 14.5, fontWeight: '700', color: C.text },
  actionSquare: { width: 44, height: 44, borderRadius: 11, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  tabsWrap: { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  list: { padding: 14, gap: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingBottom: 4 },
  count: { fontSize: 13, fontWeight: '700', color: C.text3 },
  orderCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14 },
  orderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  orderSo: { fontSize: 13.5, fontWeight: '800', color: C.text, fontFamily: MONO },
  orderMeta: { fontSize: 13.5, color: C.text3, marginTop: 9 },
  orderBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.lineSoft },
  orderTotal: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: MONO },
  statusLink: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statusLinkText: { fontSize: 13.5, fontWeight: '700', color: C.green },
});
