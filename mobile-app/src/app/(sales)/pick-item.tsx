import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { C, S } from '@/theme/colors';
import { Icon } from '@/components/ui/Icon';
import { BigButton } from '@/components/ui/BigButton';
import { SalesTopBar, SearchBar, SkelRow, MONO } from '@/components/sales/kit';
import { fetchItems, SalesItem, StockState } from '@/data/salesMock';
import { useDraft } from '@/context/DraftContext';

const STOCK_C: Record<StockState, string> = { in: C.ok, low: C.warn, out: C.err };

// Modal picker — search items and add them to the draft. Stays open so the rep
// can add several; "Done" returns to the create screen. Shows a live count of
// what's already on the draft.
export default function PickItemScreen() {
  const { lines, addItem } = useDraft();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SalesItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await fetchItems(query);
      if (!cancelled) { setItems(r); setLoading(false); }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const add = (it: SalesItem) => {
    addItem(it, 1);
    setJustAdded(it.code);
    setTimeout(() => setJustAdded((c) => (c === it.code ? null : c)), 1200);
  };

  const lineCount = lines.length;

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar back="Done" title="Add Items" onBack={() => router.back()} />
      <View style={styles.searchWrap}>
        <SearchBar editable autoFocus value={query} onChangeText={setQuery} placeholder="Search item # or description…" scope={query ? 'ITEM' : undefined} />
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={{ gap: 10 }}><SkelRow /><SkelRow /><SkelRow /></View>
        ) : (
          <View style={styles.card}>
            {items.map((it, i) => {
              const onDraft = lines.find((l) => l.code === it.code);
              const added = justAdded === it.code;
              return (
                <View key={it.code} style={[styles.row, { borderBottomWidth: i < items.length - 1 ? 1 : 0 }]}>
                  <View style={styles.itemIcon}><Icon name="box" size={20} color={C.text3} strokeWidth={2} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.desc} numberOfLines={2}>{it.desc}</Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.code}>{it.code}</Text>
                      <View style={[styles.stockDot, { backgroundColor: STOCK_C[it.stock] }]} />
                      {it.price !== '—' && <Text style={styles.price}>${it.price}/{it.uom}</Text>}
                      {onDraft && <Text style={styles.onDraft}>· {onDraft.qty} on draft</Text>}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => add(it)}
                    activeOpacity={0.8}
                    style={[styles.addBtn, added && styles.addBtnDone]}
                  >
                    <Icon name={added ? 'check' : 'plus'} size={20} color={added ? '#fff' : C.green} strokeWidth={2.6} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <BigButton kind="primary" icon="check" onPress={() => router.back()}>
          {lineCount > 0 ? `Done · ${lineCount} item${lineCount > 1 ? 's' : ''}` : 'Done'}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  searchWrap: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  list: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 24 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderBottomColor: C.lineSoft },
  itemIcon: { width: 42, height: 42, borderRadius: 11, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  desc: { fontSize: 14.5, fontWeight: '700', color: C.text, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  code: { fontSize: 11.5, color: C.text3, fontFamily: MONO },
  stockDot: { width: 7, height: 7, borderRadius: 4 },
  price: { fontSize: 12, color: C.text2, fontFamily: MONO },
  onDraft: { fontSize: 12, color: C.green, fontWeight: '700' },
  addBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, borderColor: C.green, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  addBtnDone: { backgroundColor: S.staged, borderColor: S.staged },
  footer: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 30, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
});
