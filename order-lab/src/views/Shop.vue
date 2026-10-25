<script setup>
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { store, order } from "../services/store";
import { quote, money } from "../domain/orders";
import ProductArt from "../components/ProductArt.vue";
import Modal from "../components/Modal.vue";
const router = useRouter(),
  selected = ref(null),
  error = ref(""),
  busy = ref(false),
  filter = ref("全部");
const form = reactive({
  skuId: "",
  qty: 1,
  mode: "group",
  couponId: "",
  address: {},
  note: "",
});
const list = computed(() =>
  store.db.products.filter(
    (p) => filter.value === "全部" || p.category === filter.value,
  ),
);
const price = computed(() => {
  if (!selected.value) return null;
  try {
    return quote(
      selected.value,
      form.skuId,
      form.qty,
      form.mode,
      form.couponId,
      store.db.coupons,
    );
  } catch {
    return null;
  }
});
function buy(p) {
  selected.value = p;
  error.value = "";
  Object.assign(form, {
    skuId: p.skus[0].id,
    qty: 1,
    mode: "group",
    couponId: "",
    note: "",
    address: { ...store.db.addresses[0] },
  });
}
function submit() {
  if (busy.value) return;
  busy.value = true;
  try {
    const o = order({ ...form, productId: selected.value.id });
    router.push(`/orders/${o.id}`);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="page-heading">
    <div>
      <div class="eyebrow">GOOD THINGS, TOGETHER</div>
      <h1>精选好物</h1>
      <p>从挑选到签收，体验完整的订单旅程。</p>
    </div>
    <span class="pill">✦ 每一笔都是模拟交易</span>
  </section>
  <div class="shop-banner">
    <div>
      <small>一起拼，更划算</small>
      <h2>把生活的小美好<br />装进每一份订单。</h2>
      <p>2人成团 · 满 ¥99 包邮 · 本地演示</p>
    </div>
    <span>🛍️</span>
  </div>
  <div class="category">
    <button
      v-for="c in [
        '全部',
        ...new Set(store.db.products.map((p) => p.category)),
      ]"
      :class="{ primary: filter === c }"
      @click="filter = c"
    >
      {{ c }}
    </button>
  </div>
  <div class="product-grid">
    <article class="product-card" v-for="p in list" :key="p.id">
      <ProductArt :icon="p.icon" :color="p.color" />
      <div class="product-copy">
        <small>{{ p.shop }} · {{ p.category }}</small>
        <h3>{{ p.title }}</h3>
        <p>{{ p.description }}</p>
        <div>
          <strong
            >{{ money(p.skus[0].groupPrice) }} <small>拼单价起</small></strong
          ><button
            class="primary"
            @click="buy(p)"
            :disabled="store.role !== 'buyer'"
          >
            {{ store.role === "buyer" ? "去下单" : "请切换买家" }}
          </button>
        </div>
      </div>
    </article>
  </div>
  <Modal v-if="selected" title="确认订单" @close="selected = null"
    ><form @submit.prevent="submit">
      <h3>{{ selected.title }}</h3>
      <label
        >商品规格<select v-model="form.skuId">
          <option v-for="s in selected.skus" :value="s.id">
            {{ s.name }} · 剩余 {{ s.stock }} 件
          </option>
        </select></label
      >
      <div class="form-grid">
        <label
          >购买方式<select v-model="form.mode">
            <option value="group">2人拼单</option>
            <option value="single">单独购买</option>
          </select></label
        ><label
          >购买数量<input
            v-model.number="form.qty"
            type="number"
            min="1"
            max="20"
            required
        /></label>
      </div>
      <label
        >优惠券<select v-model="form.couponId">
          <option value="">不使用优惠券</option>
          <option
            v-for="c in store.db.coupons.filter((c) => !c.orderId)"
            :value="c.id"
          >
            {{ c.name }}
          </option>
        </select></label
      >
      <div class="form-grid">
        <label
          >收货人<input
            v-model="form.address.name"
            required
            maxlength="30" /></label
        ><label
          >手机号<input
            v-model="form.address.phone"
            required
            pattern="1[0-9]{10}"
            maxlength="11"
        /></label>
      </div>
      <label
        >详细收货地址<textarea
          v-model="form.address.detail"
          required
          minlength="6"
          maxlength="200"
        /></label
      ><label
        >买家留言<input
          v-model="form.note"
          maxlength="100"
          placeholder="选填，最多100字"
      /></label>
      <div v-if="price" class="price-box">
        <p>
          商品金额 <span>{{ money(price.subtotal) }}</span>
        </p>
        <p>
          运费（商品满99免运费）<span>{{ money(price.shipping) }}</span>
        </p>
        <p>
          优惠抵扣 <span>−{{ money(price.discount) }}</span>
        </p>
        <h3>
          应付合计 <strong>{{ money(price.total) }}</strong>
        </h3>
      </div>
      <p v-else class="error">请检查数量、库存和优惠券门槛。</p>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <footer>
        <button type="button" @click="selected = null">再想想</button
        ><button class="primary" :disabled="!price || busy">提交订单</button>
      </footer>
    </form></Modal
  >
</template>
