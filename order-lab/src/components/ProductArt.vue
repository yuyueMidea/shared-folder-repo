<script setup>
defineProps({ icon: String, color: String, small: Boolean });
</script>
<template>
  <div
    class="product-art"
    :class="{ small }"
    :style="{ background: color || '#f4eee7' }"
    aria-hidden="true"
  >
    <span>{{ icon }}</span>
  </div>
</template>
