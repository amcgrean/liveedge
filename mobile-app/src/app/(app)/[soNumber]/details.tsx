import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Icon } from '@/components/ui/Icon';
import { BigButton } from '@/components/ui/BigButton';
import { Pill } from '@/components/ui/Pill';
import { MapPlaceholder } from '@/components/ui/MapPlaceholder';
import { C } from '@/theme/colors';
import { useStopOrLookup } from '@/hooks/useStopOrLookup';
import { usePhotos, photoStore } from '@/data/photoStore';
import { useOnline } from '@/hooks/useOnline';
import { outbox } from '@/storage/outbox';
import { useToast } from '@/context/ToastContext';
import { claimOrder } from '@/api/dispatch';

const MIN_PHOTOS = 2;

export default function DeliveryDetailsScreen() {
  const { soNumber, claimable } = useLocalSearchParams<{ soNumber: string; claimable?: string }>();
  const { stop, source, loading: stopLoading, total, idx, refresh: refreshStop } = useStopOrLookup(soNumber);
  console.log('[Details]', { soNumber, source, hasStop: !!stop, stopLoading });
  const photos = usePhotos(soNumber);
  const online = useOnline();
  const { show } = useToast();
  const [notes, setNotes] = useState(stop?.notes || '');
  const [submitting, setSubmitting] = useState(false);

  // Claim state. Started "claimed" when:
  //   - we got here through route mode (the stop is already on the route), OR
  //   - the lookup returned an existing_stop (server has a row already).
  // Started "unclaimed" when lookup explicitly flagged claimable=1.
  const [claimed, setClaimed] = useState<boolean>(() => {
    if (source === 'route') return true;
    if (claimable === '1') return false;
    return true;
  });
  const [claiming, setClaiming] = useState(false);

  // Keep notes synced if stop loads after first render (lookup mode).
  React.useEffect(() => {
    if (stop?.notes && !notes) setNotes(stop.notes);
    // Once we know the source, re-evaluate claimed state. Lookup that returns
    // existing_stop means already claimed; absence means user must claim.
    if (source === 'route') setClaimed(true);
    else if (source === 'lookup') setClaimed(stop?.stopId != null);
  }, [source, stop?.stopId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (stopLoading || !stop) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundTitle}>
            {stopLoading ? 'Looking up SO…' : 'Stop not found'}
          </Text>
          <Text style={styles.notFoundSub}>SO# {soNumber}</Text>
          <View style={{ marginTop: 16 }}>
            <BigButton kind="primary" onPress={() => router.back()}>
              Back
            </BigButton>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const handleClaim = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      const res = await claimOrder(soNumber, {
        branchCode: stop.branchCode,
        shipmentNum: stop.shipmentNum,
      });
      setClaimed(true);
      show(res.already_existed ? 'Stop was already on a route' : 'Stop claimed · you can now record POD', 'success');
      // Re-fetch so the server-side stopId is reflected in local data.
      await refreshStop();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Claim failed';
      show(msg, 'error');
    } finally {
      setClaiming(false);
    }
  };

  const pillKind = stop.status;
  const pillLabel = stop.status === 'inroute' ? 'IN ROUTE' : stop.status.toUpperCase();

  const handleCall = () => {
    if (stop.primaryContact?.phone) {
      Linking.openURL(`tel:${stop.primaryContact.phone.replace(/\D/g, '')}`);
    }
  };

  const leaveStop = () => {
    // Only auto-jump to route-complete when this stop is the last on the
    // driver's planned route — never for SO lookups, which aren't part
    // of the planned route at all.
    const isLast = source === 'route' && idx >= 0 && idx === total - 1;
    if (isLast) {
      router.replace('/(app)/route-complete');
    } else {
      router.back();
    }
  };

  const handleMarkDelivered = async () => {
    if (submitting) return;
    if (!claimed) {
      Alert.alert('Claim required', 'Tap "Take this stop" first to record POD for this SO.');
      return;
    }
    if (photos.length < MIN_PHOTOS) {
      Alert.alert(
        'Photos required',
        `Capture at least ${MIN_PHOTOS} photos before marking delivered.`,
        [{ text: 'OK' }]
      );
      return;
    }
    setSubmitting(true);
    try {
      await outbox.enqueue({
        soNumber,
        type: 'deliver',
        notes,
        photoUris: photos,
      });
    } catch {
      setSubmitting(false);
      show('Could not save delivery. Try again.', 'error');
      return;
    }
    show(online ? 'Delivery saved · syncing' : 'Saved offline · will sync later', 'success');
    photoStore.clear(soNumber);
    leaveStop();
  };

  const enqueueSkip = async (reason: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await outbox.enqueue({
        soNumber,
        type: 'skip',
        notes: reason,
        photoUris: [],
      });
    } catch {
      setSubmitting(false);
      show('Could not save skip. Try again.', 'error');
      return;
    }
    show(online ? 'Skip saved · syncing' : 'Skip saved offline · will sync later', 'success');
    leaveStop();
  };

  const handleSkip = () => {
    if (!claimed) {
      Alert.alert('Claim required', 'Tap "Take this stop" first if you want to record a skip.');
      return;
    }
    if (Platform.OS === 'ios' && typeof Alert.prompt === 'function') {
      Alert.prompt(
        'Skip Stop',
        `Why are you skipping ${stop.name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Skip',
            style: 'destructive',
            onPress: (reason?: string) => enqueueSkip(reason?.trim() || 'Skipped by driver'),
          },
        ],
        'plain-text',
        ''
      );
      return;
    }

    Alert.alert('Skip Stop', `Skip ${stop.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Skip',
        style: 'destructive',
        onPress: () => enqueueSkip('Skipped by driver'),
      },
    ]);
  };

  const handleAddPhoto = () => {
    router.push({
      pathname: '/(app)/[soNumber]/camera',
      params: { soNumber: stop.so },
    });
  };

  const handleViewCustomer = () => {
    router.push({
      pathname: '/(app)/[soNumber]/customer',
      params: { soNumber: stop.so },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Back bar */}
      <View style={styles.backBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="chevronLeft" size={20} color={C.green} />
          <Text style={styles.backText}>Route</Text>
        </TouchableOpacity>
        <Text style={styles.backTitle}>
          {source === 'route'
            ? `Stop ${stop.n} of ${total.toString().padStart(2, '0')}`
            : claimed
              ? `SO Lookup · Claimed`
              : `SO Lookup`}
        </Text>
        <Pill kind={pillKind}>{pillLabel}</Pill>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Customer header */}
        <View style={styles.customerBlock}>
          <Text style={styles.customerName}>{stop.name}</Text>
          <Text style={styles.customerAddr}>{stop.addr1}</Text>
          <Text style={styles.customerAddr}>{stop.addr2}</Text>
          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>SO# {stop.so}</Text>
            </View>
            {stop.poRef && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>PO# {stop.poRef}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Claim banner — only when this SO was opened via lookup and the
            caller hasn't claimed it yet. POD actions stay disabled until
            the claim POST succeeds. */}
        {source === 'lookup' && !claimed && (
          <View style={styles.claimBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.claimTitle}>Not on your route</Text>
              <Text style={styles.claimBody}>
                Claim this stop to record POD photos and mark delivered. Other actions are read-only until you claim.
              </Text>
            </View>
            <BigButton
              kind="primary"
              icon="checkBold"
              fullWidth={false}
              onPress={handleClaim}
              disabled={claiming}
              style={{ minWidth: 140 }}
            >
              {claiming ? 'Claiming…' : 'Take this stop'}
            </BigButton>
          </View>
        )}

        {/* Map */}
        <MapPlaceholder height={180} distance={stop.eta ? '1.2 mi · 5 min' : undefined} />

        {/* Special instructions */}
        {stop.specialInstructions && (
          <View style={styles.alertBox}>
            <Icon name="alert" size={20} color={C.gold} strokeWidth={2.4} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertLabel}>SPECIAL INSTRUCTIONS</Text>
              <Text style={styles.alertText}>{stop.specialInstructions}</Text>
            </View>
          </View>
        )}

        {/* Photo capture */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Proof of Delivery</Text>
            <Text style={styles.sectionMeta}>
              <Text
                style={{
                  color: photos.length >= MIN_PHOTOS ? C.green : C.warn,
                  fontWeight: '700',
                }}
              >
                {photos.length} photo{photos.length === 1 ? '' : 's'}
              </Text>{' '}
              · min {MIN_PHOTOS} req.
            </Text>
          </View>
          <View style={styles.photoGrid}>
            <TouchableOpacity onPress={handleAddPhoto} style={styles.addPhotoBtn} activeOpacity={0.7}>
              <Icon name="camera" size={26} color={C.green} strokeWidth={2.2} />
              <Text style={styles.addPhotoText}>ADD</Text>
            </TouchableOpacity>
            {photos.map((uri, i) => (
              <View key={`${uri}-${i}`} style={styles.photoCell}>
                <Image source={{ uri }} style={styles.photoImg} />
                <TouchableOpacity
                  onPress={() => photoStore.remove(soNumber, i)}
                  style={styles.photoDelete}
                >
                  <Icon name="x" size={12} color="white" strokeWidth={3} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Add delivery notes…"
            placeholderTextColor={C.text4}
            multiline
            style={styles.notesInput}
          />
        </View>

        {/* Order summary tap row */}
        <TouchableOpacity onPress={handleViewCustomer} style={styles.orderRow} activeOpacity={0.85}>
          <Icon name="package" size={22} color={C.text2} />
          <View style={{ flex: 1 }}>
            <Text style={styles.orderTitle}>
              Order details · {stop.items} items
            </Text>
            <Text style={styles.orderSub}>Tap to view contents & contacts</Text>
          </View>
          <Icon name="chevronRight" size={20} color={C.text3} />
        </TouchableOpacity>
      </ScrollView>

      {/* Call FAB */}
      {stop.primaryContact && (
        <TouchableOpacity onPress={handleCall} style={styles.callFab} activeOpacity={0.85}>
          <Icon name="phone" size={22} color="white" strokeWidth={2.4} />
        </TouchableOpacity>
      )}

      {/* Action bar */}
      <View style={styles.actionBar}>
        <BigButton kind="danger" onPress={handleSkip} disabled={submitting} style={styles.skipBtn}>
          Skip
        </BigButton>
        <BigButton
          kind="primary"
          icon="check"
          onPress={handleMarkDelivered}
          loading={submitting}
          style={styles.deliverBtn}
        >
          Mark Delivered
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  claimBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.greenSoft,
    borderColor: C.green,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
  },
  claimTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  claimBody: { fontSize: 13, color: C.text2, marginTop: 2 },
  safe: { flex: 1, backgroundColor: C.surface },
  notFound: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  notFoundTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  notFoundSub: { fontSize: 14, color: C.text3, fontFamily: 'Menlo', marginTop: 4 },
  backBar: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 52,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingRight: 4,
  },
  backText: { color: C.green, fontSize: 16, fontWeight: '600' },
  backTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: C.text },
  scroll: { paddingBottom: 140 },
  customerBlock: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  customerName: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 27 },
  customerAddr: { fontSize: 15, color: C.text2, marginTop: 2 },
  chipRow: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  chip: {
    backgroundColor: C.surface2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  chipText: {
    fontFamily: 'Menlo',
    fontSize: 12,
    fontWeight: '600',
    color: C.text3,
  },
  alertBox: {
    margin: 14,
    padding: 14,
    backgroundColor: C.goldSoft,
    borderWidth: 1.5,
    borderColor: '#f1e0a4',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
  },
  alertLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: C.gold,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  alertText: { fontSize: 15, color: C.text, lineHeight: 21 },
  section: { marginHorizontal: 14, marginTop: 14 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 8 },
  sectionMeta: { fontSize: 14, color: C.text3, fontWeight: '600' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addPhotoBtn: {
    width: '23.5%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: C.green,
    borderStyle: 'dashed',
    backgroundColor: C.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoText: { fontSize: 11, fontWeight: '700', color: C.green },
  photoCell: {
    width: '23.5%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: C.surface2,
    position: 'relative',
  },
  photoImg: { width: '100%', height: '100%' },
  photoDelete: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesInput: {
    minHeight: 80,
    padding: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 12,
    fontSize: 15,
    color: C.text,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  orderRow: {
    marginHorizontal: 14,
    marginTop: 14,
    height: 56,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  orderTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  orderSub: { fontSize: 12, color: C.text3 },
  callFab: {
    position: 'absolute',
    right: 18,
    bottom: 110,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.green,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 36,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: C.line,
    flexDirection: 'row',
    gap: 10,
  },
  skipBtn: { flex: 1 },
  deliverBtn: { flex: 2 },
});
