import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { addDays, freeIntervals, MIN, startOfDay } from '../scheduler';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Icon } from '../ui';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function mondayOf(dayStart: number): number {
  const dow = (new Date(dayStart).getDay() + 6) % 7; // Monday = 0
  return addDays(dayStart, -dow);
}

export interface DayLoad {
  day: number;
  plannedMin: number;
  freeMin: number;
  deadlines: number;
}

/** Mon–Sun row like the Calendar app: each day shows how full it is, tap to see that day. */
export function WeekStrip({ selected, onSelect }: { selected: number; onSelect: (day: number) => void }) {
  const t = useTheme();
  const { plan, busy, settings, tasks, projects, now } = useStore();
  const today = startOfDay(now);
  const [weekOffset, setWeekOffset] = useState(0);
  const monday = addDays(mondayOf(today), weekOffset * 7);
  const lastPlannable = addDays(today, settings.horizonDays);

  const days: DayLoad[] = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(monday, i);
      const next = addDays(day, 1);
      const plannedMin = plan.blocks
        .filter((b) => b.start >= day && b.start < next)
        .reduce((m, b) => m + (b.end - b.start) / MIN, 0);
      const from = Math.max(day, now);
      const freeMin =
        next <= now ? 0 : freeIntervals(busy, settings, from, next).reduce((m, f) => m + (f.end - f.start) / MIN, 0);
      const deadlines =
        tasks.filter((x) => !x.done && plan.tasks[x.id]?.deadline !== undefined && plan.tasks[x.id].deadline! >= day && plan.tasks[x.id].deadline! < next).length +
        projects.filter((p) => p.deadline !== undefined && p.deadline >= day && p.deadline < next && (plan.projects[p.id]?.openTasks ?? 0) > 0).length;
      return { day, plannedMin, freeMin, deadlines };
    });
  }, [monday, plan, busy, settings, tasks, projects, now]);

  const loadColor = (d: DayLoad) => {
    if (d.plannedMin <= 0) return t.border;
    const ratio = d.freeMin > 0 ? d.plannedMin / d.freeMin : 1;
    if (ratio > 0.8) return t.danger;
    if (ratio > 0.5) return t.warn;
    return t.ok;
  };

  const first = new Date(monday);
  const last = new Date(addDays(monday, 6));
  const range =
    first.getMonth() === last.getMonth()
      ? `${first.getDate()}–${last.getDate()} ${MONTHS[last.getMonth()]}`
      : `${first.getDate()} ${MONTHS[first.getMonth()]} – ${last.getDate()} ${MONTHS[last.getMonth()]}`;
  const weekLabel = weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Next week' : weekOffset === -1 ? 'Last week' : range;

  return (
    <View style={{ backgroundColor: t.card, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 8, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 }}>
        <Pressable hitSlop={10} onPress={() => setWeekOffset((w) => w - 1)} disabled={weekOffset <= -1} style={{ opacity: weekOffset <= -1 ? 0.25 : 1 }}>
          <Icon name="chevron-back" size={18} color={t.sub} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', color: t.sub, fontSize: 13, fontWeight: '600' }}>
          {weekLabel}
          {weekOffset !== 0 && Math.abs(weekOffset) <= 1 ? ` · ${range}` : ''}
        </Text>
        <Pressable
          hitSlop={10}
          onPress={() => setWeekOffset((w) => w + 1)}
          disabled={addDays(monday, 7) > lastPlannable}
          style={{ opacity: addDays(monday, 7) > lastPlannable ? 0.25 : 1 }}
        >
          <Icon name="chevron-forward" size={18} color={t.sub} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row' }}>
        {days.map((d, i) => {
          const isToday = d.day === today;
          const isSelected = d.day === selected;
          const past = d.day < today;
          return (
            <Pressable
              key={d.day}
              onPress={() => onSelect(d.day)}
              accessibilityLabel={`${LETTERS[i]} ${new Date(d.day).getDate()}`}
              style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 2, opacity: past ? 0.4 : 1 }}
            >
              <Text style={{ color: t.faint, fontSize: 11, fontWeight: '600' }}>{LETTERS[i]}</Text>
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSelected ? t.accent : 'transparent',
                  borderWidth: isToday && !isSelected ? 1.5 : 0,
                  borderColor: t.accent,
                }}
              >
                <Text style={{ color: isSelected ? t.accentText : isToday ? t.accent : t.text, fontSize: 15, fontWeight: isSelected || isToday ? '800' : '500' }}>
                  {new Date(d.day).getDate()}
                </Text>
              </View>
              <View style={{ width: 22, height: 4, borderRadius: 2, backgroundColor: loadColor(d) }} />
              <View style={{ height: 6, justifyContent: 'center' }}>
                {d.deadlines > 0 && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: t.danger }} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
