import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Alert,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Wordmark } from '@/components/ui/Wordmark';
import { BigButton } from '@/components/ui/BigButton';
import { Icon } from '@/components/ui/Icon';
import { C } from '@/theme/colors';

export default function OTPScreen() {
  const { username = '' } = useLocalSearchParams<{ username: string }>();
  const { verifyOTP, requestOTP } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(24);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setInterval(() => {
      setResendTimer((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const handleVerify = async () => {
    if (code.length !== 6) {
      Alert.alert('Required', 'Enter the 6-digit code');
      return;
    }
    try {
      setLoading(true);
      await verifyOTP(username, code);
      // Verified! Now route to branch picker (or directly to route list if branch is set)
      router.replace('/(auth)/branch-select');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Invalid code');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    try {
      await requestOTP(username);
      setResendTimer(24);
    } catch (error) {
      Alert.alert('Error', 'Failed to resend code');
    }
  };

  const maskedEmail = username.includes('@')
    ? username
    : `${username[0] || ''}.${username.slice(1)}@beisser.com`;

  const digits = code.padEnd(6, ' ').split('').slice(0, 6);
  const activeIdx = code.length;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Icon name="chevronLeft" size={20} color={C.green} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.logoBlock}>
            <Wordmark color={C.green} size={30} sub={false} />
          </View>

          <Text style={styles.headline}>Enter verification code</Text>
          <Text style={styles.lede}>
            We sent a 6-digit code to{'\n'}
            <Text style={styles.email}>{maskedEmail}</Text>
          </Text>

          {/* Code boxes — visual, tap anywhere to focus hidden input */}
          <TouchableOpacity
            style={styles.codeRow}
            onPress={() => inputRef.current?.focus()}
            activeOpacity={1}
          >
            {digits.map((d, i) => (
              <View
                key={i}
                style={[
                  styles.codeBox,
                  d !== ' ' && styles.codeBoxFilled,
                  i === activeIdx && styles.codeBoxActive,
                ]}
              >
                <Text style={styles.codeDigit}>{d.trim()}</Text>
              </View>
            ))}
          </TouchableOpacity>

          {/* Hidden input — actually receives keyboard input */}
          <TextInput
            ref={inputRef}
            style={styles.hiddenInput}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            caretHidden
          />

          <View style={styles.resendRow}>
            <View style={styles.resendTimerBlock}>
              <Icon name="clock" size={14} color={C.text3} />
              <Text style={styles.resendTimerText}>
                Resend in{' '}
                <Text style={styles.resendTime}>
                  0:{resendTimer.toString().padStart(2, '0')}
                </Text>
              </Text>
            </View>
            <TouchableOpacity onPress={handleResend} disabled={resendTimer > 0}>
              <Text
                style={[
                  styles.resendLink,
                  resendTimer === 0 && styles.resendLinkActive,
                ]}
              >
                Resend
              </Text>
            </TouchableOpacity>
          </View>

          <BigButton kind="primary" icon="check" onPress={handleVerify} loading={loading}>
            Verify
          </BigButton>

          <View style={styles.tipBox}>
            <Icon name="info" size={18} color={C.text3} />
            <Text style={styles.tipText}>
              Didn't get it? Check spam, or ask the yard manager to reset your verification email.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16 },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  backText: { fontSize: 16, color: C.green, fontWeight: '600' },
  logoBlock: { paddingTop: 12, paddingBottom: 32, alignItems: 'center' },
  headline: {
    fontSize: 24,
    fontWeight: '700',
    color: C.text,
    marginBottom: 8,
    lineHeight: 30,
  },
  lede: { fontSize: 15, color: C.text3, marginBottom: 28, lineHeight: 22 },
  email: { color: C.text, fontWeight: '600' },
  codeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  codeBox: {
    flex: 1,
    height: 64,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxFilled: {
    borderColor: C.green,
    backgroundColor: C.okSoft,
  },
  codeBoxActive: {
    borderColor: C.green,
    shadowColor: C.green,
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  codeDigit: { fontSize: 28, fontWeight: '700', color: C.text },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  resendTimerBlock: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resendTimerText: { fontSize: 13, color: C.text3 },
  resendTime: { fontWeight: '700', color: C.text2 },
  resendLink: { fontSize: 14, color: C.text4, fontWeight: '600' },
  resendLinkActive: { color: C.green },
  tipBox: {
    marginTop: 18,
    padding: 14,
    backgroundColor: C.surface,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  tipText: { flex: 1, fontSize: 13, color: C.text3, lineHeight: 18 },
});
