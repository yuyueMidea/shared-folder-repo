<script setup>
import { computed, ref, watch } from "vue";
import { store } from "../services/store";
import { STATUS, AS, money, activeAfterSale } from "../domain/orders";
import ProductArt from "../components/ProductArt.vue";
import ActionPanel from "../components/ActionPanel.vue";
const tab = ref("all"),
  query = ref(""),
  shop = ref(""),
  page = ref(1),
  sort = ref("new"),
  date = ref("");
const tabs = {
  all: "全部订单",
  unpaid: "待付款",
  grouping: "待成团",
  toship: "待发货",
  shipped: "待收货",
  review: "待评价",
  after: "退款 / 售后",
  completed: "已完成",
  closed: "已关闭",
};
const matches = (o, t) =>
  t === "all" ||
  (t === "review"
    ? o.status === "completed" && !o.review
    : t === "after"
      ? !!o.afterSale
      : o.status === t);
const orders = computed(() =>
  store.db.orders
    .filter(
      (o) =>
        matches(o, tab.value) &&
        (!shop.value || o.shop === shop.value) &&
        (!date.value ||
          o.createdAt >= store.now - Number(date.value) * 86400000) &&
        `${o.id}${o.title}${o.shop}${o.address.name}`
          .toLowerCase()
          .includes(query.value.trim().toLowerCase()),
    )
    .sort((a, b) =>
      sort.value === "price"
        ? b.total - a.total
        : sort.value === "old"
          ? a.createdAt - b.createdAt
          : b.createdAt - a.createdAt,
    ),
);
const pages = computed(() => Math.max(1, Math.ceil(orders.value.length / 5))),
  shown = computed(() =>
    orders.value.slice((page.value - 1) * 5, page.value * 5),
  );
watch([tab, query, shop, sort, date], () => (page.value = 1));
watch(pages, (n) => {
  if (page.value > n) page.value = n;
});
const metrics = computed(() => [
  {
    label: "全部订单",
    value: store.db.orders.length,
    sub: "完整交易记录",
    key: "all",
  },
  {
    label: "等待发货",
    value: store.db.orders.filter((o) => o.status === "toship").length,
    sub: "履约从每一单开始",
    key: "toship",
  },
  {
    label: "运输途中",
    value: store.db.orders.filter((o) => o.status === "shipped").length,
    sub: "包裹正在赶来",
    key: "shipped",
  },
  {
    label: "售后处理中",
    value: store.db.orders.filter(activeAfterSale).length,
    sub: "及时响应每个需求",
    key: "after",
  },
]);
const fmt = (n) => new Date(n).toLocaleString("zh-CN", { hour12: false });
</script>
<template>
  <section class="page-heading">
    <div>
      <div class="eyebrow">ORDER MANAGEMENT</div>
      <h1>{{ store.role === "buyer" ? "我的订单" : "商家订单台" }}</h1>
      <p>每一笔好物，都有迹可循。查看订单，跟进每一步进展。</p>
    </div>
    <RouterLink class="button primary" to="/shop">＋ 创建新订单</RouterLink>
  </section>
  <div class="metrics">
    <button class="metric" v-for="(m, i) in metrics" @click="tab = m.key">
      <span
        >{{ m.label }} <i>0{{ i + 1 }}</i></span
      ><strong>{{ m.value }}</strong
      ><small>{{ m.sub }}</small>
    </button>
  </div>
  <section class="panel">
    <div class="panel-title">
      <h2>
        订单列表 <span>{{ store.db.orders.length }}</span>
      </h2>
      <span class="muted">{{
        store.role === "buyer"
          ? "管理你的每一次购物"
          : "发货、审核售后及确认退款"
      }}</span>
    </div>
    <div class="tabs">
      <button
        v-for="(label, key) in tabs"
        :class="{ active: tab === key }"
        @click="tab = key"
      >
        {{ label }}
        <small>{{
          store.db.orders.filter((o) => matches(o, key)).length
        }}</small>
      </button>
    </div>
    <div class="filters">
      <input
        aria-label="搜索订单"
        v-model="query"
        placeholder="⌕  搜索订单编号、商品、店铺或收货人"
      /><select aria-label="店铺" v-model="shop">
        <option value="">全部店铺</option>
        <option v-for="s in [...new Set(store.db.orders.map((o) => o.shop))]">
          {{ s }}
        </option></select
      ><select aria-label="时间范围" v-model="date">
        <option value="">全部时间</option>
        <option value="7">近7天</option>
        <option value="30">近30天</option></select
      ><select aria-label="排序" v-model="sort">
        <option value="new">最新下单</option>
        <option value="old">最早下单</option>
        <option value="price">金额从高到低</option></select
      ><button
        @click="
          query = '';
          shop = '';
          date = '';
          sort = 'new';
          tab = 'all';
        "
      >
        重置
      </button>
    </div>
    <div class="list-label">
      <span>商品信息</span><span>订单状态 / 实付金额 / 操作</span>
    </div>
    <article class="order-card" v-for="o in shown" :key="o.id">
      <header>
        <strong>▣ {{ o.shop }}</strong
        ><span>订单号 {{ o.id }}</span
        ><time>{{ fmt(o.createdAt) }}</time>
      </header>
      <div class="order-body">
        <ProductArt :icon="o.icon" :color="o.color" small />
        <div class="product-info">
          <RouterLink :to="`/orders/${o.id}`"
            ><h3>{{ o.title }}</h3></RouterLink
          >
          <p>{{ o.spec }} <span class="divider">/</span> 数量 × {{ o.qty }}</p>
          <span class="tag">{{
            o.mode === "group" ? "2人拼单" : "单独购买"
          }}</span
          ><span v-if="o.discount" class="tag soft"
            >优惠 {{ money(o.discount) }}</span
          >
        </div>
        <div class="order-summary">
          <span class="badge" :class="o.status">{{ STATUS[o.status] }}</span
          ><small v-if="o.afterSale">售后：{{ AS[o.afterSale.status] }}</small
          ><strong>{{ money(o.total) }}</strong
          ><small>含运费 {{ money(o.shipping) }}</small>
        </div>
      </div>
      <footer>
        <span class="muted">{{
          o.logistics[0]?.text ||
          o.closeReason ||
          (o.mode === "group" ? "好物一起拼，实惠一起享" : "品质好物，安心选购")
        }}</span>
        <div>
          <RouterLink class="text-link" :to="`/orders/${o.id}`"
            >订单详情 →</RouterLink
          ><ActionPanel :order="o" />
        </div>
      </footer>
    </article>
    <div v-if="!shown.length" class="empty">
      <div>⌕</div>
      <h3>没有符合条件的订单</h3>
      <p>试试其他关键词，或前往精选好物创建第一单。</p>
      <RouterLink class="button" to="/shop">去逛逛</RouterLink>
    </div>
    <div class="pagination">
      <span>共 {{ orders.length }} 条，每页 5 条</span>
      <div>
        <button :disabled="page <= 1" @click="page--">上一页</button>
        <span>{{ page }} / {{ pages }}</span>
        <button :disabled="page >= pages" @click="page++">下一页</button>
      </div>
    </div>
  </section>
</template>
