import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { statusInfo, useTheme } from './theme';
import type { RiskStatus } from './types';

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
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={[styles.sheetHeader, { borderBottomColor: t.border, backgroundColor: t.card }]}>
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
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 16 }}
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
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
