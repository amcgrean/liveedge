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
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { AppStatusBar } from '@/components/ui/AppStatusBar';
import { Icon, IconName } from '@/components/ui/Icon';
import { C, BRANCHES, BranchCode } from '@/theme/colors';

interface ProfileRowProps {
  icon: IconName;
  label: string;
  detail?: string;
  danger?: boolean;
  last?: boolean;
  onPress?: () => void;
}

function ProfileRow({ icon, label, detail, danger, last, onPress }: ProfileRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, !last && styles.rowBorder]}
    >
      <View
        style={[
          styles.rowIcon,
          { backgroundColor: danger ? C.errSoft : C.surface2 },
        ]}
      >
        <Icon name={icon} size={18} color={danger ? C.err : C.text2} strokeWidth={2.2} />
      </View>
      <View style={styles.rowLabelWrap}>
        <Text
          style={[
            styles.rowLabel,
            { color: danger ? C.err : C.text, fontWeight: danger ? '700' : '600' },
          ]}
        >
          {label}
        </Text>
      </View>
      {detail && <Text style={styles.rowDetail}>{detail}</Text>}
      {!danger && <Icon name="chevronRight" size={18} color={C.text4} />}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const branchCode = (user?.branch || '20GR') as BranchCode;
  const branch = BRANCHES.find((b) => b.code === branchCode);

  const initials =
    user?.name
      ?.split(' ')
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'DM';

  const handleLogout = () => {
    Alert.alert('Sign out', 'Sign out of LiveEdge Driver?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <AppStatusBar
        title="Profile"
        branchLabel={`${branchCode} · ${branch?.name}`}
        branchDot={branch?.dot}
        online={true}
        initials={initials}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero card */}
        <View style={styles.hero}>
          <LinearGradient
            colors={[C.green, C.greenDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroAvatar}
          >
            <Text style={styles.heroAvatarText}>{initials}</Text>
          </LinearGradient>
          <View style={styles.heroTextBlock}>
            <Text style={styles.heroName}>{user?.name || 'Driver'}</Text>
            <Text style={styles.heroEmail}>{user?.email || ''}</Text>
          </View>
          <View style={styles.heroChips}>
            <View style={styles.heroChipGreen}>
              <View style={[styles.heroChipDot, { backgroundColor: branch?.dot }]} />
              <Text style={styles.heroChipGreenText}>
                {branchCode} · {branch?.name.toUpperCase()}
              </Text>
            </View>
            <View style={styles.heroChipGray}>
              <Text style={styles.heroChipGrayText}>Truck T-407</Text>
            </View>
          </View>
        </View>

        {/* Account group */}
        <Text style={styles.groupLabel}>ACCOUNT</Text>
        <View style={styles.card}>
          <ProfileRow
            icon="truck"
            label="Change Branch"
            detail={`${branchCode} ${branch?.name}`}
            onPress={() => router.push('/(auth)/branch-select')}
          />
          <ProfileRow icon="user" label="Edit Profile" />
          <ProfileRow icon="mail" label="Notification Preferences" last />
        </View>

        {/* App group */}
        <Text style={styles.groupLabel}>APP</Text>
        <View style={styles.card}>
          <ProfileRow
            icon="cloud"
            label="Sync Queue"
            detail="0 pending"
            onPress={() => router.push('/(app)/sync-queue')}
          />
          <ProfileRow icon="settings" label="App Settings" />
          <ProfileRow icon="info" label="Privacy Policy" />
          <ProfileRow icon="info" label="App Version" detail="1.0.0 · 2486" last />
        </View>

        {/* Logout */}
        <View style={[styles.card, styles.logoutCard]}>
          <ProfileRow icon="logout" label="Log Out" danger last onPress={handleLogout} />
        </View>

        <Text style={styles.footer}>Signed in 2 days ago · iPhone 15</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  scroll: { paddingBottom: 30 },
  hero: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    alignItems: 'center',
    gap: 12,
  },
  heroAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  heroAvatarText: { color: '#ffffff', fontSize: 30, fontWeight: '800' },
  heroTextBlock: { alignItems: 'center' },
  heroName: { fontSize: 22, fontWeight: '700', color: C.text },
  heroEmail: { fontSize: 14, color: C.text3, marginTop: 2 },
  heroChips: { flexDirection: 'row', gap: 6 },
  heroChipGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: C.okSoft,
    borderWidth: 1,
    borderColor: C.okBorder,
    borderRadius: 12,
  },
  heroChipDot: { width: 8, height: 8, borderRadius: 4 },
  heroChipGreenText: { fontSize: 12, fontWeight: '700', color: C.ok },
  heroChipGray: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
  },
  heroChipGrayText: { fontSize: 12, fontWeight: '600', color: C.text2 },
  groupLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.text3,
    letterSpacing: 0.6,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 8,
  },
  card: {
    backgroundColor: '#ffffff',
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    overflow: 'hidden',
  },
  logoutCard: { marginTop: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabelWrap: { flex: 1 },
  rowLabel: { fontSize: 16 },
  rowDetail: { fontSize: 14, color: C.text3 },
  footer: {
    fontSize: 12,
    color: C.text4,
    textAlign: 'center',
    marginTop: 18,
  },
});
