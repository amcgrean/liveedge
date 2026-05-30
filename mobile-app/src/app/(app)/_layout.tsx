import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="route-list" />
      <Stack.Screen name="[soNumber]" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="sync-queue" />
      <Stack.Screen name="lookup" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="route-complete" options={{ animation: 'fade' }} />
    </Stack>
  );
}
