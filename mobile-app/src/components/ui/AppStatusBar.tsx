import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Icon } from './Icon';
import { C } from '@/theme/colors';

interface AppStatusBarProps {
  branchLabel?: string;
  branchDot?: string;
  online?: boolean;
  syncCount?: number;
  title?: string;
  initials?: string;
  onMenu?: () => void;
  onProfile?: () => void;
  showMenu?: boolean;
}

export function AppStatusBar({
  branchLabel,
  branchDot,
  online = true,
  syncCount = 0,
  title,
  initials = 'DM',
  onMenu,
  onProfile,
  showMenu = true,
}: AppStatusBarProps) {
  return (
    <View style={styles.bar}>
      {showMenu && (
        <TouchableOpacity onPress={onMenu} style={styles.iconButton}>
          <Icon name="menu" size={22} color={C.text} />
        </TouchableOpacity>
      )}
      <View style={styles.titleWrap}>
        {title ? (
          <Text style={styles.title}>{title}</Text>
        ) : (
          <View style={styles.branchRow}>
            {branchDot && (
              <View style={[styles.branchDot, { backgroundColor: branchDot }]} />
            )}
            <Text style={styles.branchText}>{branchLabel}</Text>
          </View>
        )}
      </View>
      <View
        style={[
          styles.statusChip,
          {
            backgroundColor: online ? C.okSoft : C.warnSoft,
            borderColor: online ? C.okBorder : C.warnBorder,
          },
        ]}
      >
        <Icon
          name={online ? 'wifi' : 'cloudOff'}
          size={14}
          color={online ? C.ok : C.warn}
          strokeWidth={2.4}
        />
        <Text
          style={[
            styles.statusText,
            { color: online ? C.ok : C.warn },
          ]}
        >
          {online ? 'ONLINE' : 'OFFLINE'}
        </Text>
        {syncCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{syncCount}</Text>
          </View>
        )}
      </View>
      <TouchableOpacity onPress={onProfile} style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  titleWrap: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontWeight: '700', color: C.text },
  branchRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  branchDot: { width: 8, height: 8, borderRadius: 4 },
  branchText: { fontSize: 14, fontWeight: '600', color: C.text },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: C.warn,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
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
});
