import React, { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { C } from '@/theme/colors';

type ToastKind = 'success' | 'error' | 'info';

interface ToastAPI {
  show(message: string, kind?: ToastKind): void;
}

const ToastContext = createContext<ToastAPI | undefined>(undefined);

const KIND_STYLE: Record<ToastKind, { bg: string; border: string; text: string }> = {
  success: { bg: C.okSoft, border: C.okBorder, text: C.ok },
  error: { bg: C.errSoft, border: C.err, text: C.err },
  info: { bg: C.surface2, border: C.line, text: C.text },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState<ToastKind>('info');
  const y = useRef(new Animated.Value(-20)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(y, { toValue: -20, duration: 180, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [opacity, y]);

  const show = useCallback((nextMessage: string, nextKind: ToastKind = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(nextMessage);
    setKind(nextKind);
    Animated.parallel([
      Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 16, stiffness: 180 }),
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
    timer.current = setTimeout(hide, 3000);
  }, [hide, opacity, y]);

  const style = KIND_STYLE[kind];

  return (
    <ToastContext.Provider value={{ show }}>
      <View style={styles.root}>
        {children}
        <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.toast,
              {
                opacity,
                transform: [{ translateY: y }],
                backgroundColor: style.bg,
                borderColor: style.border,
              },
            ]}
          >
            <Text style={[styles.toastText, { color: style.text }]}>{message}</Text>
          </Animated.View>
        </View>
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toast: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  toastText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
