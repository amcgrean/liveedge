import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { Icon, IconName } from './Icon';
import { C } from '@/theme/colors';

type ButtonKind = 'primary' | 'primaryDim' | 'danger' | 'secondary' | 'ghost';

interface BigButtonProps {
  kind?: ButtonKind;
  children?: React.ReactNode;
  icon?: IconName;
  fullWidth?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

const KIND_STYLES: Record<ButtonKind, { backgroundColor: string; color: string; borderColor: string }> = {
  primary: { backgroundColor: C.green, color: '#ffffff', borderColor: C.green },
  primaryDim: { backgroundColor: C.greenSoft, color: C.green, borderColor: C.green },
  danger: { backgroundColor: '#ffffff', color: C.err, borderColor: C.err },
  secondary: { backgroundColor: '#ffffff', color: C.text, borderColor: C.line },
  ghost: { backgroundColor: 'transparent', color: C.text2, borderColor: 'transparent' },
};

export function BigButton({
  kind = 'primary',
  children,
  icon,
  fullWidth = true,
  onPress,
  disabled,
  loading,
  style,
}: BigButtonProps) {
  const k = KIND_STYLES[kind];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[
        styles.button,
        {
          backgroundColor: k.backgroundColor,
          borderColor: k.borderColor,
          width: fullWidth ? '100%' : undefined,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={k.color} />
      ) : (
        <>
          {icon && <Icon name={icon} size={20} color={k.color} strokeWidth={2.4} />}
          {children && <Text style={[styles.text, { color: k.color }]}>{children}</Text>}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  text: {
    fontSize: 17,
    fontWeight: '700',
  },
});
