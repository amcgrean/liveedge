// LiveEdge Sales — shared component kit (React Native).
//
// Direct translation of the Claude Design `sales-core.jsx` prototype into RN.
// Builds on the Driver tokens (C, FONT) and adds the sales vocabulary:
// status pills, top bar, tab bar, search bar, KPI tiles, live-freshness cue,
// segmented tabs, flow step header, skeletons, list row, monogram, empty state.

import React, { useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated,
  ViewStyle, StyleProp, Pressable, ScrollView,
} from 'react-native';
import { Icon, IconName } from '@/components/ui/Icon';
import { C, S } from '@/theme/colors';

const MONO = 'Menlo';

// ── Status pill — order lifecycle + quote/write states ────────
export type PillKind =
  | 'open' | 'picking' | 'staged' | 'delivery' | 'invoiced'
  | 'draft' | 'queued' | 'submitted' | 'live' | 'info'
  | 'full' | 'partial' | 'back';

const PILL_MAP: Record<PillKind, [string, string]> = {
  open: [S.open, S.openSoft],
  picking: [S.picking, S.pickingSoft],
  staged: [S.staged, S.stagedSoft],
  delivery: [S.delivery, S.deliverySoft],
  invoiced: [S.invoiced, S.invoicedSoft],
  draft: [S.draft, S.draftSoft],
  queued: [C.warn, C.warnSoft],
  submitted: [C.ok, C.okSoft],
  live: [S.live, S.liveSoft],
  info: [S.blue, S.blueSoft],
  full: [S.staged, S.stagedSoft],
  partial: [S.picking, S.pickingSoft],
  back: [S.open, S.openSoft],
};

export function StatusPill({
  kind = 'open', children, solid = false, size = 'md',
}: { kind?: PillKind; children: React.ReactNode; solid?: boolean; size?: 'sm' | 'md' }) {
  const [c, soft] = PILL_MAP[kind] || PILL_MAP.open;
  const h = size === 'sm' ? 22 : 26;
  return (
    <View style={{
      height: h, paddingHorizontal: size === 'sm' ? 9 : 11, borderRadius: h / 2,
      borderWidth: 1.5, borderColor: solid ? c : 'transparent',
      backgroundColor: solid ? c : soft, alignSelf: 'flex-start',
      flexDirection: 'row', alignItems: 'center',
    }}>
      <Text style={{
        fontSize: size === 'sm' ? 11 : 12, fontWeight: '800', letterSpacing: 0.4,
        textTransform: 'uppercase', color: solid ? '#fff' : c,
      }}>{children}</Text>
    </View>
  );
}

// ── Monogram tile ─────────────────────────────────────────────
export function Monogram({
  text, size = 44, color = C.green, square = true,
}: { text: string; size?: number; color?: string; square?: boolean }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: square ? size * 0.27 : size / 2,
      backgroundColor: color + '14', alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.34, fontWeight: '800', color, letterSpacing: -0.4 }}>{text}</Text>
    </View>
  );
}

// ── App top bar — clears iOS status bar, shows branch + online ─
export function SalesTopBar({
  branchLabel = '20GR · Grimes', branchDot = C.grimes, online = true, queue = 0,
  title, back, onBack, onBranch, onSearch,
}: {
  branchLabel?: string; branchDot?: string; online?: boolean; queue?: number;
  title?: string; back?: string; onBack?: () => void; onBranch?: () => void; onSearch?: () => void;
}) {
  return (
    <View style={styles.topBar}>
      <View style={styles.topBarRow}>
        {back ? (
          <TouchableOpacity onPress={onBack} style={styles.topBack} activeOpacity={0.6}>
            <Icon name="chevronLeft" size={22} color={C.green} />
            <Text style={styles.topBackText}>{back}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onSearch} style={styles.topIconBtn} activeOpacity={0.6}>
            <Icon name="search" size={22} color={C.text2} />
          </TouchableOpacity>
        )}
        <View style={[styles.topCenter, { alignItems: back ? 'center' : 'flex-start' }]}>
          {title ? (
            <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
          ) : (
            <TouchableOpacity onPress={onBranch} style={styles.branchBtn} activeOpacity={0.6}>
              <View style={[styles.branchDot, { backgroundColor: branchDot }]} />
              <Text style={styles.branchLabel}>{branchLabel}</Text>
              <Icon name="chevronDown" size={16} color={C.text4} />
            </TouchableOpacity>
          )}
        </View>
        <View style={[styles.onlinePill, { backgroundColor: online ? C.okSoft : C.warnSoft, borderColor: online ? C.okBorder : C.warnBorder }]}>
          <Icon name={online ? 'wifi' : 'cloudOff'} size={13} color={online ? C.ok : C.warn} strokeWidth={2.4} />
          <Text style={[styles.onlineText, { color: online ? C.ok : C.warn }]}>{online ? 'LIVE' : 'OFFLINE'}</Text>
          {queue > 0 && (
            <View style={styles.queueBadge}><Text style={styles.queueBadgeText}>{queue}</Text></View>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Custom bottom tab bar (for expo-router <Tabs tabBar={…}>) ──
const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'customers', label: 'Customers', icon: 'users' },
  { id: 'orders', label: 'Orders', icon: 'clipboard' },
  { id: 'items', label: 'Items', icon: 'tag' },
  { id: 'profile', label: 'Me', icon: 'user' },
];

export function SalesTabBar({ active, onNavigate }: { active: string; onNavigate: (id: string) => void }) {
  return (
    <View style={styles.tabBar}>
      {TABS.map((t) => {
        const on = t.id === active;
        return (
          <TouchableOpacity key={t.id} style={styles.tab} onPress={() => onNavigate(t.id)} activeOpacity={0.7}>
            <Icon name={t.icon} size={23} color={on ? C.green : C.text4} strokeWidth={on ? 2.4 : 2} />
            <Text style={[styles.tabLabel, { color: on ? C.green : C.text4, fontWeight: on ? '800' : '600' }]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Search bar — pressable or editable ────────────────────────
export function SearchBar({
  placeholder = 'Search customers, orders, items…', value, onChangeText, onPress,
  editable = false, big = false, scope, autoFocus,
}: {
  placeholder?: string; value?: string; onChangeText?: (t: string) => void; onPress?: () => void;
  editable?: boolean; big?: boolean; scope?: string; autoFocus?: boolean;
}) {
  const focused = !!value;
  const inner = (
    <View style={[styles.search, { height: big ? 56 : 48, borderColor: focused ? C.green : C.line }]}>
      <Icon name="search" size={big ? 22 : 20} color={focused ? C.green : C.text3} strokeWidth={2.2} />
      {editable ? (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.text4}
          autoFocus={autoFocus}
          style={[styles.searchInput, { fontSize: big ? 17 : 16 }]}
        />
      ) : (
        <Text style={[styles.searchText, { fontSize: big ? 17 : 16, color: value ? C.text : C.text4 }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
      )}
      {scope ? (
        <View style={styles.scopeChip}><Text style={styles.scopeChipText}>{scope}</Text></View>
      ) : value && !editable ? (
        <Icon name="x" size={18} color={C.text4} />
      ) : null}
    </View>
  );
  if (editable) return inner;
  return <Pressable onPress={onPress}>{inner}</Pressable>;
}

// ── KPI tile ──────────────────────────────────────────────────
export function KPITile({
  value, label, icon, accent = C.green, sub, trend,
}: { value: string; label: string; icon: IconName; accent?: string; sub?: string; trend?: string }) {
  return (
    <View style={styles.kpi}>
      <View style={styles.kpiTop}>
        <View style={[styles.kpiIcon, { backgroundColor: accent + '14' }]}>
          <Icon name={icon} size={18} color={accent} strokeWidth={2.2} />
        </View>
        {trend && <Text style={[styles.kpiTrend, { color: trend.startsWith('+') ? C.ok : C.text3 }]}>{trend}</Text>}
      </View>
      <View>
        <Text style={styles.kpiValue}>{value}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
        {sub && <Text style={styles.kpiSub}>{sub}</Text>}
      </View>
    </View>
  );
}

// ── Live freshness pill — pulsing dot + "as of" ───────────────
export function LiveBadge({ ago = '12s ago', label = 'Live ERP', tone = 'live' }: { ago?: string; label?: string; tone?: 'live' | 'stale' }) {
  const c = tone === 'live' ? S.live : C.text3;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (tone !== 'live') return;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [tone, pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 2.6, 2.6] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.6, 0, 0] });
  return (
    <View style={[styles.live, { backgroundColor: tone === 'live' ? S.liveSoft : C.surface2, borderColor: tone === 'live' ? '#b6e6c8' : C.line }]}>
      <View style={styles.liveDotWrap}>
        {tone === 'live' && <Animated.View style={[styles.liveDot, { backgroundColor: c, transform: [{ scale }], opacity }]} />}
        <View style={[styles.liveDot, { backgroundColor: c }]} />
      </View>
      <Text style={[styles.liveLabel, { color: c }]}>{label}</Text>
      <Text style={styles.liveAgo}> · {ago}</Text>
    </View>
  );
}

// ── Segmented tabs (pill row, scrollable) ─────────────────────
export function SegTabs({ tabs, active, onSelect }: { tabs: string[]; active: string; onSelect?: (t: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segScroll}>
      {tabs.map((t) => {
        const on = t === active;
        return (
          <TouchableOpacity
            key={t}
            onPress={() => onSelect?.(t)}
            activeOpacity={0.7}
            style={[styles.segPill, { borderColor: on ? C.green : C.line, backgroundColor: on ? C.green : '#fff' }]}
          >
            <Text style={[styles.segPillText, { color: on ? '#fff' : C.text2 }]}>{t}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ── Flow step header (New Quote / New Order) ──────────────────
export function StepHeader({ steps, current }: { steps: string[]; current: number }) {
  return (
    <View style={styles.stepRow}>
      {steps.map((s, i) => {
        const done = i < current, on = i === current;
        return (
          <React.Fragment key={s}>
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, {
                backgroundColor: done ? C.green : on ? '#fff' : C.surface2,
                borderColor: done || on ? C.green : C.line,
              }]}>
                {done ? <Icon name="check" size={15} color="#fff" strokeWidth={3.5} />
                  : <Text style={[styles.stepNum, { color: on ? C.green : C.text4 }]}>{i + 1}</Text>}
              </View>
              <Text style={[styles.stepLabel, { color: on ? C.green : C.text4, fontWeight: on ? '800' : '600' }]}>{s}</Text>
            </View>
            {i < steps.length - 1 && <View style={[styles.stepBar, { backgroundColor: done ? C.green : C.line }]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Skeleton primitives ───────────────────────────────────────
export function Skel({ w = '100%' as ViewStyle['width'], h = 14, r = 7, style }: { w?: ViewStyle['width']; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const shimmer = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 0.4, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  return <Animated.View style={[{ width: w, height: h, borderRadius: r, backgroundColor: '#e3e6ea', opacity: shimmer }, style]} />;
}

export function SkelRow() {
  return (
    <View style={styles.skelRow}>
      <Skel w={44} h={44} r={11} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skel w="62%" h={14} />
        <Skel w="42%" h={11} />
      </View>
      <Skel w={56} h={24} r={12} />
    </View>
  );
}

// ── Generic list row ──────────────────────────────────────────
export function ListRow({
  leading, title, sub, meta, trailing, last, onPress,
}: {
  leading?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode;
  meta?: React.ReactNode; trailing?: React.ReactNode; last?: boolean; onPress?: () => void;
}) {
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap onPress={onPress} activeOpacity={0.7} style={[styles.listRow, { borderBottomWidth: last ? 0 : 1 }]}>
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.listRowTitleRow}>
          {typeof title === 'string'
            ? <Text style={styles.listRowTitle} numberOfLines={1}>{title}</Text>
            : <View style={{ flex: 1 }}>{title}</View>}
        </View>
        {sub != null && (typeof sub === 'string'
          ? <Text style={styles.listRowSub} numberOfLines={1}>{sub}</Text>
          : <View style={{ marginTop: 2 }}>{sub}</View>)}
        {meta != null && <View style={{ marginTop: 5 }}>{meta}</View>}
      </View>
      {trailing}
    </Wrap>
  );
}

// ── Empty state ───────────────────────────────────────────────
export function EmptyState({
  icon, title, body, cta, ctaIcon, onCta,
}: { icon: IconName; title: string; body: React.ReactNode; cta?: string; ctaIcon?: IconName; onCta?: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Icon name={icon} size={38} color={C.text4} strokeWidth={1.8} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {typeof body === 'string' ? <Text style={styles.emptyBody}>{body}</Text> : <View style={styles.emptyBodyWrap}>{body}</View>}
      {cta && (
        <TouchableOpacity onPress={onCta} activeOpacity={0.85} style={styles.emptyCta}>
          {ctaIcon && <Icon name={ctaIcon} size={19} color="#fff" strokeWidth={2.3} />}
          <Text style={styles.emptyCtaText}>{cta}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Row container for a pair of action buttons (sticky footers) ──
export function BigButtonRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.btnRow, style]}>{children}</View>;
}

// Re-export the mono font name for screens that render monospace numerals.
export { MONO };

const styles = StyleSheet.create({
  // top bar
  topBar: { paddingTop: 54, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.line },
  topBarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12, minHeight: 56 },
  topBack: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingRight: 6 },
  topBackText: { color: C.green, fontSize: 16, fontWeight: '600' },
  topIconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  topCenter: { flex: 1, minWidth: 0 },
  topTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  branchBtn: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  branchDot: { width: 9, height: 9, borderRadius: 5 },
  branchLabel: { fontSize: 15, fontWeight: '700', color: C.text },
  onlinePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 11, borderWidth: 1 },
  onlineText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  queueBadge: { minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: C.warn, alignItems: 'center', justifyContent: 'center', marginLeft: 1 },
  queueBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  // tab bar
  tabBar: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.97)', borderTopWidth: 1, borderTopColor: C.line, paddingBottom: 22 },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingTop: 9, paddingBottom: 4 },
  tabLabel: { fontSize: 10.5, letterSpacing: 0.1 },
  // search
  search: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, backgroundColor: '#fff', borderWidth: 1.5, borderRadius: 14 },
  searchInput: { flex: 1, color: C.text, fontWeight: '600', padding: 0 },
  searchText: { flex: 1, fontWeight: '400' },
  scopeChip: { backgroundColor: C.surface2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  scopeChipText: { fontSize: 11, fontWeight: '800', color: C.text3, letterSpacing: 0.4 },
  // kpi
  kpi: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14, gap: 8 },
  kpiTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kpiIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  kpiTrend: { fontSize: 11, fontWeight: '800' },
  kpiValue: { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: -0.6, fontFamily: MONO },
  kpiLabel: { fontSize: 12.5, fontWeight: '600', color: C.text3, marginTop: 5 },
  kpiSub: { fontSize: 11, color: C.text4, marginTop: 2 },
  // live badge
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingLeft: 8, paddingRight: 10, borderRadius: 11, borderWidth: 1, alignSelf: 'flex-start' },
  liveDotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  liveDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  liveLabel: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.2 },
  liveAgo: { fontSize: 11.5, fontWeight: '600', color: C.text3 },
  // seg tabs
  segScroll: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  segPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
  segPillText: { fontSize: 13.5, fontWeight: '700' },
  // step header
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2 },
  stepItem: { alignItems: 'center', gap: 6 },
  stepDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 13, fontWeight: '800', fontFamily: MONO },
  stepLabel: { fontSize: 10.5 },
  stepBar: { flex: 1, height: 2, marginHorizontal: 4, marginBottom: 18 },
  // skeletons
  skelRow: { flexDirection: 'row', gap: 12, padding: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, alignItems: 'center' },
  // list row
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 13, borderBottomColor: C.lineSoft, backgroundColor: '#fff' },
  listRowTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  listRowTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text },
  listRowSub: { fontSize: 13.5, color: C.text3, marginTop: 2 },
  // empty
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: { width: 84, height: 84, borderRadius: 24, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 19, fontWeight: '800', color: C.text, textAlign: 'center' },
  emptyBody: { fontSize: 14.5, color: C.text3, marginTop: 8, lineHeight: 21, textAlign: 'center', maxWidth: 280 },
  emptyBodyWrap: { marginTop: 8, maxWidth: 280 },
  emptyCta: { marginTop: 22, height: 48, paddingHorizontal: 22, borderRadius: 12, backgroundColor: C.green, flexDirection: 'row', alignItems: 'center', gap: 9 },
  emptyCtaText: { fontSize: 15.5, fontWeight: '700', color: '#fff' },
  // button row
  btnRow: { flexDirection: 'row', gap: 10, marginHorizontal: 14, marginTop: 16 },
});
