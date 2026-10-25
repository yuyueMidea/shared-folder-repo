<script setup>
import { ref } from "vue";
import { store, advance, reset, exportData } from "../services/store";
import Modal from "../components/Modal.vue";
const confirm = ref(""),
  message = ref("");
async function run() {
  try {
    if (confirm.value === "reset") await reset();
    else advance(Number(confirm.value));
    message.value = "操作已完成";
    confirm.value = "";
  } catch (e) {
    message.value = e.message;
  }
}
</script>
<template>
  <section class="page-heading">
    <div>
      <div class="eyebrow">SCENARIO PLAYGROUND</div>
      <h1>演示控制台</h1>
      <p>可复现的测试场景，让订单流程看得见、跑得通。</p>
    </div>
  </section>
  <div class="detail-grid">
    <section class="panel detail-section">
      <h2>模拟时间</h2>
      <p>当前时间：{{ new Date(store.now).toLocaleString("zh-CN") }}</p>
      <p class="muted">
        累计快进
        {{
          store.offset / 3600000
        }}
        小时。仅影响本应用；所有待付款与待成团订单会统一结算超时。
      </p>
      <div class="actions">
        <button @click="confirm = '1'">快进 1 小时</button
        ><button @click="confirm = '25'">快进 25 小时</button>
      </div>
      <hr />
      <h2>演示数据</h2>
      <p>
        浏览器自动保存订单操作；刷新页面后保留。恢复会清除本应用的本地交易进度。
      </p>
      <div class="actions">
        <button @click="exportData">导出当前 JSON</button
        ><button class="danger" @click="confirm = 'reset'">恢复初始数据</button>
      </div>
      <p role="status">{{ message }}</p>
    </section>
    <section class="panel detail-section">
      <h2>建议体验顺序</h2>
      <ol class="guide">
        <li>买家：精选好物 → 下单 → 模拟支付。</li>
        <li>拼单订单：详情 → 模拟好友参团。</li>
        <li>切换商家 → 确认发货，填写单号。</li>
        <li>详情 → 推进物流；切换买家 → 确认收货。</li>
        <li>评价商品，或申请退货退款。</li>
        <li>商家同意 → 买家填写退货单号 → 商家收货并退款。</li>
      </ol>
      <p class="notice">
        角色切换用于单人演示，不是登录鉴权。所有时间规则均为本项目的教学配置。
      </p>
    </section>
  </div>
  <Modal
    v-if="confirm"
    :title="confirm === 'reset' ? '恢复演示数据' : '快进模拟时间'"
    @close="confirm = ''"
    ><p>
      {{
        confirm === "reset"
          ? "将删除当前浏览器中的演示修改，重新加载 mockdata.json。"
          : "将改变所有订单的模拟时间，可能关闭超时订单。"
      }}
    </p>
    <footer>
      <button @click="confirm = ''">取消</button
      ><button class="primary" @click="run">确认操作</button>
    </footer></Modal
  >
</template>
