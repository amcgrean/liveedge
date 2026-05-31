import React from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { C, S } from '@/theme/colors';
import { Icon } from '@/components/ui/Icon';
import { BigButton } from '@/components/ui/BigButton';
import { BigButtonRow, MONO } from '@/components/sales/kit';

export default function SubmittedScreen() {
  const { kind = 'order', queued } = useLocalSearchParams<{ kind?: string; queued?: string }>();
  const isQueued = queued === '1';
  const noun = kind === 'quote' ? 'Quote' : 'Order';
  const ref = kind === 'quote' ? 'Q-2026-0488' : 'SO# 102-45120';

  const goHome = () => router.replace('/(sales)/home');

  if (isQueued) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.hero, { backgroundColor: '#7a6726' }]}>
          <View style={styles.heroIcon}><Icon name="cloudOff" size={46} color="#fff" strokeWidth={2.2} /></View>
          <Text style={styles.heroTitle}>Queued to send</Text>
          <Text style={styles.heroSub}>You're offline — saved to outbox</Text>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.warnBox}>
            <Icon name="refresh" size={20} color={C.warn} strokeWidth={2.3} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warnTitle}>{noun} {ref} will submit automatically</Text>
              <Text style={styles.warnBody}>Held in the offline outbox. Sends the moment you're back on Wi-Fi or strong cell — no action needed.</Text>
            </View>
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <BigButton kind="primary" icon="check" onPress={goHome}>Got it</BigButton>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.hero, { backgroundColor: C.green }]}>
        <View style={styles.heroIcon}><Icon name="check" size={52} color="#fff" strokeWidth={3.5} /></View>
        <Text style={styles.heroTitle}>{noun} Submitted</Text>
        <Text style={styles.heroSub}>{ref} · confirmed by ERP</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.summary}>
          {[['Customer', 'Holstead Construction'], ['Ship to', 'Jobsite — Hickory Ln'], ['Requested', 'Fri · May 29 · AM'], ['Total', '$1,249.10']].map(([k, v], i, a) => (
            <View key={k} style={[styles.sumRow, { borderBottomWidth: i < a.length - 1 ? 1 : 0 }]}>
              <Text style={styles.sumKey}>{k}</Text>
              <Text style={[styles.sumVal, k === 'Total' && { fontFamily: MONO }]}>{v}</Text>
            </View>
          ))}
        </View>
        <View style={styles.notify}>
          <Icon name="truck" size={20} color={C.green} strokeWidth={2.2} />
          <Text style={styles.notifyText}>Yard 20GR has been notified to begin picking. You'll see status update on the order.</Text>
        </View>
      </ScrollView>
      <BigButtonRow style={styles.footerRow}>
        <BigButton kind="secondary" style={{ flex: 1 }} onPress={() => router.replace('/(sales)/orders')}>View order</BigButton>
        <BigButton kind="primary" icon="home" style={{ flex: 1 }} onPress={goHome}>Done</BigButton>
      </BigButtonRow>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  hero: { paddingTop: 90, paddingBottom: 44, alignItems: 'center', gap: 16 },
  heroIcon: { width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.6 },
  heroSub: { fontSize: 14.5, color: 'rgba(255,255,255,0.85)', marginTop: -8, fontFamily: MONO },
  body: { padding: 16 },
  summary: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomColor: C.lineSoft },
  sumKey: { fontSize: 14, color: C.text3 },
  sumVal: { fontSize: 14, fontWeight: '700', color: C.text },
  notify: { flexDirection: 'row', gap: 11, marginTop: 14, padding: 14, backgroundColor: S.deliverySoft, borderWidth: 1, borderColor: '#b6e6c8', borderRadius: 14 },
  notifyText: { flex: 1, fontSize: 13.5, color: '#1f6b43', lineHeight: 20 },
  warnBox: { flexDirection: 'row', gap: 12, padding: 15, backgroundColor: C.warnSoft, borderWidth: 1.5, borderColor: C.warnBorder, borderRadius: 14 },
  warnTitle: { fontSize: 14.5, fontWeight: '800', color: '#92500a' },
  warnBody: { fontSize: 13, color: '#a8650f', marginTop: 3, lineHeight: 19 },
  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 30, borderTopWidth: 1, borderTopColor: C.line },
  footerRow: { marginHorizontal: 16, marginTop: 0, paddingTop: 12, paddingBottom: 30, borderTopWidth: 1, borderTopColor: C.line },
});
