<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { store, init, tick, reset } from "./services/store";
let timer;
const warning = ref("");
onMounted(async () => {
  await init();
  timer = setInterval(() => {
    try {
      tick();
    } catch (e) {
      warning.value = e.message;
    }
  }, 1000);
});
onUnmounted(() => clearInterval(timer));
</script>
<template>
  <div class="shell">
    <aside class="sidebar">
      <a class="brand" href="#/orders"
        ><b>拼</b><span>拼享 <small>ORDER LAB</small></span></a
      >
      <div class="workspace-tag">电商交易 · 学习工作台</div>
      <nav>
        <RouterLink to="/orders"><span>▤</span>订单中心</RouterLink
        ><RouterLink to="/shop"><span>▧</span>精选好物</RouterLink
        ><RouterLink to="/lab"><span>⚙</span>演示控制台</RouterLink>
      </nav>
      <div class="sidebar-bottom">
        <span class="green-dot" /> 本地模拟环境
        <p>Vue 3 · JavaScript<br />无真实支付 / 无后台服务</p>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <span>工作台 <b>/</b> 订单与履约</span>
        <div class="role-switch">
          <button
            :class="{ selected: store.role === 'buyer' }"
            @click="store.role = 'buyer'"
          >
            买家视角</button
          ><button
            :class="{ selected: store.role === 'merchant' }"
            @click="store.role = 'merchant'"
          >
            商家视角
          </button>
        </div>
        <span class="avatar">{{ store.role === "buyer" ? "买" : "商" }}</span>
      </header>
      <main>
        <div v-if="store.error" class="empty">
          <h2>暂时无法加载</h2>
          <p>{{ store.error }}</p>
          <button @click="init">重试</button>
          <button @click="reset">恢复演示数据</button>
        </div>
        <p v-else-if="!store.ready">正在加载订单数据…</p>
        <template v-else
          ><p v-if="warning" class="error">本地保存失败：{{ warning }}</p>
          <RouterView
        /></template>
      </main>
      <footer class="page-footer">
        拼享订单实验室 · 独立教学示例，非拼多多官方产品
      </footer>
    </div>
  </div>
</template>
