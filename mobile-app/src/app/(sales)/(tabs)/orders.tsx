import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { C, S } from '@/theme/colors';
import { Icon, IconName } from '@/components/ui/Icon';
import { SalesTopBar, SearchBar, SegTabs, StatusPill, ListRow, SkelRow, MONO } from '@/components/sales/kit';
import { fetchOrders, SalesOrder, OrderStatus, ORDER_STATUS_LABEL } from '@/data/salesMock';

const FILTERS = ['All', 'Open', 'Picking', 'Staged', 'Out for Delivery', 'Invoiced'];
const FILTER_TO_STATUS: Record<string, OrderStatus | null> = {
  All: null, Open: 'open', Picking: 'picking', Staged: 'staged', 'Out for Delivery': 'delivery', Invoiced: 'invoiced',
};
const STATUS_ICON: Record<OrderStatus, IconName> = {
  open: 'package', picking: 'package', staged: 'box', delivery: 'truck', invoiced: 'fileText',
};

export default function OrdersScreen() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [all, setAll] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => { setLoading(true); setAll(await fetchOrders()); setLoading(false); })();
  }, []);

  const orders = useMemo(() => {
    const status = FILTER_TO_STATUS[filter];
    const q = query.trim().toLowerCase();
    return all.filter((o) =>
      (!status || o.status === status) &&
      (!q || o.so.toLowerCase().includes(q) || o.cust.toLowerCase().includes(q)),
    );
  }, [all, filter, query]);

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar title="Orders" />
      <View style={styles.head}>
        <SearchBar editable value={query} onChangeText={setQuery} placeholder="Search SO#, customer, PO#…" />
        <View style={{ marginTop: 12 }}>
          <SegTabs tabs={FILTERS} active={filter} onSelect={setFilter} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <View style={styles.metaRow}>
          <Text style={styles.count}>This week · {all.length} orders</Text>
          <TouchableOpacity style={styles.filterBtn} activeOpacity={0.7}>
            <Icon name="sliders" size={15} color={C.text2} />
            <Text style={styles.filterText}>Filter</Text>
          </TouchableOpacity>
        </View>
        {loading ? (
          <View style={{ gap: 10 }}><SkelRow /><SkelRow /><SkelRow /></View>
        ) : (
          <View style={styles.card}>
            {orders.map((o, i) => {
              const accent = S[o.status];
              return (
                <ListRow
                  key={o.so}
                  last={i === orders.length - 1}
                  onPress={() => router.push(`/(sales)/order/${o.so}`)}
                  leading={<View style={[styles.icon, { backgroundColor: accent + '14' }]}><Icon name={STATUS_ICON[o.status]} size={21} color={accent} strokeWidth={2.1} /></View>}
                  title={o.cust}
                  sub={<Text style={styles.mono}>SO# {o.so} · {o.date} · {o.items} items</Text>}
                  meta={
                    <View style={styles.rowMeta}>
                      <StatusPill kind={o.status} size="sm">{ORDER_STATUS_LABEL[o.status]}</StatusPill>
                      <Text style={styles.total}>{o.total}</Text>
                    </View>
                  }
                  trailing={<Icon name="chevronRight" size={20} color={C.text4} />}
                />
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  head: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  list: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 24 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 10 },
  count: { fontSize: 13, fontWeight: '700', color: C.text3 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10 },
  filterText: { fontSize: 13, fontWeight: '700', color: C.text2 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: 'hidden' },
  icon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mono: { fontFamily: MONO, fontSize: 12.5, color: C.text3 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  total: { fontSize: 13.5, fontWeight: '800', color: C.text, fontFamily: MONO },
});
