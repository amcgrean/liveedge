import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Rect } from 'react-native-svg';
import { Icon } from '@/components/ui/Icon';
import { BigButton } from '@/components/ui/BigButton';
import { C } from '@/theme/colors';
import { format } from 'date-fns';

const CHECKLIST = [
  'Truck fueled',
  'Straps & tarps secured',
  'Keys returned to dispatch',
];

const STATS = [
  { value: '8/8', label: 'DELIVERED', accent: C.ok },
  { value: '0', label: 'SKIPPED', accent: C.text3 },
  { value: '47', label: 'PHOTOS UPLOADED', accent: C.green },
  { value: '142', label: 'MILES DRIVEN', accent: C.text },
];

export default function RouteCompleteScreen() {
  const [done, setDone] = useState<boolean[]>([true, true, true]);
  const today = format(new Date(), "EEE · MMM d");

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero band */}
        <LinearGradient
          colors={[C.green, C.greenDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          {/* Confetti dots */}
          <Svg
            width="100%"
            height="100%"
            style={[StyleSheet.absoluteFillObject, { opacity: 0.4 }]}
            pointerEvents="none"
          >
            <Circle cx="40" cy="50" r="3" fill="white" />
            <Circle cx="340" cy="80" r="2" fill={C.gold} />
            <Circle cx="80" cy="140" r="2" fill={C.gold} />
            <Circle cx="300" cy="180" r="3" fill="white" />
            <Circle cx="180" cy="220" r="2" fill={C.gold} />
            <Rect x="60" y="200" width="4" height="4" fill="white" transform="rotate(45 62 202)" />
            <Rect x="320" y="40" width="4" height="4" fill={C.gold} transform="rotate(45 322 42)" />
          </Svg>

          <View style={styles.heroInner}>
            <View style={styles.checkRing}>
              <Icon name="checkBold" size={56} color="white" strokeWidth={3.5} />
            </View>
            <Text style={styles.heroTitle}>Route Complete</Text>
            <Text style={styles.heroSub}>{today} · Truck T-407</Text>
          </View>
        </LinearGradient>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          {STATS.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={[styles.statValue, { color: s.accent }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Time block */}
        <View style={styles.timeBlock}>
          <Icon name="clock" size={22} color={C.text3} />
          <View style={{ flex: 1 }}>
            <Text style={styles.timeLabel}>Driving time</Text>
            <Text style={styles.timeValue}>
              8h 26m <Text style={styles.timeMeta}>· 7:14a → 3:40p</Text>
            </Text>
          </View>
        </View>

        {/* Checklist */}
        <View style={styles.checklist}>
          <Text style={styles.checklistLabel}>YARD RETURN CHECKLIST</Text>
          {CHECKLIST.map((label, i) => (
            <TouchableOpacity
              key={label}
              onPress={() =>
                setDone((d) => d.map((v, j) => (j === i ? !v : v)))
              }
              style={styles.checkRow}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.checkBox,
                  done[i] && { backgroundColor: C.ok, borderColor: C.ok },
                ]}
              >
                {done[i] && (
                  <Icon name="check" size={14} color="white" strokeWidth={3.5} />
                )}
              </View>
              <Text style={styles.checkLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <BigButton
          kind="primary"
          icon="check"
          onPress={() => router.replace('/(app)/route-list')}
        >
          Return to Home
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  scroll: { paddingBottom: 110 },
  hero: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
    overflow: 'hidden',
  },
  heroInner: { alignItems: 'center', gap: 18 },
  checkRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 32, fontWeight: '800', color: 'white', letterSpacing: -0.6 },
  heroSub: { fontSize: 15, color: 'rgba(255,255,255,0.8)' },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 10,
  },
  statCard: {
    width: '48%',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 14,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    fontFamily: 'Menlo',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.text3,
    marginTop: 2,
    letterSpacing: 0.4,
  },
  timeBlock: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  timeLabel: { fontSize: 14, color: C.text3, fontWeight: '600' },
  timeValue: { fontSize: 18, fontWeight: '700', color: C.text, fontFamily: 'Menlo' },
  timeMeta: { color: C.text3, fontSize: 14, fontWeight: '600' },
  checklist: {
    marginHorizontal: 16,
    padding: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
  },
  checklistLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: C.text3,
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: { fontSize: 15, color: C.text, fontWeight: '500' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 36,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
});
