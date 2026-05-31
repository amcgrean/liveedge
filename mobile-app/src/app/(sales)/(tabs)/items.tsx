import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { C, BRANCHES, BranchCode } from '@/theme/colors';
import { Icon } from '@/components/ui/Icon';
import { SalesTopBar, SearchBar, LiveBadge, SkelRow, MONO } from '@/components/sales/kit';
import { fetchItems, SalesItem, StockState } from '@/data/salesMock';

const STOCK_META: Record<StockState, [string, string]> = {
  in: [C.ok, 'In stock'], low: [C.warn, 'Low'], out: [C.err, 'Out'],
};

export default function ItemsScreen() {
  const { user } = useAuth();
  const branchCode = (user?.branch || '20GR') as BranchCode;
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SalesItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await fetchItems(query);
      if (!cancelled) { setItems(r); setLoading(false); }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar title="Price & Availability" />
      <View style={styles.head}>
        <SearchBar editable value={query} onChangeText={setQuery} placeholder="Search item # or description…" scope={query ? 'ITEM' : undefined} />
      </View>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <View style={styles.metaRow}>
          <Text style={styles.count}>{items.length} items · prices for {branchCode}</Text>
          <LiveBadge label="Live ERP" ago="3s ago" />
        </View>
        {loading ? (
          <View style={{ gap: 10 }}><SkelRow /><SkelRow /><SkelRow /></View>
        ) : (
          <View style={styles.card}>
            {items.map((it, i) => {
              const [sc, sl] = STOCK_META[it.stock];
              return (
                <TouchableOpacity
                  key={it.code}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/(sales)/item/${it.code}`)}
                  style={[styles.row, { borderBottomWidth: i < items.length - 1 ? 1 : 0 }]}
                >
                  <View style={styles.itemIcon}><Icon name="box" size={21} color={C.text3} strokeWidth={2} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.desc} numberOfLines={2}>{it.desc}</Text>
                    <Text style={styles.code}>{it.code}</Text>
                    <View style={styles.stockRow}>
                      <View style={styles.stockChip}>
                        <View style={[styles.stockDot, { backgroundColor: sc }]} />
                        <Text style={[styles.stockText, { color: sc }]}>{sl}</Text>
                      </View>
                      {it.stock !== 'out' && <Text style={styles.onhand}>{it.onhand.toLocaleString()} {it.uom}</Text>}
                    </View>
                  </View>
                  <View style={styles.priceCol}>
                    <Text style={styles.price}>${it.price}</Text>
                    <Text style={styles.priceUom}>/{it.uom}</Text>
                  </View>
                </TouchableOpacity>
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
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderBottomColor: C.lineSoft },
  itemIcon: { width: 46, height: 46, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  desc: { fontSize: 15, fontWeight: '700', color: C.text, lineHeight: 19 },
  code: { fontSize: 11.5, color: C.text3, fontFamily: MONO, marginTop: 2 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  stockChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stockDot: { width: 7, height: 7, borderRadius: 4 },
  stockText: { fontSize: 12, fontWeight: '700' },
  onhand: { fontSize: 12, color: C.text3, fontFamily: MONO },
  priceCol: { alignItems: 'flex-end' },
  price: { fontSize: 17, fontWeight: '800', color: C.text, fontFamily: MONO },
  priceUom: { fontSize: 10.5, fontWeight: '700', color: C.text4 },
});
