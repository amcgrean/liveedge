import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useOnline } from '@/hooks/useOnline';
import { useOutbox } from '@/storage/outbox';
import { C, S, BRANCHES, BranchCode } from '@/theme/colors';
import { Icon, IconName } from '@/components/ui/Icon';
import {
  SalesTopBar, SearchBar, KPITile, LiveBadge, ListRow, StatusPill, Monogram,
  Skel, SkelRow, MONO,
} from '@/components/sales/kit';
import {
  MOCK_RECENT_ORDERS, MOCK_CUSTOMERS, ORDER_STATUS_LABEL, SalesOrder, fetchOrders,
} from '@/data/salesMock';
import { format } from 'date-fns';

function ActionButton({ icon, label, primary, onPress }: { icon: IconName; label: string; primary?: boolean; onPress?: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.action, { backgroundColor: primary ? C.green : '#fff', borderColor: primary ? C.green : C.line }]}
    >
      <Icon name={icon} size={23} color={primary ? '#fff' : C.green} strokeWidth={2.2} />
      <Text style={[styles.actionLabel, { color: primary ? '#fff' : C.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SectionLabel({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabel}>{children}</Text>
      {action && <TouchableOpacity onPress={onAction}><Text style={styles.sectionAction}>{action}</Text></TouchableOpacity>}
    </View>
  );
}

export default function SalesHomeScreen() {
  const { user } = useAuth();
  const online = useOnline();
  const outboxItems = useOutbox();
  const queue = outboxItems.filter((i) => i.status !== 'synced').length;

  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState<SalesOrder[]>([]);

  const branchCode = (user?.branch || '20GR') as BranchCode;
  const branch = BRANCHES.find((b) => b.code === branchCode);
  const firstName = user?.name?.split(' ')[0] || 'there';
  const today = format(new Date(), "EEE · MMM d");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await fetchOrders();
        setRecent(MOCK_RECENT_ORDERS);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const kpis = [
    { value: '14', label: 'Open orders', icon: 'clipboard' as IconName, accent: C.green },
    { value: '6', label: 'Open quotes', icon: 'fileText' as IconName, accent: S.draft },
    { value: '23', label: 'Orders today', icon: 'package' as IconName, accent: S.blue, sub: 'across yard' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar
        branchLabel={`${branchCode} · ${branch?.name}`}
        branchDot={branch?.dot}
        online={online}
        queue={queue}
        onSearch={() => router.push('/(sales)/customers')}
        onBranch={() => router.push('/(auth)/branch-select')}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Greeting */}
        <View style={styles.greetRow}>
          <View>
            <Text style={styles.greet}>Good day, {firstName}</Text>
            <Text style={styles.greetSub}>{today} · 4 yards live</Text>
          </View>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(user?.name || 'RV').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}</Text></View>
        </View>

        {/* Hero search */}
        <SearchBar big placeholder="Search customers, orders, items…" onPress={() => router.push('/(sales)/customers')} />

        {/* Primary actions */}
        <View style={styles.actions}>
          <ActionButton icon="fileText" label="New Quote" primary onPress={() => router.push('/(sales)/new-quote')} />
          <ActionButton icon="plusCircle" label="New Order" onPress={() => router.push('/(sales)/new-order')} />
          <ActionButton icon="tag" label="Price Check" onPress={() => router.push('/(sales)/items')} />
        </View>

        {/* KPIs */}
        <View style={styles.section}>
          <SectionLabel>MY DAY</SectionLabel>
          {loading ? (
            <View style={styles.kpiRow}><Skel h={96} r={16} style={{ flex: 1 }} /><Skel h={96} r={16} style={{ flex: 1 }} /><Skel h={96} r={16} style={{ flex: 1 }} /></View>
          ) : (
            <View style={styles.kpiRow}>
              {kpis.map((k) => <KPITile key={k.label} {...k} />)}
            </View>
          )}
        </View>

        {/* Recent customers */}
        <View style={styles.section}>
          <SectionLabel action="See all" onAction={() => router.push('/(sales)/customers')}>RECENT CUSTOMERS</SectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {MOCK_CUSTOMERS.slice(0, 4).map((c) => (
              <TouchableOpacity key={c.code} activeOpacity={0.8} onPress={() => router.push(`/(sales)/customer/${c.code}`)} style={styles.custCard}>
                <Monogram text={c.mono} size={44} color={c.tone} />
                <Text style={styles.custName} numberOfLines={2}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Recent orders */}
        <View style={styles.section}>
          <SectionLabel action="All orders" onAction={() => router.push('/(sales)/orders')}>RECENT ORDERS</SectionLabel>
          {loading ? (
            <View style={{ gap: 10 }}><SkelRow /><SkelRow /><SkelRow /></View>
          ) : (
            <View style={styles.card}>
              {recent.map((o, i) => (
                <ListRow
                  key={o.so}
                  last={i === recent.length - 1}
                  onPress={() => router.push(`/(sales)/order/${o.so}`)}
                  leading={<View style={styles.orderIcon}><Icon name="clipboard" size={20} color={C.text3} /></View>}
                  title={o.cust}
                  sub={<Text style={styles.mono}>SO# {o.so} · {o.date}</Text>}
                  meta={
                    <View style={styles.metaRow}>
                      <StatusPill kind={o.status} size="sm">{ORDER_STATUS_LABEL[o.status]}</StatusPill>
                      <Text style={styles.total}>{o.total}</Text>
                    </View>
                  }
                  trailing={<Icon name="chevronRight" size={20} color={C.text4} />}
                />
              ))}
            </View>
          )}
        </View>

        {loading && (
          <View style={styles.fetchRow}>
            <Icon name="refresh" size={14} color={C.text4} />
            <Text style={styles.fetchText}>Fetching live data from ERP…</Text>
          </View>
        )}
        {!loading && (
          <View style={styles.fetchRow}><LiveBadge label="Live ERP" ago="just now" /></View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  scroll: { padding: 16, paddingBottom: 40 },
  greetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  greet: { fontSize: 24, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  greetSub: { fontSize: 13.5, color: C.text3, marginTop: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  action: { flex: 1, height: 76, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 7 },
  actionLabel: { fontSize: 12.5, fontWeight: '700' },
  section: { marginTop: 22 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2, paddingBottom: 10 },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: C.text3, letterSpacing: 0.8 },
  sectionAction: { fontSize: 13.5, fontWeight: '700', color: C.green },
  kpiRow: { flexDirection: 'row', gap: 10 },
  custCard: { width: 96, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 9 },
  custName: { fontSize: 12, fontWeight: '700', color: C.text2, textAlign: 'center', lineHeight: 15 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: 'hidden' },
  orderIcon: { width: 44, height: 44, borderRadius: 11, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mono: { fontFamily: MONO, fontSize: 12.5, color: C.text3 },
  total: { fontSize: 13, fontWeight: '800', color: C.text, fontFamily: MONO },
  fetchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 22 },
  fetchText: { fontSize: 12.5, color: C.text3, fontWeight: '600' },
});
