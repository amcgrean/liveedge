import { Stack } from 'expo-router';

/**
 * Sales experience navigator. The `(tabs)` group renders the 5-tab shell
 * (Home · Customers · Orders · Items · Me); detail and create screens are
 * pushed full-screen on top of the tabs by this parent Stack.
 */
export default function SalesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="customer/[code]" />
      <Stack.Screen name="order/[so]" />
      <Stack.Screen name="item/[code]" />
      <Stack.Screen name="new-quote" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="new-order" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="submitted" options={{ animation: 'fade', gestureEnabled: false }} />
    </Stack>
  );
}
