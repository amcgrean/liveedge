import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { C } from '@/theme/colors';

type PillKind = 'pending' | 'delivered' | 'skipped' | 'inroute';

interface PillProps {
  kind?: PillKind;
  children: React.ReactNode;
  style?: ViewStyle;
}

const KIND_STYLES: Record<PillKind, { color: string; borderColor: string; backgroundColor: string }> = {
  pending: { color: C.warn, borderColor: C.warn, backgroundColor: 'transparent' },
  delivered: { color: '#ffffff', borderColor: C.ok, backgroundColor: C.ok },
  skipped: { color: C.err, borderColor: C.err, backgroundColor: 'transparent' },
  inroute: { color: C.green, borderColor: C.green, backgroundColor: C.okSoft },
};

export function Pill({ kind = 'pending', children, style }: PillProps) {
  const k = KIND_STYLES[kind];
  return (
    <View
      style={[
        styles.pill,
        { borderColor: k.borderColor, backgroundColor: k.backgroundColor },
        style,
      ]}
    >
      <Text style={[styles.text, { color: k.color }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
