<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(
  defineProps<{
    num: number
    reverse?: boolean
  }>(),
  {
    num: 999,
    reverse: false,
  },
)

const petUrl = computed(() => `https://seer2-resource.yuuinih.com/png/pet/${props.num}.png`)
</script>

<template>
  <img
    :src="petUrl"
    :alt="`Pet ${num}`"
    class="object-contain"
    :class="{ reverse: reverse }"
    @error="e => ((e.target as HTMLImageElement).src = 'https://placehold.co/100x100?text=No+Image')"
  />
</template>

<style scoped>
.reverse {
  transform: scaleX(-1);
}
</style>
