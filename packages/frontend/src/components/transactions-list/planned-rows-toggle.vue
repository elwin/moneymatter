<script lang="ts" setup>
import { ChevronRightIcon } from '@lucide/vue';

defineProps<{ count: number }>();
const expanded = defineModel<boolean>({ required: true });
</script>

<template>
  <button
    type="button"
    class="text-muted-foreground hover:text-foreground flex h-10 items-center gap-2 px-3 text-sm transition-colors"
    :aria-expanded="expanded"
    @click="expanded = !expanded"
  >
    <ChevronRightIcon :class="['size-4 transition-transform', expanded && 'rotate-90']" />
    {{ $t('transactions.table.plannedRows', { count }) }}
  </button>
</template>
