import React from 'react';
import {
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BigButton } from '@/components/ui/BigButton';
import { Icon } from '@/components/ui/Icon';
import { usePhotos, photoStore } from '@/data/photoStore';
import { useDriverRoute } from '@/hooks/useDriverRoute';
import { C } from '@/theme/colors';

export default function PhotosScreen() {
  const { soNumber = '' } = useLocalSearchParams<{ soNumber: string }>();
  const { stops } = useDriverRoute();
  const stop = stops.find((s) => s.so === soNumber);
  const photos = usePhotos(soNumber);

  const handleAddPhoto = () => {
    router.push({
      pathname: '/(app)/[soNumber]/camera',
      params: { soNumber },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.backBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="chevronLeft" size={20} color={C.green} />
          <Text style={styles.backText}>Details</Text>
        </TouchableOpacity>
        <Text style={styles.backTitle}>POD Photos</Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{photos.length}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{stop?.name ?? soNumber}</Text>
          <Text style={styles.sub}>SO# {soNumber}</Text>
        </View>

        {photos.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="camera" size={30} color={C.text3} strokeWidth={2.2} />
            <Text style={styles.emptyTitle}>No photos yet</Text>
            <Text style={styles.emptySub}>Captured photos are saved on device and survive app restarts.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {photos.map((uri, index) => (
              <View key={uri} style={styles.photoCard}>
                <Image source={{ uri }} style={styles.photo} />
                <View style={styles.photoMeta}>
                  <Text style={styles.photoLabel}>Photo {index + 1}</Text>
                  <TouchableOpacity
                    onPress={() => photoStore.remove(soNumber, index)}
                    style={styles.deleteBtn}
                    activeOpacity={0.75}
                  >
                    <Icon name="x" size={14} color={C.err} strokeWidth={2.8} />
                    <Text style={styles.deleteText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <BigButton kind="primary" icon="camera" onPress={handleAddPhoto}>
          Add Photo
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  backBar: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { color: C.green, fontSize: 15, fontWeight: '700' },
  backTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  countPill: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: C.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: C.green, fontSize: 13, fontWeight: '800', fontFamily: 'Menlo' },
  scroll: { padding: 16, paddingBottom: 112 },
  header: { marginBottom: 14 },
  title: { fontSize: 22, color: C.text, fontWeight: '800' },
  sub: { fontSize: 13, color: C.text3, fontFamily: 'Menlo', marginTop: 4 },
  empty: {
    minHeight: 260,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: { marginTop: 10, fontSize: 17, fontWeight: '700', color: C.text },
  emptySub: { marginTop: 6, fontSize: 13, color: C.text3, lineHeight: 18, textAlign: 'center' },
  grid: { gap: 14 },
  photoCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    overflow: 'hidden',
  },
  photo: { width: '100%', aspectRatio: 4 / 3, backgroundColor: C.surface2 },
  photoMeta: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  photoLabel: { fontSize: 13, color: C.text2, fontWeight: '700' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  deleteText: { fontSize: 13, color: C.err, fontWeight: '700' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 34,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
});
