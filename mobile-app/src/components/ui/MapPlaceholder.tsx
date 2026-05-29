import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { C } from '@/theme/colors';

interface MapPlaceholderProps {
  height?: number;
  distance?: string;
}

export function MapPlaceholder({ height = 180, distance }: MapPlaceholderProps) {
  return (
    <View style={[styles.wrap, { height }]}>
      <LinearGradient
        colors={['#e8eef0', '#dfe6e9']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 393 200"
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFillObject}
      >
        {/* Roads */}
        <Path d="M-10 60 L 200 60 L 220 80 L 410 80" stroke="#fff" strokeWidth="14" fill="none" />
        <Path d="M-10 60 L 200 60 L 220 80 L 410 80" stroke="#cfd6db" strokeWidth="1" fill="none" />
        <Path d="M120 -10 L 120 80 L 140 100 L 140 210" stroke="#fff" strokeWidth="10" fill="none" />
        <Path d="M120 -10 L 120 80 L 140 100 L 140 210" stroke="#cfd6db" strokeWidth="1" fill="none" />
        <Path d="M280 -10 L 280 210" stroke="#fff" strokeWidth="8" fill="none" />
        <Path d="M-10 150 L 410 150" stroke="#fff" strokeWidth="8" fill="none" />
        {/* park / lot */}
        <Rect x="200" y="100" width="50" height="38" fill="#cfe4d1" />
        <Rect x="20" y="100" width="80" height="36" fill="#e2e8eb" />
        {/* route line */}
        <Path
          d="M40 175 L 120 175 L 140 100 L 220 80 L 280 80 L 280 130"
          stroke={C.green}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="6 4"
        />
      </Svg>
      {/* destination pin */}
      <View style={styles.pin}>
        <Svg width="36" height="44" viewBox="0 0 36 44">
          <Path
            d="M18 0 C8 0 0 8 0 18 C0 30 18 44 18 44 C18 44 36 30 36 18 C36 8 28 0 18 0 Z"
            fill={C.green}
          />
          <Circle cx="18" cy="17" r="6" fill="white" />
        </Svg>
      </View>
      {/* driver dot */}
      <View style={styles.driverDot} />
      {distance && (
        <View style={styles.distancePill}>
          <Text style={styles.distanceText}>{distance}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  pin: {
    position: 'absolute',
    left: '70%',
    top: '40%',
  },
  driverDot: {
    position: 'absolute',
    left: '10%',
    bottom: '15%',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2563eb',
    borderWidth: 3,
    borderColor: 'white',
    shadowColor: '#2563eb',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  distancePill: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  distanceText: { fontSize: 13, fontWeight: '700', color: C.text },
});
