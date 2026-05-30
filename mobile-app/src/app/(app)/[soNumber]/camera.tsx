import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, router } from 'expo-router';
import Svg, { Line } from 'react-native-svg';
import { Icon } from '@/components/ui/Icon';
import { BigButton } from '@/components/ui/BigButton';
import { C } from '@/theme/colors';
import { useDriverRoute } from '@/hooks/useDriverRoute';
import { photoStore, usePhotos } from '@/data/photoStore';

export default function CameraScreen() {
  const { soNumber } = useLocalSearchParams<{ soNumber: string }>();
  const { stops } = useDriverRoute();
  const stop = stops.find((s) => s.so === soNumber);
  const photos = usePhotos(soNumber);
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<FlashMode>('off');
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="white" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permTitle}>Camera permission required</Text>
        <Text style={styles.permSub}>
          We need your camera to capture proof-of-delivery photos.
        </Text>
        <View style={{ marginTop: 24, width: '80%' }}>
          <BigButton kind="primary" icon="camera" onPress={requestPermission}>
            Allow Camera
          </BigButton>
          <View style={{ height: 12 }} />
          <BigButton kind="ghost" onPress={() => router.back()}>
            Cancel
          </BigButton>
        </View>
      </View>
    );
  }

  const handleShutter = async () => {
    if (capturing || !cameraRef.current) return;
    try {
      setCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: false,
      });
      if (photo?.uri) {
        await photoStore.add(soNumber, photo.uri);
      }
    } catch (err) {
      console.error('[CAMERA] capture failed', err);
    } finally {
      setCapturing(false);
    }
  };

  const toggleFlash = () => {
    setFlash((f) => (f === 'off' ? 'on' : 'off'));
  };

  const photoCount = photos.length;

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing="back"
        flash={flash}
      />

      {/* Grid overlay */}
      <Svg
        width="100%"
        height="100%"
        style={[StyleSheet.absoluteFillObject, { opacity: 0.18 }]}
        pointerEvents="none"
      >
        <Line x1="33.3%" y1="0" x2="33.3%" y2="100%" stroke="white" strokeWidth="0.5" />
        <Line x1="66.6%" y1="0" x2="66.6%" y2="100%" stroke="white" strokeWidth="0.5" />
        <Line x1="0" y1="33.3%" x2="100%" y2="33.3%" stroke="white" strokeWidth="0.5" />
        <Line x1="0" y1="66.6%" x2="100%" y2="66.6%" stroke="white" strokeWidth="0.5" />
      </Svg>

      {/* Center reticle */}
      <View style={styles.reticle} pointerEvents="none">
        <View style={styles.reticleDot} />
      </View>

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Icon name="x" size={24} color="white" strokeWidth={2.4} />
        </TouchableOpacity>
        <View style={styles.photoCountChip}>
          <Text style={styles.photoCountText}>
            Photo <Text style={styles.photoCountNum}>{photoCount + 1}</Text>
          </Text>
        </View>
        <TouchableOpacity onPress={toggleFlash} style={styles.iconBtn}>
          <Icon
            name={flash === 'on' ? 'flash' : 'flashOff'}
            size={22}
            color="white"
            strokeWidth={2.4}
          />
        </TouchableOpacity>
      </View>

      {/* Context badge */}
      {stop && (
        <View style={styles.contextBadge}>
          <View style={styles.contextDot} />
          <Text style={styles.contextText}>
            STOP {stop.n} · {stop.name.toUpperCase().slice(0, 18)}
          </Text>
        </View>
      )}

      {/* Recent thumbnails */}
      {photoCount > 0 && (
        <View style={styles.thumbStrip}>
          {photos.slice(-3).map((uri, i) => (
            <View key={`${uri}-${i}`} style={styles.thumb}>
              <Image source={{ uri }} style={styles.thumbImg} />
              <View style={styles.thumbCheck}>
                <Icon name="check" size={10} color="white" strokeWidth={3.5} />
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.sideBtn} onPress={() => router.back()}>
          <Icon name="list" size={20} color="white" strokeWidth={2.2} />
          <Text style={styles.sideBtnText}>GRID</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.shutter, capturing && styles.shutterActive]}
          onPress={handleShutter}
          activeOpacity={0.7}
          disabled={capturing}
        />

        <TouchableOpacity
          style={[styles.sideBtn, { backgroundColor: C.green }]}
          onPress={() => router.back()}
        >
          <Icon name="check" size={22} color="white" strokeWidth={3} />
          <Text style={styles.sideBtnText}>DONE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permTitle: { fontSize: 22, color: 'white', fontWeight: '700', textAlign: 'center' },
  permSub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 12 },
  reticle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 60,
    height: 60,
    marginTop: -30,
    marginLeft: -30,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'white' },
  topBar: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCountChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 18,
  },
  photoCountText: { color: 'white', fontSize: 14, fontWeight: '700' },
  photoCountNum: { color: '#ffe27a' },
  contextBadge: {
    position: 'absolute',
    top: 120,
    left: 0,
    right: 0,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    alignContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,104,52,0.92)',
    borderRadius: 14,
    marginHorizontal: 'auto',
    justifyContent: 'center',
    maxWidth: 260,
  },
  contextDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#a7f3c5' },
  contextText: { color: 'white', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  thumbStrip: {
    position: 'absolute',
    bottom: 200,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'white',
    position: 'relative',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbCheck: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.ok,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 70,
    left: 0,
    right: 0,
    paddingHorizontal: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  sideBtn: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  sideBtnText: { color: 'white', fontSize: 9, fontWeight: '700' },
  shutter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'white',
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  shutterActive: { opacity: 0.6 },
});
