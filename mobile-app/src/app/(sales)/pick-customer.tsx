import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { C } from '@/theme/colors';
import { Icon } from '@/components/ui/Icon';
import { SalesTopBar, SearchBar, ListRow, Monogram, EmptyState, SkelRow, MONO } from '@/components/sales/kit';
import { fetchCustomers, SalesCustomer } from '@/data/salesMock';
import { useDraft } from '@/context/DraftContext';

// Modal picker — choose the customer for the in-progress quote/order draft.
export default function PickCustomerScreen() {
  const { setCustomer } = useDraft();
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

  const choose = (c: SalesCustomer) => {
    setCustomer(c);
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar back="Cancel" title="Choose Customer" onBack={() => router.back()} />
      <View style={styles.searchWrap}>
        <SearchBar editable autoFocus value={query} onChangeText={setQuery} placeholder="Search customers…" scope={query ? 'NAME' : undefined} />
      </View>

      {loading ? (
        <View style={styles.list}><SkelRow /><SkelRow /><SkelRow /></View>
      ) : results.length === 0 ? (
        <EmptyState icon="search" title="No customers found" body={`Nothing matches “${query}”. Check spelling or search by account #.`} />
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            {results.map((r, i) => (
              <ListRow
                key={r.code}
                last={i === results.length - 1}
                onPress={() => choose(r)}
                leading={<Monogram text={r.mono} size={46} color={r.tone} />}
                title={r.name}
                sub={<Text style={styles.sub}><Text style={styles.mono}>{r.code}</Text>{r.city ? ` · ${r.city}` : ''}</Text>}
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
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: 'hidden' },
  sub: { fontSize: 13.5, color: C.text3 },
  mono: { fontFamily: MONO, fontSize: 12.5 },
});
