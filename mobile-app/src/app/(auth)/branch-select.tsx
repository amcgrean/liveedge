import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Wordmark } from '@/components/ui/Wordmark';
import { BigButton } from '@/components/ui/BigButton';
import { Icon } from '@/components/ui/Icon';
import { C, BRANCHES, BranchCode } from '@/theme/colors';
import { format } from 'date-fns';

export default function BranchSelectScreen() {
  const { user, setBranch } = useAuth();
  const [selected, setSelected] = useState<BranchCode>(
    (user?.branch as BranchCode) || '20GR'
  );
  const [loading, setLoading] = useState(false);

  const today = format(new Date(), "EEE · MMM d, yyyy · h:mm a");
  const selectedBranch = BRANCHES.find((b) => b.code === selected);
  const initials =
    user?.name
      ?.split(' ')
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'DM';

  const handleStart = async () => {
    try {
      setLoading(true);
      await setBranch(selected);
      router.replace('/(app)/route-list');
    } catch {
      router.replace('/(app)/route-list'); // dev mode falls through
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Wordmark color={C.green} size={22} sub={false} />
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </View>
        <Text style={styles.headline}>
          Which yard are you{'\n'}running from today?
        </Text>
        <Text style={styles.date}>{today}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {BRANCHES.map((b) => {
          const isSelected = b.code === selected;
          return (
            <TouchableOpacity
              key={b.code}
              activeOpacity={0.85}
              onPress={() => setSelected(b.code)}
              style={[
                styles.card,
                isSelected && styles.cardSelected,
              ]}
            >
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: b.dot,
                    shadowColor: b.dot,
                  },
                ]}
              />
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardCode}>{b.code}</Text>
                  <Text style={styles.cardName}>{b.name}</Text>
                </View>
                <Text style={styles.cardAddr}>{b.addr}</Text>
              </View>
              <View
                style={[
                  styles.radioOuter,
                  isSelected && styles.radioOuterSelected,
                ]}
              >
                {isSelected && (
                  <Icon name="checkBold" size={14} color="#ffffff" strokeWidth={3.5} />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <BigButton
          kind="primary"
          icon="arrowRight"
          onPress={handleStart}
          loading={loading}
        >
          Start route from {selectedBranch?.name}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  header: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: C.text, fontSize: 12, fontWeight: '700' },
  headline: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    lineHeight: 28,
    marginTop: 6,
  },
  date: { fontSize: 14, color: C.text3, marginTop: 6 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  cardSelected: {
    borderColor: C.green,
    shadowColor: C.green,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 2 },
  cardCode: { fontSize: 13, fontWeight: '700', color: C.text3, fontFamily: 'Menlo' },
  cardName: { fontSize: 19, fontWeight: '700', color: C.text },
  cardAddr: { fontSize: 14, color: C.text3 },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: C.line,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: { borderColor: C.green, backgroundColor: C.green },
  footer: {
    padding: 16,
    paddingBottom: 36,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
});
