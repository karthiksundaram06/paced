import React from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { H1 } from '../ui';

export function Screen({
  title,
  subtitle,
  right,
  onRefresh,
  refreshing = false,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 120, gap: 10 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.sub} /> : undefined}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
        <View style={{ flex: 1 }}>
          {subtitle && <Text style={{ color: t.sub, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' }}>{subtitle}</Text>}
          <H1>{title}</H1>
        </View>
        {right}
      </View>
      {children}
    </ScrollView>
  );
}
