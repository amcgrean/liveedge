import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { C } from '@/theme/colors';
import { Icon } from '@/components/ui/Icon';
import {
  SalesTopBar, SearchBar, LiveBadge, ListRow, Monogram, EmptyState, SkelRow, MONO,
} from '@/components/sales/kit';
import { fetchCustomers, SalesCustomer } from '@/data/salesMock';

export default function CustomersScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SalesCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await fetchCustomers(query);
      if (!cancelled) { setResults(r); setLoading(false); }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar title="Customers" />
      <View style={styles.searchWrap}>
        <SearchBar editable value={query} onChangeText={setQuery} placeholder="Search customers…" scope={query ? 'NAME' : undefined} />
      </View>

      {loading ? (
        <View style={styles.list}><SkelRow /><SkelRow /><SkelRow /></View>
      ) : results.length === 0 ? (
        <EmptyState
          icon="search"
          title="No customers found"
          body={`Nothing matches “${query}”. Check spelling, or search by account # — or add them as a new customer.`}
          cta="New Customer"
          ctaIcon="plus"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <View style={styles.metaRow}>
            <Text style={styles.matchCount}>{results.length} matches</Text>
            <LiveBadge label="Live ERP" ago="just now" />
          </View>
          <View style={styles.card}>
            {results.map((r, i) => (
              <ListRow
                key={r.code}
                last={i === results.length - 1}
                onPress={() => router.push(`/(sales)/customer/${r.code}`)}
                leading={<Monogram text={r.mono} size={46} color={r.tone} />}
                title={r.name}
                sub={<Text style={styles.sub}><Text style={styles.mono}>{r.code}</Text> · {r.city}</Text>}
                meta={
                  <View style={styles.rowMeta}>
                    <View style={styles.tag}><Text style={styles.tagText}>{r.tag}</Text></View>
                    {r.openOrders > 0
                      ? <Text style={styles.open}>{r.openOrders} open order{r.openOrders > 1 ? 's' : ''}</Text>
                      : <Text style={styles.noOpen}>No open orders</Text>}
                  </View>
                }
                trailing={<Icon name="chevronRight" size={20} color={C.text4} />}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  searchWrap: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  list: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 24, gap: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 10 },
  matchCount: { fontSize: 13, fontWeight: '700', color: C.text3 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: 'hidden' },
  sub: { fontSize: 13.5, color: C.text3 },
  mono: { fontFamily: MONO, fontSize: 12.5 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { backgroundColor: C.surface2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagText: { fontSize: 11, fontWeight: '700', color: C.text3 },
  open: { fontSize: 12, fontWeight: '700', color: C.green },
  noOpen: { fontSize: 12, fontWeight: '600', color: C.text4 },
});
