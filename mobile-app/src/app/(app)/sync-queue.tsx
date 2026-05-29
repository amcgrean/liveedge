import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { AppStatusBar } from '@/components/ui/AppStatusBar';
import { BigButton } from '@/components/ui/BigButton';
import { Icon } from '@/components/ui/Icon';
import { C } from '@/theme/colors';

type ItemStatus = 'retrying' | 'failed' | 'queued';

const MOCK_QUEUE: {
  stop: string;
  name: string;
  time: string;
  photos: number;
  status: ItemStatus;
  tries: number;
}[] = [
  { stop: '04', name: 'Brenneman Residence', time: '11:42 AM', photos: 4, status: 'retrying', tries: 2 },
  { stop: '03', name: 'M&B Roofing LLC', time: '10:08 AM', photos: 6, status: 'failed', tries: 3 },
  { stop: '02', name: 'Greenway Homes — Lot 14', time: '8:51 AM', photos: 5, status: 'queued', tries: 0 },
];

export default function SyncQueueScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <AppStatusBar
        branchLabel="20GR · Grimes"
        branchDot={C.grimes}
        online={false}
        syncCount={3}
        onMenu={() => router.back()}
      />

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Pending Sync</Text>
          <Text style={styles.headerCount}>3 items</Text>
        </View>
        <View style={styles.headerSubRow}>
          <Icon name="cloudOff" size={14} color={C.warn} strokeWidth={2.4} />
          <Text style={styles.headerSub}>
            Offline — will retry when signal returns. Last attempt 2 min ago.
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {MOCK_QUEUE.map((it) => {
          const isFailed = it.status === 'failed';
          const isRetrying = it.status === 'retrying';
          const accent = isFailed ? C.err : isRetrying ? C.warn : C.text3;
          const accentSoft = isFailed ? C.errSoft : isRetrying ? C.warnSoft : C.surface2;

          return (
            <View key={it.stop} style={styles.card}>
              <View style={styles.cardRow}>
                <View style={[styles.stopChip, { backgroundColor: accentSoft }]}>
                  <Text style={[styles.stopChipText, { color: accent }]}>{it.stop}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardName} numberOfLines={1}>{it.name}</Text>
                  <View style={styles.cardMetaRow}>
                    <Text style={styles.cardTime}>{it.time}</Text>
                    <Text style={styles.cardMeta}>· {it.photos} photos · 1 sig</Text>
                  </View>
                  <View style={styles.statusRow}>
                    {isRetrying && (
                      <View style={[styles.statusChip, { backgroundColor: C.warnSoft }]}>
                        <Icon name="refresh" size={11} color={C.warn} strokeWidth={2.6} />
                        <Text style={[styles.statusChipText, { color: C.warn }]}>
                          Retrying ({it.tries}/5)
                        </Text>
                      </View>
                    )}
                    {isFailed && (
                      <View style={[styles.statusChip, { backgroundColor: C.errSoft }]}>
                        <Icon name="alert" size={11} color={C.err} strokeWidth={2.6} />
                        <Text style={[styles.statusChipText, { color: C.err }]}>
                          Failed · {it.tries} tries
                        </Text>
                      </View>
                    )}
                    {it.status === 'queued' && (
                      <View style={[styles.statusChip, { backgroundColor: C.surface2 }]}>
                        <Icon name="clock" size={11} color={C.text3} strokeWidth={2.6} />
                        <Text style={[styles.statusChipText, { color: C.text3 }]}>Queued</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity style={[styles.cardAction, styles.cardActionBorder]}>
                  <Text style={styles.cardActionText}>View</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cardAction}>
                  <Icon name="refresh" size={14} color={C.green} strokeWidth={2.4} />
                  <Text style={[styles.cardActionText, { color: C.green, fontWeight: '700' }]}>
                    Retry
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <View style={styles.tip}>
          <Icon name="info" size={18} color={C.text3} />
          <Text style={styles.tipText}>
            Items sync automatically once back on Wi-Fi or strong cell. Photos and notes are saved locally.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <BigButton kind="primary" icon="upload">Retry All</BigButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  header: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: C.text },
  headerCount: { fontSize: 14, fontWeight: '600', color: C.warn, fontFamily: 'Menlo' },
  headerSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  headerSub: { flex: 1, fontSize: 13, color: C.text3 },
  list: { padding: 14, paddingBottom: 110, gap: 10 },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
  },
  cardRow: { flexDirection: 'row', gap: 12, padding: 14 },
  stopChip: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopChipText: { fontSize: 16, fontWeight: '800', fontFamily: 'Menlo' },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 16, fontWeight: '700', color: C.text },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  cardTime: { fontSize: 12, color: C.text3, fontFamily: 'Menlo' },
  cardMeta: { fontSize: 12, color: C.text3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusChipText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  cardActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.lineSoft },
  cardAction: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  cardActionBorder: { borderRightWidth: 1, borderRightColor: C.lineSoft },
  cardActionText: { color: C.text2, fontSize: 14, fontWeight: '600' },
  tip: {
    padding: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  tipText: { flex: 1, fontSize: 13, color: C.text3, lineHeight: 18 },
  footer: {
    padding: 16,
    paddingBottom: 36,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
});
