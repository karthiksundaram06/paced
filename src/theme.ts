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

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
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
