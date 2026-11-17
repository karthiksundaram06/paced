import React, { useEffect, useRef, useState } from 'react';
import { Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { attachDragDown, domNode } from '../dragDown';
import { useTheme } from '../theme';
import { H1, Icon } from '../ui';

const PULL_MAX = 110; // how far the page follows the finger
const PULL_READY = 64; // pulled this far (after resistance) = sync on release
/** iPad and wide windows: keep one readable column instead of stretching edge to edge. */
export const MAX_WIDTH = 680;

export function Screen({
  title,
  subtitle,
  right,
  onRefresh,
  refreshing = false,
  onPull,
  pullLabel = 'sync',
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Web: pull the page down from the top and let go to run this. */
  onPull?: () => void;
  pullLabel?: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const bodyRef = useRef<React.ComponentRef<typeof View>>(null);
  const [ready, setReady] = useState(false);
  const onPullRef = useRef(onPull);
  onPullRef.current = onPull;
  const enabled = Platform.OS === 'web' && !!onPull;

  useEffect(() => {
    if (!enabled) return;
    const scroll = domNode(scrollRef.current);
    const body = bodyRef.current as unknown as HTMLElement | null;
    if (!scroll || !body) return;
    let isReady = false;
    const setOffset = (px: number, animate: boolean) => {
      body.style.transition = animate ? 'transform .2s ease-out' : 'none';
      body.style.transform = px ? `translateY(${px}px)` : '';
    };
    return attachDragDown(scroll, {
      canStart: () => scroll.scrollTop <= 0,
      onMove: (dy) => {
        const px = Math.min(PULL_MAX, dy * 0.5);
        setOffset(px, false);
        if (px >= PULL_READY !== isReady) {
          isReady = px >= PULL_READY;
          setReady(isReady);
        }
      },
      onEnd: () => {
        setOffset(0, true);
        if (isReady) onPullRef.current?.();
        isReady = false;
        setReady(false);
      },
    });
  }, [enabled]);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 120 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.sub} /> : undefined}
    >
      <View ref={bodyRef} style={{ gap: 10, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' }}>
        {enabled && (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: 0, right: 0, top: -48, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Icon name={ready ? 'refresh' : 'arrow-down'} size={16} color={ready ? t.accent : t.faint} />
            <Text style={{ color: ready ? t.accent : t.faint, fontSize: 13, fontWeight: '600' }}>
              {ready ? `Release to ${pullLabel}` : `Pull to ${pullLabel}`}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
          <View style={{ flex: 1 }}>
            {subtitle && <Text style={{ color: t.sub, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' }}>{subtitle}</Text>}
            <H1>{title}</H1>
          </View>
          {right}
        </View>
        {children}
      </View>
    </ScrollView>
  );
}
