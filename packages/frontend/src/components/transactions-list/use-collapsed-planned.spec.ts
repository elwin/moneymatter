import { describe, expect, it } from 'vitest';
import { ref } from 'vue';

import { PLANNED_HEADER, useCollapsedPlanned } from './use-collapsed-planned';

const item = (id: string, planned = false) => ({ id, planned });
const ids = (rows: unknown[]) => rows.map((row) => (row === PLANNED_HEADER ? 'H' : (row as { id: string }).id));

describe('useCollapsedPlanned', () => {
  const list = [item('a'), item('p1', true), item('b'), item('p2', true), item('c')];

  it('collapses planned items behind one header at the first planned position', () => {
    const { rows, plannedCount, visibleItems } = useCollapsedPlanned({ items: list, isPlanned: (i) => i.planned });
    expect(ids(rows.value)).toEqual(['a', 'H', 'b', 'c']);
    expect(plannedCount.value).toBe(2);
    expect(visibleItems.value.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('shows planned items after the header when expanded', () => {
    const { rows, isPlannedExpanded } = useCollapsedPlanned({ items: list, isPlanned: (i) => i.planned });
    isPlannedExpanded.value = true;
    expect(ids(rows.value)).toEqual(['a', 'H', 'p1', 'b', 'p2', 'c']);
  });

  it('passes the list through when disabled or nothing is planned', () => {
    const enabled = ref(false);
    const { rows } = useCollapsedPlanned({ items: list, isPlanned: (i) => i.planned, enabled });
    expect(ids(rows.value)).toEqual(['a', 'p1', 'b', 'p2', 'c']);

    const plain = useCollapsedPlanned({ items: [item('a')], isPlanned: (i) => i.planned });
    expect(ids(plain.rows.value)).toEqual(['a']);
  });
});
