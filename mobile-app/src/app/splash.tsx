import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Wordmark } from '@/components/ui/Wordmark';
import { C } from '@/theme/colors';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <Wordmark color="#ffffff" size={44} subColor="rgba(255,255,255,0.78)" />

      <View style={styles.loadingBlock}>
        <Svg width="40" height="40" viewBox="0 0 40 40">
          <Circle cx="20" cy="20" r="17" stroke="rgba(255,255,255,0.18)" strokeWidth="3" fill="none" />
          <Path d="M 20 3 A 17 17 0 0 1 37 20" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" />
        </Svg>
        <Text style={styles.loadingText}>Loading your route…</Text>
      </View>

      <Text style={styles.version}>v1.0.0 · BUILD 2486</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBlock: {
    position: 'absolute',
    bottom: 90,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
  },
  version: {
    position: 'absolute',
    bottom: 30,
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.5,
    fontWeight: '600',
  },
});
