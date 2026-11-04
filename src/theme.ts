import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import type { RiskStatus } from './types';

export interface Theme {
  dark: boolean;
  bg: string;
  card: string;
  cardAlt: string;
  text: string;
  sub: string;
  faint: string;
  border: string;
  accent: string;
  accentText: string;
  danger: string;
  warn: string;
  ok: string;
  busy: string;
}

const light: Theme = {
  dark: false,
  bg: '#F2F2F7',
  card: '#FFFFFF',
  cardAlt: '#F7F7FA',
  text: '#111114',
  sub: '#5E5E66',
  faint: '#9A9AA3',
  border: '#E3E3E8',
  accent: '#4F46E5',
  accentText: '#FFFFFF',
  danger: '#DC2626',
  warn: '#D97706',
  ok: '#16A34A',
  busy: '#C7C7CF',
};

const dark: Theme = {
  dark: true,
  bg: '#000000',
  card: '#1C1C1E',
  cardAlt: '#26262A',
  text: '#F4F4F6',
  sub: '#A1A1AA',
  faint: '#6B6B73',
  border: '#2E2E33',
  accent: '#818CF8',
  accentText: '#0B0B12',
  danger: '#F87171',
  warn: '#FBBF24',
  ok: '#4ADE80',
  busy: '#4A4A52',
};

/** Accent colours you can pick in Settings → Appearance (light-mode / dark-mode shades). */
export const ACCENTS = [
  { key: 'indigo', name: 'Indigo', light: '#4F46E5', dark: '#818CF8' },
  { key: 'blue', name: 'Blue', light: '#2563EB', dark: '#60A5FA' },
  { key: 'teal', name: 'Teal', light: '#0D9488', dark: '#2DD4BF' },
  { key: 'green', name: 'Green', light: '#16A34A', dark: '#4ADE80' },
  { key: 'orange', name: 'Orange', light: '#EA580C', dark: '#FB923C' },
  { key: 'red', name: 'Red', light: '#DC2626', dark: '#F87171' },
  { key: 'pink', name: 'Pink', light: '#DB2777', dark: '#F472B6' },
  { key: 'purple', name: 'Purple', light: '#9333EA', dark: '#C084FC' },
] as const;

export const AccentContext = createContext<string>('indigo');

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const accentKey = useContext(AccentContext);
  return useMemo(() => {
    const base = scheme === 'dark' ? dark : light;
    const a = ACCENTS.find((x) => x.key === accentKey);
    return a ? { ...base, accent: base.dark ? a.dark : a.light } : base;
  }, [scheme, accentKey]);
}

export const PROJECT_COLORS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#64748B'];

export function statusInfo(status: RiskStatus, t: Theme): { label: string; color: string } {
  switch (status) {
    case 'done':
      return { label: 'Done', color: t.ok };
    case 'ok':
      return { label: 'On track', color: t.ok };
    case 'tight':
      return { label: 'Tight', color: t.warn };
    case 'late':
      return { label: 'At risk', color: t.danger };
    case 'unscheduled':
      return { label: "Doesn't fit", color: t.danger };
    default:
      return { label: 'No deadline', color: t.faint };
  }
}
