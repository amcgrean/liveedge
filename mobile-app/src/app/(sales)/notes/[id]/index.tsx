import React, { useEffect, useState } from 'react';
import { Image, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { C } from '@/theme/colors';
import { SalesTopBar, Skel, StatusPill, MONO } from '@/components/sales/kit';
import { JobNote, jobNotesApi } from '@/api/jobNotes';
import { fetchJobNote } from '@/data/jobNotesMock';

const TYPE_LABEL: Record<string, string> = { site_visit: 'Site visit', spec_meeting: 'Spec meeting', measure: 'Measure', general: 'General' };

export default function JobNoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [note, setNote] = useState<JobNote>();
  const [photos, setPhotos] = useState<{ key: string; url: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const found = await fetchJobNote(String(id));
        setNote(found);
        if (found?.photo_keys.length) setPhotos(await jobNotesApi.photos(found.id).catch(() => []));
      } finally { setLoading(false); }
    })();
  }, [id]);

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar title="Job Note" back="Notes" onBack={() => router.back()} />
      {loading || !note ? <View style={styles.pad}><Skel h={220} r={16} /></View> : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <View style={styles.row}><StatusPill kind="info">{TYPE_LABEL[note.note_type]}</StatusPill><Text style={styles.date}>{new Date(note.created_at).toLocaleString()}</Text></View>
            <Text style={styles.body}>{note.body || 'No note body'}</Text>
            <Text style={styles.meta}>{note.customer_name || note.customer_code || 'Prospect'}{note.so_id ? ` · SO ${note.so_id}` : ''}</Text>
            {note.address_label ? <Text style={styles.meta}>{note.address_label}</Text> : null}
            <Text style={styles.author}>By {note.author_name || 'Sales rep'}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.title}>Photos</Text>
            <View style={styles.photos}>{photos.map((p) => <TouchableOpacity key={p.key} onPress={() => Linking.openURL(p.url)}><Image source={{ uri: p.url }} style={styles.photo} /></TouchableOpacity>)}</View>
            {photos.length === 0 ? <Text style={styles.empty}>No photos attached.</Text> : null}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface }, pad: { padding: 14 }, scroll: { padding: 14, gap: 14 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  date: { color: C.text3, fontFamily: MONO, fontSize: 12 },
  body: { marginTop: 16, fontSize: 17, lineHeight: 25, color: C.text, fontWeight: '600' },
  meta: { marginTop: 10, color: C.text3, fontWeight: '700' },
  author: { marginTop: 14, color: C.text4, fontSize: 12 },
  title: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 12 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, photo: { width: 104, height: 104, borderRadius: 14, backgroundColor: C.surface2 }, empty: { color: C.text4 },
});
