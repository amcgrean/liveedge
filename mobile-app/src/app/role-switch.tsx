import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { Wordmark } from '@/components/ui/Wordmark';
import { BigButton } from '@/components/ui/BigButton';
import { Icon, IconName } from '@/components/ui/Icon';
import { C, S, BRANCHES, BranchCode } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { useRole, AppRole } from '@/context/RoleContext';

interface RoleOption { id: AppRole; label: string; desc: string; icon: IconName; accent: string }

const ROLE_META: Record<AppRole, RoleOption> = {
  sales: { id: 'sales', label: 'Sales & Estimating', desc: 'Quotes, orders, price & availability', icon: 'tag', accent: C.green },
  driver: { id: 'driver', label: 'Delivery Driver', desc: "Today's route, proof of delivery", icon: 'truck', accent: S.blue },
};

export default function RoleSwitchScreen() {
  const { user } = useAuth();
  const { roles, activeRole, setActiveRole } = useRole();
  const [selected, setSelected] = React.useState<AppRole>(activeRole || roles[0] || 'sales');

  const branchCode = (user?.branch || '20GR') as BranchCode;
  const branch = BRANCHES.find((b) => b.code === branchCode);

  const handleEnter = async () => {
    await setActiveRole(selected);
    router.replace(selected === 'sales' ? '/(sales)/home' : '/(app)/route-list');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Wordmark color={C.green} size={24} sub={false} />
        <Text style={styles.headline}>How are you working today?</Text>
        <Text style={styles.sub}>You have two roles — switch anytime from your profile.</Text>
      </View>

      <View style={styles.body}>
        {roles.map((id) => {
          const r = ROLE_META[id];
          const on = id === selected;
          return (
            <TouchableOpacity
              key={id}
              activeOpacity={0.85}
              onPress={() => setSelected(id)}
              style={[styles.card, { borderColor: on ? r.accent : C.line }, on && { shadowColor: r.accent, shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3 }]}
            >
              <View style={[styles.cardIcon, { backgroundColor: r.accent + '14' }]}>
                <Icon name={r.icon} size={28} color={r.accent} strokeWidth={2.1} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardLabel}>{r.label}</Text>
                <Text style={styles.cardDesc}>{r.desc}</Text>
              </View>
              <View style={[styles.radio, { borderColor: on ? r.accent : C.line, backgroundColor: on ? r.accent : '#fff' }]}>
                {on && <Icon name="check" size={15} color="#fff" strokeWidth={3.5} />}
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={styles.note}>
          <Icon name="info" size={16} color={C.text4} />
          <Text style={styles.noteText}>Your branch ({branchCode} {branch?.name}) and login carry across both roles.</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <BigButton kind="primary" icon="arrowRight" onPress={handleEnter}>
          {selected === 'sales' ? 'Enter Sales' : 'Enter Driver'}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  header: { backgroundColor: '#fff', paddingTop: 54, paddingHorizontal: 24, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: C.line },
  headline: { fontSize: 23, fontWeight: '800', color: C.text, marginTop: 18, lineHeight: 28 },
  sub: { fontSize: 14, color: C.text3, marginTop: 6 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 18, gap: 14 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18, backgroundColor: '#fff', borderWidth: 1.5, borderRadius: 18 },
  cardIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: 18, fontWeight: '800', color: C.text },
  cardDesc: { fontSize: 13.5, color: C.text3, marginTop: 3 },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 6, marginTop: 2 },
  noteText: { flex: 1, fontSize: 12.5, color: C.text4, lineHeight: 18 },
  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 36, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
});
