<script setup>
import { onMounted, onUnmounted, ref } from "vue";
defineProps({ title: String });
const emit = defineEmits(["close"]);
const el = ref(null);
let previous;
function key(e) {
  if (e.key === "Escape") emit("close");
  if (e.key === "Tab") {
    const a = [
      ...el.value.querySelectorAll(
        'button,input,textarea,select,[tabindex="0"]',
      ),
    ].filter((x) => !x.disabled);
    if (!a.length) return;
    if (e.shiftKey && document.activeElement === a[0]) {
      e.preventDefault();
      a.at(-1).focus();
    } else if (!e.shiftKey && document.activeElement === a.at(-1)) {
      e.preventDefault();
      a[0].focus();
    }
  }
}
onMounted(() => {
  previous = document.activeElement;
  el.value.focus();
  document.addEventListener("keydown", key);
  document.body.style.overflow = "hidden";
});
onUnmounted(() => {
  document.removeEventListener("keydown", key);
  document.body.style.overflow = "";
  previous?.focus();
});
</script>
<template>
  <Teleport to="body"
    ><div class="overlay" @click.self="emit('close')">
      <section
        ref="el"
        class="modal"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
      >
        <header>
          <h2>{{ title }}</h2>
          <button aria-label="关闭弹窗" @click="emit('close')">×</button>
        </header>
        <slot />
      </section></div
  ></Teleport>
</template>
