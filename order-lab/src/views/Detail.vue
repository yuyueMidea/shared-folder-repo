<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { store } from "../services/store";
import { STATUS, AS, money } from "../domain/orders";
import ActionPanel from "../components/ActionPanel.vue";
import ProductArt from "../components/ProductArt.vue";
const route = useRoute(),
  o = computed(() => store.db.orders.find((x) => x.id === route.params.id));
const fmt = (n) => new Date(n).toLocaleString("zh-CN", { hour12: false });
const steps = computed(() =>
  o.value?.mode === "group"
    ? ["unpaid", "grouping", "toship", "shipped", "completed"]
    : ["unpaid", "toship", "shipped", "completed"],
);
const remain = computed(() => {
  const end =
    o.value.status === "unpaid" ? o.value.payDeadline : o.value.group?.deadline;
  const seconds = Math.max(0, Math.ceil((end - store.now) / 1000));
  return `${Math.floor(seconds / 3600)}小时${Math.floor((seconds % 3600) / 60)}分${seconds % 60}秒`;
});
</script>
<template>
  <template v-if="o"
    ><RouterLink class="text-link" to="/orders">← 返回订单中心</RouterLink>
    <section class="page-heading">
      <div>
        <div class="eyebrow">ORDER DETAILS</div>
        <h1>订单详情</h1>
        <p>{{ o.id }} · 创建于 {{ fmt(o.createdAt) }}</p>
      </div>
      <span class="badge" :class="o.status">{{ STATUS[o.status] }}</span>
    </section>
    <section class="status-banner">
      <div>
        <h2>{{ STATUS[o.status] }}</h2>
        <p v-if="o.status === 'unpaid'">
          请在 {{ remain }} 内完成支付，超时将自动关闭。
        </p>
        <p v-else-if="o.status === 'grouping'">
          已参团 {{ o.group.count }} / {{ o.group.required }} 人 · 剩余
          {{ remain }}
        </p>
        <p v-else-if="o.status === 'closed'">
          {{ o.closeReason || o.afterSale?.reason || "订单已关闭" }} ·
          {{ o.payment === "refunded" ? "款项已模拟退回" : "未产生支付" }}
        </p>
        <p v-else>
          {{
            o.status === "completed"
              ? "感谢你的购买，期待分享使用感受。"
              : "订单正在有序处理中，你可以随时查看最新进度。"
          }}
        </p>
      </div>
      <ActionPanel :order="o" />
    </section>
    <div v-if="o.status !== 'closed'" class="steps">
      <div
        v-for="(s, i) in steps"
        :class="{ done: steps.indexOf(o.status) >= i }"
      >
        <b>{{ i + 1 }}</b
        >{{ STATUS[s] }}
      </div>
    </div>
    <div class="detail-grid">
      <div>
        <section class="panel detail-section">
          <h2>商品与金额</h2>
          <div class="detail-product">
            <ProductArt :icon="o.icon" :color="o.color" small />
            <div>
              <small>{{ o.shop }}</small>
              <h3>{{ o.title }}</h3>
              <p>
                {{ o.spec }} · {{ o.qty }} 件 ·
                {{ o.mode === "group" ? "拼单购买" : "单独购买" }}
              </p>
            </div>
          </div>
          <div class="price-box">
            <p>
              商品单价 <span>{{ money(o.unitPrice) }}</span>
            </p>
            <p>
              商品总额 <span>{{ money(o.subtotal) }}</span>
            </p>
            <p>
              运费 <span>{{ money(o.shipping) }}</span>
            </p>
            <p>
              优惠 <span>−{{ money(o.discount) }}</span>
            </p>
            <h3>
              {{
                o.payment === "unpaid"
                  ? "待付"
                  : o.payment === "refunded"
                    ? "已退"
                    : "实付"
              }}金额 <strong>{{ money(o.total) }}</strong>
            </h3>
          </div>
          <p class="muted">
            支付方式：{{ o.paymentMethod || "未支付" }} · 买家留言：{{
              o.note || "无"
            }}
          </p>
        </section>
        <section class="panel detail-section">
          <h2>物流轨迹</h2>
          <p v-if="o.tracking">{{ o.carrier }} · {{ o.tracking }}</p>
          <ul class="timeline" v-if="o.logistics.length">
            <li v-for="l in o.logistics">
              <strong>{{ l.text }}</strong
              ><small>{{ fmt(l.time) }}</small>
            </li>
          </ul>
          <p v-else class="muted">暂未发货，还没有物流信息。</p>
        </section>
        <section v-if="o.afterSale" class="panel detail-section">
          <h2>
            售后服务 <span class="badge">{{ AS[o.afterSale.status] }}</span>
          </h2>
          <p>
            {{ o.afterSale.type === "return" ? "退货退款" : "仅退款" }} ·
            {{ money(o.afterSale.amount) }}
          </p>
          <p>申请原因：{{ o.afterSale.reason }}</p>
          <p v-if="o.afterSale.rejectReason">
            拒绝原因：{{ o.afterSale.rejectReason }}
          </p>
          <p v-if="o.afterSale.tracking">
            退货物流：{{ o.afterSale.carrier }} {{ o.afterSale.tracking }}
          </p>
          <details v-if="o.afterSales.length">
            <summary>历史售后 {{ o.afterSales.length }} 次</summary>
            <p v-for="a in o.afterSales">{{ AS[a.status] }} · {{ a.reason }}</p>
          </details>
        </section>
        <section v-if="o.review" class="panel detail-section">
          <h2>我的评价</h2>
          <p class="stars">
            {{ "★".repeat(o.review.rating)
            }}{{ "☆".repeat(5 - o.review.rating) }}
          </p>
          <p>{{ o.review.content }}</p>
        </section>
      </div>
      <div>
        <section class="panel detail-section">
          <h2>收货信息</h2>
          <h3>
            {{ o.address.name }}
            <span class="muted">{{ o.address.phone }}</span>
          </h3>
          <p>{{ o.address.detail }}</p>
          <small class="muted">这是下单时保存的地址快照。</small>
        </section>
        <section class="panel detail-section">
          <h2>操作记录</h2>
          <ul class="timeline">
            <li v-for="e in o.events">
              <strong>{{ e.text }}</strong
              ><small
                >{{ fmt(e.time) }} ·
                {{
                  {
                    buyer: "买家",
                    merchant: "商家",
                    simulator: "模拟器",
                    system: "系统",
                  }[e.actor]
                }}</small
              >
            </li>
          </ul>
        </section>
        <section class="simulation detail-section">
          <h3>场景模拟器</h3>
          <p>代替外部用户参团和快递事件，便于独立跑通流程。</p>
          <ActionPanel :order="o" simulator />
          <p class="muted">超时模拟请进入「演示控制台」。</p>
        </section>
      </div>
    </div></template
  >
  <section v-else class="empty">
    <h2>订单不存在</h2>
    <RouterLink to="/orders">返回列表</RouterLink>
  </section>
</template>
