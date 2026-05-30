import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { AppStatusBar } from '@/components/ui/AppStatusBar';
import { BigButton } from '@/components/ui/BigButton';
import { Icon } from '@/components/ui/Icon';
import { C, BRANCHES, BranchCode } from '@/theme/colors';
import { findStop } from '@/data/mockRoute';
import { useAuth } from '@/context/AuthContext';
import { useOnline } from '@/hooks/useOnline';
import { outbox, OutboxItem, useOutbox } from '@/storage/outbox';
import { syncNow } from '@/storage/sync';
import { deletePhoto } from '@/storage/photoFS';

type ItemStatus = 'retrying' | 'failed' | 'queued';

interface QueueRow {
  id: string;
  stop: string;
  soNumber: string;
  name: string;
  time: string;
  photos: number;
  type: OutboxItem['type'];
  status: ItemStatus;
  tries: number;
  item: OutboxItem;
}

export default function SyncQueueScreen() {
  const { user } = useAuth();
  const online = useOnline();
  const allItems = useOutbox();
  const items = allItems.filter((item) => item.status !== 'synced');
  const branchCode = (user?.branch || '20GR') as BranchCode;
  const branch = BRANCHES.find((b) => b.code === branchCode);

  const rows: QueueRow[] = items.map((item) => {
    const stop = findStop(item.soNumber);
    return {
      id: item.id,
      stop: stop?.n ?? '??',
      soNumber: item.soNumber,
      name: stop?.name ?? item.soNumber,
      time: format(item.createdAt, 'h:mm a'),
      photos: item.photoUris.length,
      type: item.type,
      status: item.status === 'failed' ? 'failed' : item.status === 'retrying' ? 'retrying' : 'queued',
      tries: item.attempts,
      item,
    };
  });

  // Manual retry resets attempts so the user gets a fresh 5-attempt budget.
  // Without this, items already at attempts >= 5 are permanently stuck and the
  // Retry button would only give them one more try before failing again.
  const handleRetry = async (id: string) => {
    await outbox.update(id, {
      status: 'queued',
      attempts: 0,
      nextRetryAt: undefined,
      lastError: undefined,
    });
    syncNow();
  };

  const handleRetryAll = async () => {
    await Promise.all(
      items.map((item) =>
        outbox.update(item.id, {
          status: 'queued',
          attempts: 0,
          nextRetryAt: undefined,
          lastError: undefined,
        })
      )
    );
    syncNow();
  };

  const handleDiscard = (item: OutboxItem) => {
    Alert.alert('Discard sync item?', 'This removes the pending action and its saved photos.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await Promise.all(item.photoUris.map((uri) => deletePhoto(uri)));
          await outbox.remove(item.id);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <AppStatusBar
        branchLabel={`${branchCode} · ${branch?.name}`}
        branchDot={branch?.dot}
        online={online}
        syncCount={items.length}
        onMenu={() => router.back()}
      />

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Pending Sync</Text>
          <Text style={styles.headerCount}>
            {items.length} item{items.length === 1 ? '' : 's'}
          </Text>
        </View>
        <View style={styles.headerSubRow}>
          <Icon name={online ? 'wifi' : 'cloudOff'} size={14} color={online ? C.ok : C.warn} strokeWidth={2.4} />
          <Text style={styles.headerSub}>
            {online
              ? 'Online — queued items will sync automatically.'
              : 'Offline — will retry when signal returns.'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {rows.map((it) => {
          const isFailed = it.status === 'failed';
          const isRetrying = it.status === 'retrying';
          const accent = isFailed ? C.err : isRetrying ? C.warn : C.text3;
          const accentSoft = isFailed ? C.errSoft : isRetrying ? C.warnSoft : C.surface2;

          return (
            <View key={it.id} style={styles.card}>
              <View style={styles.cardRow}>
                <View style={[styles.stopChip, { backgroundColor: accentSoft }]}>
                  <Text style={[styles.stopChipText, { color: accent }]}>{it.stop}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardName} numberOfLines={1}>{it.name}</Text>
                  <View style={styles.cardMetaRow}>
                    <Text style={styles.cardTime}>{it.time}</Text>
                    <Text style={styles.cardMeta}>
                      · {it.photos} photos · {it.type === 'skip' ? 'skip' : 'delivery'}
                    </Text>
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
                  {it.item.lastError && (
                    <Text style={styles.errorText} numberOfLines={2}>{it.item.lastError}</Text>
                  )}
                </View>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.cardAction, styles.cardActionBorder]}
                  onPress={() => router.push(`/(app)/${it.soNumber}/details`)}
                >
                  <Text style={styles.cardActionText}>View</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cardAction, styles.cardActionBorder]}
                  onPress={() => handleDiscard(it.item)}
                >
                  <Icon name="x" size={14} color={C.err} strokeWidth={2.4} />
                  <Text style={[styles.cardActionText, { color: C.err }]}>Discard</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cardAction} onPress={() => handleRetry(it.id)}>
                  <Icon name="refresh" size={14} color={C.green} strokeWidth={2.4} />
                  <Text style={[styles.cardActionText, { color: C.green, fontWeight: '700' }]}>
                    Retry
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {rows.length === 0 && (
          <View style={styles.empty}>
            <Icon name="check" size={24} color={C.ok} strokeWidth={2.6} />
            <Text style={styles.emptyTitle}>Everything is synced</Text>
            <Text style={styles.emptySub}>Deliveries, skips, notes, and photos are up to date.</Text>
          </View>
        )}

        <View style={styles.tip}>
          <Icon name="info" size={18} color={C.text3} />
          <Text style={styles.tipText}>
            Items sync automatically once back on Wi-Fi or strong cell. Photos and notes are saved locally.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <BigButton kind="primary" icon="upload" onPress={handleRetryAll}>
          Retry All
        </BigButton>
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
  errorText: { fontSize: 12, color: C.err, marginTop: 6 },
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
  empty: {
    padding: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  emptySub: { fontSize: 13, color: C.text3, textAlign: 'center' },
  footer: {
    padding: 16,
    paddingBottom: 36,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
});
