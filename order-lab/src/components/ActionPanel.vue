<script setup>
import { computed, ref, reactive } from "vue";
import { store, act } from "../services/store";
import { availableActions, ACTIONS, money } from "../domain/orders";
import Modal from "./Modal.vue";
const props = defineProps({ order: Object, simulator: Boolean });
const action = ref(""),
  error = ref(""),
  busy = ref(false),
  form = reactive({});
const actions = computed(() =>
  availableActions(props.order, props.simulator ? "simulator" : store.role),
);
function open(a) {
  action.value = a;
  error.value = "";
  Object.keys(form).forEach((k) => delete form[k]);
  Object.assign(
    form,
    {
      method: "微信支付",
      reason: "",
      rating: 5,
      content: "",
      carrier: "顺丰速运",
      tracking: "",
      type: "refund",
    },
    a === "address" ? props.order.address : {},
  );
}
function submit() {
  if (busy.value) return;
  busy.value = true;
  try {
    act(
      props.order.id,
      action.value,
      { ...form },
      props.simulator ? "simulator" : store.role,
    );
    action.value = "";
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="actions">
    <button
      v-for="(a, i) in actions"
      :key="a"
      :class="{ primary: i === 0 && !simulator }"
      @click="open(a)"
    >
      {{ ACTIONS[a] }}
    </button>
  </div>
  <Modal v-if="action" :title="ACTIONS[action]" @close="action = ''"
    ><form @submit.prevent="submit">
      <p class="muted">订单 {{ order.id }} · {{ money(order.total) }}</p>
      <template v-if="action === 'pay'"
        ><p class="notice">仅模拟支付结果，不会发起真实扣款。</p>
        <label
          >支付方式<select v-model="form.method">
            <option>微信支付</option>
            <option>支付宝</option>
            <option>模拟余额</option>
          </select></label
        ></template
      >
      <template v-if="action === 'address'"
        ><label
          >收货人<input v-model="form.name" required maxlength="30" /></label
        ><label
          >手机号码<input
            v-model="form.phone"
            required
            pattern="1[0-9]{10}"
            maxlength="11" /></label
        ><label
          >详细地址<textarea
            v-model="form.detail"
            required
            minlength="6"
            maxlength="200"
          /></label
      ></template>
      <template v-if="['cancel', 'refund', 'reject'].includes(action)"
        ><label v-if="action === 'refund'"
          >售后类型<select v-model="form.type">
            <option value="refund">仅退款</option>
            <option
              v-if="['shipped', 'completed'].includes(order.status)"
              value="return"
            >
              退货退款
            </option>
          </select></label
        ><label
          >原因<textarea
            v-model="form.reason"
            required
            maxlength="200"
            placeholder="请说明具体原因"
          />
        </label>
        <p v-if="action === 'refund'" class="notice">
          本示例整单全额退款 {{ money(order.total) }}，提交后由商家审核。
        </p></template
      >
      <template v-if="['ship', 'return'].includes(action)"
        ><p v-if="action === 'return'" class="notice">
          演示退货地址：广东省佛山市示例仓库1号，售后组，13800000000（勿真实寄件）。
        </p>
        <label
          >快递公司<select v-model="form.carrier">
            <option>顺丰速运</option>
            <option>中通快递</option>
            <option>圆通速递</option>
            <option>京东物流</option>
          </select></label
        ><label
          >快递单号<input
            v-model="form.tracking"
            required
            pattern="[A-Za-z0-9\-]{8,30}"
            placeholder="如 SF1234567890" /></label
      ></template>
      <template v-if="action === 'review'"
        ><label
          >商品评分<select v-model.number="form.rating">
            <option v-for="n in 5" :value="n">{{ n }} 星</option>
          </select></label
        ><label
          >评价内容<textarea
            v-model="form.content"
            required
            minlength="5"
            maxlength="300"
            placeholder="说说商品的实际使用感受"
          /></label
      ></template>
      <p v-if="['approve', 'refundReceived'].includes(action)" class="notice">
        {{
          action === "approve" && order.afterSale.type === "return"
            ? "同意后等待买家寄回，再确认收货退款。"
            : "确认后立即模拟全额退款，并关闭订单。"
        }}
      </p>
      <p v-if="action === 'receive'">
        请确认已收到商品；确认后订单进入已完成状态。
      </p>
      <p v-if="action === 'join'">模拟另一位买家参团，达到2人后进入待发货。</p>
      <p v-if="action === 'logistics'">添加下一个模拟物流节点。</p>
      <p v-if="action === 'withdraw'">撤销本次申请，恢复原交易可用操作。</p>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <footer>
        <button type="button" @click="action = ''">返回</button
        ><button class="primary" :disabled="busy">
          确认{{ ACTIONS[action] }}
        </button>
      </footer>
    </form></Modal
  >
</template>
