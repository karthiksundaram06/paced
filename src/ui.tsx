import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { attachDragDown, domNode } from './dragDown';
import { statusInfo, useTheme } from './theme';
import type { RiskStatus } from './types';

const IS_WEB_UI = Platform.OS === 'web';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <Ionicons name={name} size={size} color={color ?? t.text} />;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: 16, padding: 16 }, style]}>{children}</View>;
}

export function H1({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ fontSize: 32, fontWeight: '800', color: t.text, letterSpacing: -0.5 }}>{children}</Text>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: t.sub, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {children}
      </Text>
      {right}
    </View>
  );
}

export function Muted({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[{ color: t.sub, fontSize: 14 }, style]}>{children}</Text>;
}

export function StatusPill({ status, compact }: { status: RiskStatus; compact?: boolean }) {
  const t = useTheme();
  const { label, color } = statusInfo(status, t);
  return (
    <View style={[styles.pill, { backgroundColor: color + '22' }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      {!compact && <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>}
    </View>
  );
}

export function Progress({ value, color }: { value: number; color?: string }) {
  const t = useTheme();
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.border, overflow: 'hidden' }}>
      <View style={{ width: `${v * 100}%`, height: '100%', backgroundColor: color ?? t.accent, borderRadius: 3 }} />
    </View>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'plain';
  icon?: IconName;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'secondary' ? t.cardAlt : kind === 'danger' ? t.danger + '1A' : 'transparent';
  const fg = kind === 'primary' ? t.accentText : kind === 'danger' ? t.danger : t.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        kind === 'secondary' && { borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={18} color={fg} style={{ marginRight: 6 }} />}
      <Text style={{ color: fg, fontWeight: '700', fontSize: 16 }}>{title}</Text>
    </Pressable>
  );
}

export function RoundButton({
  icon,
  onPress,
  color,
  filled,
  size = 40,
}: {
  icon: IconName;
  onPress: () => void;
  color?: string;
  filled?: boolean;
  size?: number;
}) {
  const t = useTheme();
  const c = color ?? t.accent;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? c : c + '1F',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={size * 0.48} color={filled ? t.accentText : c} />
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color }: { label: string; selected: boolean; onPress: () => void; color?: string }) {
  const t = useTheme();
  const c = color ?? t.accent;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? c : t.border, backgroundColor: selected ? c + '22' : t.card },
      ]}
    >
      <Text style={{ color: selected ? c : t.text, fontWeight: selected ? '700' : '500', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 }}>
      <Ionicons name={icon} size={36} color={t.faint} />
      <Text style={{ color: t.text, fontWeight: '700', fontSize: 17, marginTop: 10 }}>{title}</Text>
      <Text style={{ color: t.sub, textAlign: 'center', marginTop: 4, lineHeight: 20 }}>{body}</Text>
    </View>
  );
}

/** Full-height iOS page sheet with a header bar. */
export function Sheet({
  visible,
  title,
  onClose,
  onSave,
  saveLabel = 'Save',
  saveDisabled,
  dirty = false,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  /** Unsaved changes: swiping down asks before throwing them away. */
  dirty?: boolean;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<React.ComponentRef<typeof View>>(null);
  const headerRef = useRef<React.ComponentRef<typeof View>>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [askDiscard, setAskDiscard] = useState(false);
  const latest = useRef({ dirty, onClose });
  latest.current = { dirty, onClose };

  // Web: drag the sheet down (from the top bar, or anywhere while scrolled to the top) to close it.
  useEffect(() => {
    if (!IS_WEB_UI || !visible) return;
    setAskDiscard(false);
    let detach: (() => void) | undefined;
    let tries = 0;
    const setup = () => {
      const sheet = sheetRef.current as unknown as HTMLElement | null;
      const header = headerRef.current as unknown as HTMLElement | null;
      const scroll = domNode(scrollRef.current);
      if (!sheet || !header || !scroll) {
        if (tries++ < 20) raf = requestAnimationFrame(setup);
        return;
      }
      sheet.style.transform = '';
      const place = (px: number, animate: boolean) => {
        sheet.style.transition = animate ? 'transform .22s ease-out' : 'none';
        sheet.style.transform = px ? `translateY(${px}px)` : '';
      };
      detach = attachDragDown(sheet, {
        canStart: (target) => header.contains(target as Node) || scroll.scrollTop <= 0,
        onMove: (dy) => place(latest.current.dirty ? dy * 0.35 : dy, false),
        onEnd: (dy, v) => {
          const dismiss = dy > 120 || (v > 0.5 && dy > 30);
          if (dismiss && !latest.current.dirty) {
            place(window.innerHeight, true);
            setTimeout(() => latest.current.onClose(), 200);
            return;
          }
          place(0, true);
          if (dismiss) setAskDiscard(true);
        },
      });
    };
    let raf = requestAnimationFrame(setup);
    return () => {
      cancelAnimationFrame(raf);
      detach?.();
    };
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" transparent={IS_WEB_UI} onRequestClose={onClose}>
      <View ref={sheetRef} style={{ flex: 1, backgroundColor: t.bg }}>
        <View ref={headerRef} style={{ backgroundColor: t.card, borderBottomColor: t.border, borderBottomWidth: StyleSheet.hairlineWidth }}>
          {IS_WEB_UI && <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: t.faint, opacity: 0.5, marginTop: 6 }} />}
          <View style={[styles.sheetHeader, IS_WEB_UI && { paddingTop: 8 }, { width: '100%', maxWidth: 712, alignSelf: 'center' }]}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ color: t.accent, fontSize: 17 }}>Cancel</Text>
            </Pressable>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{title}</Text>
            {onSave ? (
              <Pressable onPress={onSave} hitSlop={10} disabled={saveDisabled}>
                <Text style={{ color: t.accent, fontSize: 17, fontWeight: '700', opacity: saveDisabled ? 0.35 : 1 }}>{saveLabel}</Text>
              </Pressable>
            ) : (
              <View style={{ width: 50 }} />
            )}
          </View>
        </View>
        {askDiscard && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: t.cardAlt }}>
            <Text style={{ color: t.text, fontSize: 15, flex: 1 }}>Discard your changes?</Text>
            <Pressable onPress={() => setAskDiscard(false)} hitSlop={8}>
              <Text style={{ color: t.accent, fontSize: 15, fontWeight: '600' }}>Keep editing</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={{ color: t.danger, fontSize: 15, fontWeight: '700' }}>Discard</Text>
            </Pressable>
          </View>
        )}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 16, width: '100%', maxWidth: 680, alignSelf: 'center' }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.sub, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>{children}</Text>;
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 12 }} />;
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 8, paddingHorizontal: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, gap: 5, alignSelf: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, paddingHorizontal: 18, borderRadius: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
});
