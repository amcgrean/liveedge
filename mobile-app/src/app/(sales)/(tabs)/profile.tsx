import React from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useRole } from '@/context/RoleContext';
import { useOnline } from '@/hooks/useOnline';
import { useOutbox } from '@/storage/outbox';
import { C, S, BRANCHES, BranchCode } from '@/theme/colors';
import { Icon, IconName } from '@/components/ui/Icon';
import { SalesTopBar } from '@/components/sales/kit';

function Row({ icon, label, detail, danger, last, accent, onPress }: {
  icon: IconName; label: string; detail?: string; danger?: boolean; last?: boolean; accent?: string; onPress?: () => void;
}) {
  const color = danger ? C.err : accent || C.text2;
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={[styles.row, { borderBottomWidth: last ? 0 : 1 }]}>
      <View style={[styles.rowIcon, { backgroundColor: danger ? C.errSoft : accent ? accent + '14' : C.surface2 }]}>
        <Icon name={icon} size={18} color={color} strokeWidth={2.2} />
      </View>
      <Text style={[styles.rowLabel, { color: danger ? C.err : C.text, fontWeight: danger ? '700' : '600' }]}>{label}</Text>
      {detail && <Text style={styles.rowDetail}>{detail}</Text>}
      {!danger && <Icon name="chevronRight" size={18} color={C.text4} />}
    </TouchableOpacity>
  );
}

export default function SalesProfileScreen() {
  const { user, logout } = useAuth();
  const { roles, setActiveRole } = useRole();
  const online = useOnline();
  const outboxItems = useOutbox();
  const queue = outboxItems.filter((i) => i.status !== 'synced').length;

  const branchCode = (user?.branch || '20GR') as BranchCode;
  const branch = BRANCHES.find((b) => b.code === branchCode);
  const name = user?.name || 'Renee Vasquez';
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const canDrive = roles.includes('driver');

  const switchToDriver = async () => {
    await setActiveRole('driver');
    router.replace('/(app)/route-list');
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <SalesTopBar title="Profile" online={online} queue={queue} />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroAvatar}><Text style={styles.heroAvatarText}>{initials}</Text></View>
          <Text style={styles.heroName}>{name}</Text>
          <Text style={styles.heroSub}>{user?.email || 'r.vasquez@beisser.com'} · Inside Sales</Text>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: C.okSoft, borderColor: C.okBorder }]}>
              <View style={[styles.badgeDot, { backgroundColor: branch?.dot }]} />
              <Text style={[styles.badgeText, { color: C.ok }]}>{branchCode} · {branch?.name?.toUpperCase()}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: S.deliverySoft, borderColor: '#b6e6c8' }]}>
              <Icon name="tag" size={12} color={C.green} />
              <Text style={[styles.badgeText, { color: C.green }]}>SALES</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          {/* Role switch — prominent (only for dual-role users) */}
          {canDrive && (
            <TouchableOpacity activeOpacity={0.85} onPress={switchToDriver} style={styles.switchCard}>
              <View style={styles.switchIcon}><Icon name="swap" size={22} color={S.blue} strokeWidth={2.2} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>Switch to Driver</Text>
                <Text style={styles.switchSub}>You're set up for delivery routes too</Text>
              </View>
              <Icon name="chevronRight" size={20} color={C.text4} />
            </TouchableOpacity>
          )}

          <Text style={styles.groupLabel}>ACCOUNT</Text>
          <View style={styles.group}>
            <Row icon="building" label="Change Branch" detail={`${branchCode} ${branch?.name}`} onPress={() => router.push('/(auth)/branch-select')} />
            <Row icon="user" label="Edit Profile" />
            <Row icon="mail" label="Notification Preferences" last />
          </View>

          <Text style={styles.groupLabel}>APP</Text>
          <View style={styles.group}>
            <Row icon="cloud" label="Offline Outbox" detail={`${queue} pending`} accent={C.green} />
            <Row icon="settings" label="App Settings" />
            <Row icon="info" label="App Version" detail="1.0.0 · 2486" last />
          </View>

          <View style={[styles.group, { marginTop: 20 }]}>
            <Row icon="logout" label="Log Out" danger last onPress={handleLogout} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  hero: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 22, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: C.line, alignItems: 'center', gap: 12 },
  heroAvatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  heroAvatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  heroName: { fontSize: 21, fontWeight: '800', color: C.text },
  heroSub: { fontSize: 13.5, color: C.text3, marginTop: -8 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  badgeDot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  body: { paddingHorizontal: 12, paddingTop: 16, paddingBottom: 30 },
  switchCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 15, marginBottom: 18, backgroundColor: '#fff', borderWidth: 1.5, borderColor: S.blue, borderRadius: 16 },
  switchIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: S.blueSoft, alignItems: 'center', justifyContent: 'center' },
  switchTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  switchSub: { fontSize: 13, color: C.text3 },
  groupLabel: { fontSize: 12, fontWeight: '800', color: C.text3, letterSpacing: 0.8, paddingHorizontal: 6, paddingBottom: 8, paddingTop: 20 },
  group: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomColor: C.lineSoft },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 16 },
  rowDetail: { fontSize: 14, color: C.text3 },
});
