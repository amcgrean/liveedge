import React, { useState } from 'react';
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
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Wordmark } from '@/components/ui/Wordmark';
import { BigButton } from '@/components/ui/BigButton';
import { Icon } from '@/components/ui/Icon';
import { C } from '@/theme/colors';

export default function LoginScreen() {
  const { requestOTP } = useAuth();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (!username.trim()) {
      Alert.alert('Required', 'Please enter username or email');
      return;
    }
    try {
      setLoading(true);
      await requestOTP(username);
      router.push({ pathname: '/(auth)/otp', params: { username } });
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to send code'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoBlock}>
            <Wordmark color={C.green} size={36} />
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.headline}>Sign in to start your route</Text>
            <Text style={styles.lede}>Use your Beisser employee account.</Text>

            <Text style={styles.label}>USERNAME OR EMAIL</Text>
            <View style={[styles.inputWrap, username.length > 0 && styles.inputWrapFocused]}>
              <Icon name="user" size={20} color={C.text3} />
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                editable={!loading}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                keyboardType="email-address"
                placeholder="dmiller"
                placeholderTextColor={C.text4}
              />
            </View>
            <Text style={styles.helper}>We'll send a code to your work email.</Text>

            <View style={styles.buttonWrap}>
              <BigButton
                kind="primary"
                icon="arrowRight"
                onPress={handleContinue}
                loading={loading}
              >
                Continue
              </BigButton>
            </View>

            <TouchableOpacity style={styles.trouble}>
              <Text style={styles.troubleText}>Trouble signing in?</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Icon name="lock" size={12} color={C.text4} />
            <Text style={styles.footerText}>Secured by Beisser IT · v1.0.0</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  logoBlock: { paddingTop: 60, paddingBottom: 40, alignItems: 'center' },
  formBlock: { flex: 1 },
  headline: {
    fontSize: 24,
    fontWeight: '700',
    color: C.text,
    marginBottom: 8,
    lineHeight: 30,
  },
  lede: { fontSize: 15, color: C.text3, marginBottom: 28 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: C.text2,
    marginBottom: 8,
    letterSpacing: 0.7,
  },
  inputWrap: {
    height: 60,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.line,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
  },
  inputWrapFocused: { borderColor: C.green },
  input: { flex: 1, fontSize: 18, color: C.text, paddingVertical: 0 },
  helper: { marginTop: 10, fontSize: 13, color: C.text3, paddingLeft: 4 },
  buttonWrap: { marginTop: 28 },
  trouble: { marginTop: 24, alignItems: 'center' },
  troubleText: { fontSize: 15, color: C.green, fontWeight: '600' },
  footer: {
    paddingVertical: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerText: { fontSize: 12, color: C.text4 },
});
