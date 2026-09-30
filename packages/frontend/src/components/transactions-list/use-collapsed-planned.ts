import { type MaybeRefOrGetter, computed, ref, toValue } from 'vue';

export const PLANNED_HEADER = Symbol('planned-header');

/** Hides planned items behind one toggle row, placed where the first planned item sits. */
export function useCollapsedPlanned<T>({
  items,
  isPlanned,
  enabled = true,
}: {
  items: MaybeRefOrGetter<T[]>;
  isPlanned: (item: T) => boolean;
  enabled?: MaybeRefOrGetter<boolean>;
}) {
  const isPlannedExpanded = ref(false);
  const plannedCount = computed(() => toValue(items).filter(isPlanned).length);

  const rows = computed<(T | typeof PLANNED_HEADER)[]>(() => {
    const list = toValue(items);
    if (!toValue(enabled)) return list;
    const firstPlanned = list.findIndex(isPlanned);
    if (firstPlanned === -1) return list;
    const shown = isPlannedExpanded.value ? list : list.filter((item) => !isPlanned(item));
    return [...shown.slice(0, firstPlanned), PLANNED_HEADER, ...shown.slice(firstPlanned)];
  });

  const itemAt = (index: number) => {
    const row = rows.value[index];
    return row === PLANNED_HEADER ? undefined : row;
  };

  const visibleItems = computed(() => rows.value.filter((row): row is T => row !== PLANNED_HEADER));

  return { rows, itemAt, visibleItems, isPlannedExpanded, plannedCount };
}
