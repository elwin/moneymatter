<script setup lang="ts">
import { useFormatCurrency } from '@/composable/formatters';
import { useDateLocale } from '@/composable/use-date-locale';
import { computed } from 'vue';

import type { StripDay } from '../upcoming-payments-strip';

const props = defineProps<{
  days: StripDay[];
  totalOutflow: number;
}>();

const { formatBaseCurrency } = useFormatCurrency();
const { format } = useDateLocale();

const bars = computed(() => {
  const max = Math.max(...props.days.map((day) => Math.max(day.outflow, day.inflow)), 1);

  return props.days.map((day) => {
    const value = Math.max(day.outflow, day.inflow);
    let colorClass = 'bg-muted-foreground/20';
    if (day.status === 'overdue') colorClass = 'bg-app-expense-color';
    else if (day.status === 'dueSoon') colorClass = 'bg-warning';
    else if (day.inflow > day.outflow) colorClass = 'bg-app-income-color';
    else if (value > 0) colorClass = 'bg-foreground/45';

    return {
      key: day.date.getTime(),
      colorClass,
      // sqrt keeps small payments visible next to rent-sized ones
      height: value > 0 ? `${Math.max(15, Math.sqrt(value / max) * 100)}%` : '2px',
      title: value > 0 ? `${format(day.date, 'MMM d')} · ${formatBaseCurrency(value)}` : undefined,
    };
  });
});

const axisLabels = computed(() => [
  format(props.days[Math.floor(props.days.length / 2)]!.date, 'MMM d'),
  format(props.days.at(-1)!.date, 'MMM d'),
]);
</script>

<template>
  <div class="pb-2.5">
    <div class="text-muted-foreground flex flex-wrap justify-between gap-x-2 text-xs">
      <span>{{ $t('widgets.subscriptionsOverview.strip.title') }}</span>
      <i18n-t keypath="widgets.subscriptionsOverview.strip.goingOut" tag="span">
        <template #amount>
          <span class="text-foreground font-semibold tabular-nums">{{ formatBaseCurrency(totalOutflow) }}</span>
        </template>
      </i18n-t>
    </div>

    <div
      class="mt-1.5 grid h-7 items-end gap-0.5"
      :style="{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }"
    >
      <span
        v-for="bar in bars"
        :key="bar.key"
        :title="bar.title"
        :class="['rounded-t-[2px]', bar.colorClass]"
        :style="{ height: bar.height }"
      />
    </div>

    <div class="text-muted-foreground mt-1 flex justify-between text-[10px] tabular-nums">
      <span>{{ $t('widgets.subscriptionsOverview.strip.today') }}</span>
      <span v-for="label in axisLabels" :key="label">{{ label }}</span>
    </div>
  </div>
</template>
