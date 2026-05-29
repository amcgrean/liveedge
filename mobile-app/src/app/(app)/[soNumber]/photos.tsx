import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#4b5563',
    textAlign: 'center',
    fontSize: 16,
  },
});

export default function PhotosScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        Photo capture feature coming in Phase 4
      </Text>
    </View>
  );
}
