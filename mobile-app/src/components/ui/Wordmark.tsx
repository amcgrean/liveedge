import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Path } from 'react-native-svg';
import { C } from '@/theme/colors';

interface WordmarkProps {
  color?: string;
  size?: number;
  sub?: boolean;
  subColor?: string;
}

export function Wordmark({ color = C.green, size = 32, sub = true, subColor }: WordmarkProps) {
  const accentColor = color === '#ffffff' ? 'rgba(255,255,255,0.85)' : C.gold;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Svg width={size + 4} height={size + 4} viewBox="0 0 40 40">
          <Rect x="2" y="2" width="36" height="36" rx="8" fill={color} />
          <Path
            d="M10 28 L10 12 L20 12 L20 16 L14 16 L14 18 L19 18 L19 22 L14 22 L14 24 L20 24 L20 28 Z"
            fill="white"
          />
          <Path
            d="M22 12 L26 12 L29 24 L32 12 L36 12 L31 28 L27 28 Z"
            fill="white"
          />
        </Svg>
        <Text style={[styles.wordmark, { fontSize: size * 0.78, color }]}>
          Live<Text style={{ color: accentColor }}>Edge</Text>
        </Text>
      </View>
      {sub && (
        <Text style={[styles.sub, { color: subColor || C.text3 }]}>
          Delivery Driver
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmark: {
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  sub: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
  },
});
