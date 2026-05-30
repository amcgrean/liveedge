import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import axios from 'axios';
import { Icon } from '@/components/ui/Icon';
import { BigButton } from '@/components/ui/BigButton';
import { Pill } from '@/components/ui/Pill';
import { C } from '@/theme/colors';
import { lookupOrder, OrderLookupResponse } from '@/api/dispatch';
import { describeAssignment, AssignmentSummary } from '@/lib/orderAssignment';

export default function LookupScreen() {
  const [soInput, setSoInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrderLookupResponse | null>(null);

  const handleLookup = async () => {
    const so = soInput.trim();
    if (!so) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await lookupOrder(so);
      setResult(res);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setError(`SO #${so} not found for your branch.`);
      } else if (axios.isAxiosError(err) && err.response?.status === 403) {
        setError('You don’t have access to look up sales orders.');
      } else {
        const msg = err instanceof Error ? err.message : 'Lookup failed';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetails = () => {
    if (!result) return;
    const summary = describeAssignment(result);
    // dismiss the modal first, then push details. router.replace inside a
    // modal-presentation screen leaves the modal stack half-popped and
    // wedges the navigator on some Expo Router versions.
    router.dismissTo('/(app)/route-list');
    router.push({
      pathname: '/(app)/[soNumber]/details',
      params: {
        soNumber: result.so.so_id,
        lookup: '1',
        claimable: summary.canClaim ? '1' : '0',
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Icon name="x" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Look up SO#</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.searchBlock}>
          <View style={styles.inputRow}>
            <Icon name="search" size={18} color={C.text3} strokeWidth={2.2} />
            <TextInput
              value={soInput}
              onChangeText={setSoInput}
              placeholder="e.g. 102-44947"
              placeholderTextColor={C.text4}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={handleLookup}
            />
            {soInput.length > 0 && (
              <TouchableOpacity onPress={() => setSoInput('')}>
                <Icon name="x" size={18} color={C.text3} />
              </TouchableOpacity>
            )}
          </View>
          <BigButton
            kind="primary"
            onPress={handleLookup}
            style={{ marginTop: 12 }}
            disabled={loading || soInput.trim().length === 0}
          >
            {loading ? 'Searching…' : 'Search'}
          </BigButton>
        </View>

        <View style={styles.results}>
          {loading && <ActivityIndicator size="large" color={C.green} style={{ marginTop: 24 }} />}

          {error && !loading && (
            <View style={styles.errorBox}>
              <Icon name="alert" size={18} color={C.err} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {result && !loading && (() => {
            const summary = describeAssignment(result);
            return (
              <View style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <Text style={styles.soNum}>SO# {result.so.so_id}</Text>
                  <Pill kind={summary.statusKind}>{summary.statusLabel}</Pill>
                </View>
                <Text style={styles.customerName}>
                  {result.so.customer_name ?? result.so.cust_code ?? '—'}
                </Text>
                {result.so.address_1 && (
                  <Text style={styles.addr}>{result.so.address_1}</Text>
                )}
                {(result.so.city || result.so.state) && (
                  <Text style={styles.addr}>
                    {[result.so.city, result.so.state, result.so.zip].filter(Boolean).join(', ')}
                  </Text>
                )}
                <View style={styles.metaRow}>
                  <Text style={styles.metaChip}>Branch {result.so.branch_code}</Text>
                  {result.so.reference && (
                    <Text style={styles.metaChip}>Ref {result.so.reference}</Text>
                  )}
                  {result.so.po_number && (
                    <Text style={styles.metaChip}>PO# {result.so.po_number}</Text>
                  )}
                  <Text style={styles.metaChip}>
                    {result.so.line_count} {result.so.line_count === 1 ? 'line' : 'lines'}
                  </Text>
                </View>
                {summary.assignmentLine ? (
                  <Text style={styles.routeLine}>{summary.assignmentLine}</Text>
                ) : summary.canClaim ? (
                  <Text style={styles.routeLine}>
                    No driver assigned — you can claim this stop on the next screen.
                  </Text>
                ) : null}
                <BigButton
                  kind="primary"
                  onPress={handleOpenDetails}
                  style={{ marginTop: 16 }}
                  icon="arrowRight"
                >
                  {summary.canClaim ? 'Open & claim' : 'Open delivery'}
                </BigButton>
              </View>
            );
          })()}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '700', color: C.text },
  searchBlock: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'Menlo',
    color: C.text,
    padding: 0,
  },
  results: { flex: 1, padding: 16 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.errSoft,
    borderColor: C.err,
    borderWidth: 1,
    padding: 14,
    borderRadius: 12,
  },
  errorText: { flex: 1, color: C.err, fontSize: 14, fontWeight: '600' },
  resultCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  soNum: { fontFamily: 'Menlo', fontSize: 14, color: C.text3, fontWeight: '700' },
  customerName: { fontSize: 18, fontWeight: '700', color: C.text },
  addr: { fontSize: 14, color: C.text2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  metaChip: {
    backgroundColor: C.surface2,
    color: C.text3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  routeLine: { fontSize: 13, color: C.text3, marginTop: 10, fontStyle: 'italic' },
});
