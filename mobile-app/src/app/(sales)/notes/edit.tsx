import React, { useState } from 'react';
import { Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { C } from '@/theme/colors';
import { SalesTopBar, SegTabs, StatusPill } from '@/components/sales/kit';
import { BigButton } from '@/components/ui/BigButton';
import { JobNoteType } from '@/api/jobNotes';
import { queueJobNote } from '@/data/jobNotesMock';
import { savePhotoForJobNote } from '@/storage/photoFS';

const TYPE_TABS: { label: string; value: JobNoteType }[] = [
  { label: 'Site visit', value: 'site_visit' }, { label: 'Spec meeting', value: 'spec_meeting' }, { label: 'Measure', value: 'measure' }, { label: 'General', value: 'general' },
];

export default function EditJobNoteScreen() {
  const params = useLocalSearchParams<{ customer?: string; so?: string; name?: string }>();
  const [typeLabel, setTypeLabel] = useState('General');
  const [body, setBody] = useState('');
  const [customer, setCustomer] = useState(params.customer ?? '');
  const [customerName, setCustomerName] = useState(params.name ?? '');
  const [so, setSo] = useState(params.so ?? '');
  const [address, setAddress] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const addPhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.82 });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const save = async () => {
    const noteType = TYPE_TABS.find((t) => t.label === typeLabel)?.value ?? 'general';
    setSaving(true);
    try {
      const savedPhotos = await Promise.all(photos.map((uri) => savePhotoForJobNote(uri)));
      await queueJobNote({
        customer_code: customer || null,
        customer_name: customerName || null,
        so_id: so || null,
        address_label: address || null,
        note_type: noteType,
        body,
        fields: {},
      }, savedPhotos);
      Alert.alert('Queued', 'Job note is saved to the offline outbox and will sync when online.');
      router.back();
    } catch (err) {
      Alert.alert('Could not queue note', err instanceof Error ? err.message : 'Try again.');
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar title="Add Job Note" back="Notes" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.label}>Note type</Text>
          <SegTabs tabs={TYPE_TABS.map((t) => t.label)} active={typeLabel} onSelect={setTypeLabel} />
          <Text style={styles.label}>Note</Text>
          <TextInput style={styles.bodyInput} multiline placeholder="Walk notes, trim specs, measure details…" value={body} onChangeText={setBody} textAlignVertical="top" />
          <Text style={styles.label}>Customer / prospect</Text>
          <TextInput style={styles.input} placeholder="Customer code (optional)" value={customer} onChangeText={setCustomer} autoCapitalize="characters" />
          <TextInput style={styles.input} placeholder="Customer/prospect name" value={customerName} onChangeText={setCustomerName} />
          <TextInput style={styles.input} placeholder="SO number (optional)" value={so} onChangeText={setSo} autoCapitalize="characters" />
          <TextInput style={styles.input} placeholder="Address / lot label" value={address} onChangeText={setAddress} />
        </View>

        <View style={styles.card}>
          <View style={styles.photoHead}><Text style={styles.labelNoMargin}>Photos</Text><StatusPill kind="queued" size="sm">Queued upload</StatusPill></View>
          <View style={styles.photos}>{photos.map((uri) => <Image key={uri} source={{ uri }} style={styles.thumb} />)}</View>
          <TouchableOpacity style={styles.photoBtn} onPress={addPhoto}><Text style={styles.photoBtnText}>+ Capture photo</Text></TouchableOpacity>
        </View>

        <BigButton kind="primary" icon="send" disabled={saving} onPress={save}>{saving ? 'Queueing…' : 'Save draft to outbox'}</BigButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  scroll: { padding: 14, gap: 14, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14, gap: 10 },
  label: { marginTop: 6, fontSize: 13, fontWeight: '800', color: C.text3, textTransform: 'uppercase' },
  labelNoMargin: { fontSize: 13, fontWeight: '800', color: C.text3, textTransform: 'uppercase' },
  input: { minHeight: 46, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, color: C.text, backgroundColor: C.surface },
  bodyInput: { minHeight: 150, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, fontSize: 16, color: C.text, backgroundColor: C.surface },
  photoHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 76, height: 76, borderRadius: 12, backgroundColor: C.surface2 },
  photoBtn: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.green, alignItems: 'center', justifyContent: 'center' },
  photoBtnText: { color: C.green, fontWeight: '800' },
});
