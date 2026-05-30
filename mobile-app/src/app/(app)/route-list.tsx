import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { AppStatusBar } from '@/components/ui/AppStatusBar';
import { Pill } from '@/components/ui/Pill';
import { BigButton } from '@/components/ui/BigButton';
import { Icon } from '@/components/ui/Icon';
import { C, BRANCHES, BranchCode } from '@/theme/colors';
import { useOnline } from '@/hooks/useOnline';
import { useOutbox } from '@/storage/outbox';
import { MockStop, StopStatus } from '@/data/mockRoute';
import { useDriverRoute } from '@/hooks/useDriverRoute';
import { format } from 'date-fns';

const PILL_LABEL: Record<StopStatus, string> = {
  pending: 'PENDING',
  delivered: 'DELIVERED',
  skipped: 'SKIPPED',
  inroute: 'IN ROUTE',
};

function StopCard({ stop, expanded, onToggle }: { stop: MockStop; expanded: boolean; onToggle: () => void }) {
  const numColor =
    stop.status === 'delivered' ? C.ok :
    stop.status === 'skipped' ? C.err :
    stop.status === 'inroute' ? C.green : C.text3;
  const numBg =
    stop.status === 'delivered' ? C.okSoft :
    stop.status === 'skipped' ? C.errSoft :
    stop.status === 'inroute' ? C.greenSoft : C.surface2;

  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.9}
      style={[styles.card, expanded && styles.cardExpanded]}
    >
      <View style={styles.cardRow}>
        <View style={[styles.cardNum, { backgroundColor: numBg }]}>
          <Text style={[styles.cardNumText, { color: numColor }]}>{stop.n}</Text>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardName} numberOfLines={1}>
              {stop.name}
            </Text>
            <Pill kind={stop.status}>{PILL_LABEL[stop.status]}</Pill>
          </View>
          <Text style={styles.cardAddr1}>{stop.addr1}</Text>
          <Text style={styles.cardAddr2}>{stop.addr2}</Text>
          <View style={styles.cardMetaRow}>
            <View style={styles.soChip}>
              <Text style={styles.soChipText}>SO# {stop.so}</Text>
            </View>
            {stop.eta && <Text style={styles.metaText}>· ETA {stop.eta}</Text>}
            <Text style={styles.metaText}>· {stop.items} items</Text>
          </View>
        </View>
      </View>
      {expanded && (
        <View style={styles.expandedActions}>
          <BigButton kind="primary" icon="map" style={styles.actionFlex}>
            Navigate
          </BigButton>
          <BigButton kind="secondary" icon="phone" fullWidth={false} style={styles.actionSquare} />
          <BigButton
            kind="primaryDim"
            icon="package"
            fullWidth={false}
            style={styles.actionDetails}
            onPress={() => router.push(`/(app)/${stop.so}/details`)}
          >
            Details
          </BigButton>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function RouteListScreen() {
  const { user } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>('04');
  const [refreshing, setRefreshing] = useState(false);
  const online = useOnline();
  const outboxItems = useOutbox();
  const syncCount = outboxItems.filter((item) => item.status !== 'synced').length;
  const { stops, refresh } = useDriverRoute();

  const branchCode = (user?.branch || '20GR') as BranchCode;
  const branch = BRANCHES.find((b) => b.code === branchCode);
  const today = format(new Date(), "EEE · MMM d");

  const delivered = stops.filter((s) => s.status === 'delivered').length;
  const inRoute = stops.filter((s) => s.status === 'inroute').length;
  const skipped = stops.filter((s) => s.status === 'skipped').length;
  const total = Math.max(stops.length, 1);
  const pctDelivered = (delivered / total) * 100;
  const pctInRoute = (inRoute / total) * 100;
  const pctSkipped = (skipped / total) * 100;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <AppStatusBar
        branchLabel={`${branchCode} · ${branch?.name}`}
        branchDot={branch?.dot}
        online={online}
        syncCount={syncCount}
        onProfile={() => router.push('/(app)/profile')}
      />

      {/* Sub header: date + progress */}
      <View style={styles.subHeader}>
        <View style={styles.subHeaderRow}>
          <View>
            <Text style={styles.subHeaderTitle}>Today's Route</Text>
            <Text style={styles.subHeaderSub}>{today} · Truck T-407</Text>
          </View>
          <View style={styles.progressBlock}>
            <Text style={styles.progressNum}>
              {delivered}
              <Text style={styles.progressNumDim}>/{total}</Text>
            </Text>
            <Text style={styles.progressLabel}>DELIVERED</Text>
          </View>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${pctDelivered}%`, backgroundColor: C.ok }]} />
          <View style={[styles.progressFill, { width: `${pctInRoute}%`, backgroundColor: C.green, opacity: 0.7 }]} />
          <View style={[styles.progressFill, { width: `${pctSkipped}%`, backgroundColor: C.err, opacity: 0.85 }]} />
        </View>
        <View style={styles.progressMetaRow}>
          <Text style={styles.progressMeta}>Started 7:14 AM</Text>
          <Text style={styles.progressMeta}>
            Est. complete <Text style={styles.progressMetaBold}>3:40 PM</Text>
          </Text>
        </View>
      </View>

      <View style={styles.pullHint}>
        <Icon name="refresh" size={12} color={C.text4} />
        <Text style={styles.pullHintText}>Pull to sync · Last synced 2 min ago</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.green} />
        }
      >
        {stops.map((s) => (
          <StopCard
            key={s.n}
            stop={s}
            expanded={expandedId === s.n}
            onToggle={() => setExpandedId(expandedId === s.n ? null : s.n)}
          />
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.fab}>
        <Icon name="map" size={22} color="#ffffff" />
        <Text style={styles.fabText}>MAP</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  subHeader: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  subHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  subHeaderTitle: { fontSize: 22, fontWeight: '700', color: C.text },
  subHeaderSub: { fontSize: 13, color: C.text3, marginTop: 2 },
  progressBlock: { alignItems: 'flex-end' },
  progressNum: { fontSize: 22, fontWeight: '800', color: C.green, fontFamily: 'Menlo' },
  progressNumDim: { color: C.text3, fontWeight: '600' },
  progressLabel: { fontSize: 11, color: C.text3, fontWeight: '700', letterSpacing: 0.6 },
  progressBar: {
    height: 10,
    backgroundColor: C.surface2,
    borderRadius: 5,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  progressFill: { height: '100%' },
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  progressMeta: { fontSize: 12, color: C.text3 },
  progressMetaBold: { color: C.text2, fontWeight: '600' },
  pullHint: {
    backgroundColor: C.surface,
    paddingVertical: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  pullHintText: { fontSize: 12, color: C.text4 },
  list: { paddingHorizontal: 14, paddingVertical: 12, paddingBottom: 120, gap: 10 },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 16,
    marginBottom: 10,
  },
  cardExpanded: {
    borderColor: C.green,
    shadowColor: C.green,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardRow: { padding: 16, flexDirection: 'row', gap: 14 },
  cardNum: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardNumText: { fontSize: 20, fontWeight: '800', fontFamily: 'Menlo' },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  cardName: { flex: 1, fontSize: 17, fontWeight: '700', color: C.text },
  cardAddr1: { fontSize: 14, color: C.text2 },
  cardAddr2: { fontSize: 14, color: C.text3 },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  soChip: {
    backgroundColor: C.surface2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  soChipText: {
    fontFamily: 'Menlo',
    fontSize: 11,
    fontWeight: '600',
    color: C.text3,
  },
  metaText: { fontSize: 12, color: C.text3 },
  expandedActions: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    gap: 10,
  },
  actionFlex: { flex: 1, height: 48 },
  actionSquare: { width: 56, height: 48, paddingHorizontal: 0 },
  actionDetails: { height: 48, paddingHorizontal: 14 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 40,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.text,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  fabText: { fontSize: 9, fontWeight: '700', color: '#ffffff', letterSpacing: 0.4 },
});
