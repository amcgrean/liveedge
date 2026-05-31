import React from 'react';
import { Tabs } from 'expo-router';
import { SalesTabBar } from '@/components/sales/kit';

/**
 * Bridges expo-router's Tabs navigation state to the design's custom
 * bottom tab bar. The route name is the tab id (home/customers/orders/items/profile).
 *
 * Typed loosely (`any`) to avoid a direct dependency on the
 * @react-navigation/bottom-tabs event-map types (it's only transitive).
 */
function TabBarAdapter({ state, navigation }: any) {
  const routes: { key: string; name: string }[] = state.routes;
  const active = routes[state.index]?.name ?? 'home';
  return (
    <SalesTabBar
      active={active}
      onNavigate={(id) => {
        const route = routes.find((r) => r.name === id);
        if (!route) return;
        const isFocused = routes[state.index]?.name === id;
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!isFocused && !event.defaultPrevented) {
          navigation.navigate(id);
        }
      }}
    />
  );
}

export default function SalesTabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBarAdapter {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="customers" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="items" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
