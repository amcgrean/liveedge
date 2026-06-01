import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { C } from '@/theme/colors';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, SalesTopBar, SegTabs, Skel, StatusPill, MONO } from '@/components/sales/kit';
import { JobNote } from '@/api/jobNotes';
import { fetchJobNotes } from '@/data/jobNotesMock';

const TYPE_LABEL: Record<string, string> = { site_visit: 'Site visit', spec_meeting: 'Spec meeting', measure: 'Measure', general: 'General' };

export default function JobNotesScreen() {
  const params = useLocalSearchParams<{ customer?: string; so?: string; name?: string }>();
  const [tab, setTab] = useState('All');
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setNotes(await fetchJobNotes({ customer: params.customer, so: params.so, mine: tab === 'Mine' }));
      } finally { setLoading(false); }
    })();
  }, [params.customer, params.so, tab]);

  const title = params.so ? `SO ${params.so} Notes` : params.customer ? 'Customer Notes' : 'Job Notes';
  const addHref = `/(sales)/notes/edit?${new URLSearchParams({ customer: params.customer ?? '', so: params.so ?? '', name: params.name ?? '' }).toString()}`;

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar title={title} back={params.customer || params.so ? 'Back' : undefined} onBack={() => router.back()} />
      <View style={styles.tabs}><SegTabs tabs={['All', 'Mine']} active={tab} onSelect={setTab} /></View>
      {loading ? <View style={styles.pad}><Skel h={88} r={14} /><Skel h={88} r={14} /></View> : notes.length === 0 ? (
        <EmptyState icon="fileText" title="No job notes yet" body="Capture trim specs, measures, and meeting notes from the field. Notes can be saved before an SO exists." cta="Add note" ctaIcon="plus" onCta={() => router.push(addHref as any)} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {notes.map((n) => (
            <TouchableOpacity key={n.id} style={styles.card} activeOpacity={0.82} onPress={() => router.push(`/(sales)/notes/${n.id}` as any)}>
              <View style={styles.row}>
                <StatusPill kind="info" size="sm">{TYPE_LABEL[n.note_type]}</StatusPill>
                <Text style={styles.date}>{new Date(n.created_at).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.body} numberOfLines={2}>{n.body || 'No note body'}</Text>
              <Text style={styles.meta} numberOfLines={1}>{n.customer_name || n.customer_code || 'Prospect'}{n.so_id ? ` · SO ${n.so_id}` : ''}{n.address_label ? ` · ${n.address_label}` : ''}</Text>
              <View style={styles.foot}><Icon name="camera" size={15} color={C.text4} /><Text style={styles.photo}>{n.photo_keys.length} photos</Text></View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <TouchableOpacity style={styles.fab} onPress={() => router.push(addHref as any)}><Icon name="plus" color="#fff" size={26} /></TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  tabs: { backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  pad: { padding: 14, gap: 10 },
  list: { padding: 14, gap: 10, paddingBottom: 90 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { color: C.text3, fontSize: 12, fontFamily: MONO },
  body: { marginTop: 10, fontSize: 15, lineHeight: 21, fontWeight: '650', color: C.text },
  meta: { marginTop: 8, fontSize: 12.5, color: C.text3 },
  foot: { marginTop: 10, flexDirection: 'row', gap: 5, alignItems: 'center' },
  photo: { fontSize: 12, color: C.text4, fontWeight: '700' },
  fab: { position: 'absolute', right: 18, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
});
