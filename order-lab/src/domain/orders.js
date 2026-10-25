/** Pure domain: all amounts are integer cents. No Vue/storage dependency. */
export const STATUS = {
  unpaid: "待付款",
  grouping: "待成团",
  toship: "待发货",
  shipped: "待收货",
  completed: "已完成",
  closed: "已关闭",
};
export const AS = {
  pending: "待审核",
  returning: "待寄回",
  returned: "待商家收货",
  refunded: "退款成功",
  rejected: "已拒绝",
  withdrawn: "已撤销",
};
export const money = (n) => `¥${(n / 100).toFixed(2)}`;
export const activeAfterSale = (o) =>
  ["pending", "returning", "returned"].includes(o.afterSale?.status);
export function assert(ok, message) {
  if (!ok) throw new Error(message);
}
export const clone = (x) => JSON.parse(JSON.stringify(x));
export function addressValid(a) {
  return (
    a &&
    a.name?.trim() &&
    /^1\d{10}$/.test(a.phone) &&
    a.detail?.trim().length >= 6
  );
}
export function quote(product, skuId, qty, mode, couponId, coupons) {
  const sku = product.skus.find((s) => s.id === skuId);
  assert(sku, "请选择有效规格");
  assert(
    Number.isInteger(qty) && qty >= 1 && qty <= 20,
    "数量须为 1–20 的整数",
  );
  assert(["single", "group"].includes(mode), "购买方式无效");
  assert(sku.stock >= qty, "库存不足");
  const unitPrice = mode === "group" ? sku.groupPrice : sku.price,
    subtotal = unitPrice * qty;
  const coupon = coupons.find((c) => c.id === couponId);
  assert(!couponId || coupon, "优惠券不存在");
  assert(!coupon || subtotal >= coupon.min, "未达到优惠券门槛");
  const discount = coupon?.amount || 0,
    shipping = subtotal >= 9900 ? 0 : 600;
  return {
    unitPrice,
    subtotal,
    discount,
    shipping,
    total: Math.max(0, subtotal - discount) + shipping,
  };
}
function log(o, text, now, actor) {
  o.events.unshift({ time: now, text, actor });
}
function restore(db, o, restock = true) {
  if (o.stockReleased) return;
  const p = db.products.find((p) => p.id === o.productId),
    s = p?.skus.find((s) => s.id === o.skuId);
  if (s && restock) s.stock += o.qty;
  o.stockReleased = true;
  if (o.couponId) {
    const c = db.coupons.find((c) => c.id === o.couponId);
    if (c?.orderId === o.id) {
      c.orderId = null;
    }
  }
}
export function createOrder(db, input, now) {
  const p = db.products.find((p) => p.id === input.productId);
  assert(p, "商品不存在");
  assert(
    addressValid(input.address),
    "请填写姓名、11位手机号和至少6字的详细地址",
  );
  assert((input.note || "").length <= 100, "买家留言最多100字");
  const coupon = db.coupons.find((c) => c.id === input.couponId);
  assert(!coupon?.orderId, "优惠券已被占用");
  const price = quote(
    p,
    input.skuId,
    input.qty,
    input.mode,
    input.couponId,
    db.coupons,
  );
  const sku = p.skus.find((s) => s.id === input.skuId);
  const o = {
    id: `PX${now}${++db.sequence}`,
    productId: p.id,
    skuId: sku.id,
    title: p.title,
    shop: p.shop,
    icon: p.icon,
    color: p.color,
    spec: sku.name,
    qty: input.qty,
    mode: input.mode,
    ...price,
    couponId: input.couponId || "",
    address: clone(input.address),
    note: input.note || "",
    status: "unpaid",
    payment: "unpaid",
    group:
      input.mode === "group"
        ? { count: 1, required: 2, status: "waiting" }
        : null,
    createdAt: now,
    payDeadline: now + 30 * 60000,
    events: [],
    logistics: [],
    afterSales: [],
    afterSale: null,
    review: null,
    stockReleased: false,
  };
  sku.stock -= input.qty;
  if (coupon) coupon.orderId = o.id;
  log(o, "创建订单，库存与优惠券已预占", now, "buyer");
  db.orders.unshift(o);
  return o;
}
export function availableActions(o, role) {
  const a = [];
  const active = activeAfterSale(o);
  if (role === "buyer") {
    if (o.status === "unpaid") a.push("pay", "cancel", "address");
    if (["grouping", "toship"].includes(o.status) && !active) a.push("address");
    if (o.status === "shipped" && !active) a.push("receive");
    if (o.status === "completed" && !o.review && !active) a.push("review");
    if (
      ["grouping", "toship", "shipped", "completed"].includes(o.status) &&
      !active &&
      o.payment === "paid"
    )
      a.push("refund");
    if (o.afterSale?.status === "pending") a.push("withdraw");
    if (o.afterSale?.status === "returning") a.push("return");
  }
  if (role === "merchant") {
    if (o.status === "toship" && !active) a.push("ship");
    if (o.afterSale?.status === "pending") a.push("approve", "reject");
    if (o.afterSale?.status === "returned") a.push("refundReceived");
  }
  if (role === "simulator") {
    if (o.status === "grouping" && !active) a.push("join");
    if (o.status === "shipped" && !active) a.push("logistics");
  }
  return a;
}
export const ACTIONS = {
  pay: "模拟支付",
  cancel: "取消订单",
  address: "修改地址",
  receive: "确认收货",
  review: "评价商品",
  refund: "申请售后",
  withdraw: "撤销售后",
  return: "填写退货单号",
  ship: "确认发货",
  approve: "同意售后",
  reject: "拒绝售后",
  refundReceived: "收货并退款",
  join: "模拟好友参团",
  logistics: "推进物流",
};
export function transition(
  db,
  id,
  action,
  payload = {},
  role = "buyer",
  now = Date.now(),
) {
  const o = db.orders.find((o) => o.id === id);
  assert(o, "订单不存在");
  assert(
    availableActions(o, role).includes(action),
    "当前状态或角色不允许此操作",
  );
  const status = (next) => {
    o.status = next;
  };
  const refund = () => {
    const restock =
      ["grouping", "toship"].includes(o.status) ||
      o.afterSale.type === "return";
    o.payment = "refunded";
    o.afterSale.status = "refunded";
    o.afterSale.completedAt = now;
    restore(db, o, restock);
    status("closed");
  };
  switch (action) {
    case "pay":
      assert(now < o.payDeadline, "订单已超时，请刷新状态");
      assert(
        ["微信支付", "支付宝", "模拟余额"].includes(payload.method),
        "请选择支付方式",
      );
      o.payment = "paid";
      o.paymentMethod = payload.method;
      o.paidAt = now;
      if (o.mode === "group") {
        status("grouping");
        o.group.deadline = now + 24 * 3600000;
      } else status("toship");
      break;
    case "cancel":
      assert(payload.reason?.trim(), "请选择取消原因");
      status("closed");
      o.closeReason = payload.reason;
      restore(db, o);
      break;
    case "address":
      assert(addressValid(payload), "收货信息格式不正确");
      o.address = clone(payload);
      break;
    case "join":
      o.group.count = 2;
      o.group.status = "success";
      status("toship");
      break;
    case "ship":
      assert(
        payload.carrier?.trim() &&
          /^[A-Za-z0-9-]{8,30}$/.test(payload.tracking),
        "快递单号须为8–30位字母、数字或短横线",
      );
      o.carrier = payload.carrier;
      o.tracking = payload.tracking;
      o.shippedAt = now;
      status("shipped");
      o.logistics.unshift({ time: now, text: "商家已发货，等待揽收" });
      break;
    case "logistics": {
      const steps = [
        "快递已揽收",
        "运输中 · 已到达目的地分拨中心",
        "派送中 · 请保持电话畅通",
        "已签收 · 请核对商品",
      ];
      assert(o.logistics.length <= steps.length, "已签收，无更多物流节点");
      o.logistics.unshift({ time: now, text: steps[o.logistics.length - 1] });
      break;
    }
    case "receive":
      status("completed");
      o.completedAt = now;
      break;
    case "review":
      assert(
        Number.isInteger(payload.rating) &&
          payload.rating >= 1 &&
          payload.rating <= 5,
        "评分为1–5星",
      );
      assert(
        payload.content?.trim().length >= 5 && payload.content.length <= 300,
        "评价内容须为5–300字",
      );
      o.review = {
        rating: payload.rating,
        content: payload.content.trim(),
        time: now,
      };
      break;
    case "refund":
      assert(
        !o.completedAt || now - o.completedAt <= 15 * 86400000,
        "本演示设置的15天售后期已过",
      );
      assert(["refund", "return"].includes(payload.type), "售后类型无效");
      assert(
        !["grouping", "toship"].includes(o.status) || payload.type === "refund",
        "未发货只能申请仅退款",
      );
      assert(
        payload.reason?.trim().length >= 2 && payload.reason.length <= 200,
        "售后原因须为2–200字",
      );
      if (o.afterSale) o.afterSales.push(clone(o.afterSale));
      o.afterSale = {
        id: `AS${now}`,
        status: "pending",
        type: payload.type,
        reason: payload.reason,
        amount: o.total,
        createdAt: now,
      };
      break;
    case "withdraw":
      o.afterSale.status = "withdrawn";
      break;
    case "approve":
      if (o.afterSale.type === "return") o.afterSale.status = "returning";
      else refund();
      break;
    case "reject":
      assert(
        payload.reason?.trim().length >= 2 && payload.reason.length <= 200,
        "请填写2–200字拒绝原因",
      );
      o.afterSale.status = "rejected";
      o.afterSale.rejectReason = payload.reason;
      break;
    case "return":
      assert(
        payload.carrier?.trim() &&
          /^[A-Za-z0-9-]{8,30}$/.test(payload.tracking),
        "请填写快递公司及8–30位有效单号",
      );
      o.afterSale.status = "returned";
      o.afterSale.carrier = payload.carrier;
      o.afterSale.tracking = payload.tracking;
      break;
    case "refundReceived":
      refund();
      break;
  }
  log(o, ACTIONS[action], now, role);
  return o;
}
export function expire(db, now) {
  let changed = false;
  for (const o of db.orders) {
    if (o.status === "unpaid" && now >= o.payDeadline) {
      o.status = "closed";
      o.closeReason = "支付超时";
      restore(db, o);
      log(o, "30分钟未支付，自动关闭", now, "system");
      changed = true;
    }
    if (o.status === "grouping" && now >= o.group.deadline) {
      o.status = "closed";
      o.group.status = "failed";
      o.payment = "refunded";
      if (o.afterSale) {
        o.afterSales.push(clone(o.afterSale));
      }
      o.afterSale = {
        id: `AS${now}${o.id}`,
        status: "refunded",
        type: "refund",
        reason: "拼单超时自动退款",
        amount: o.total,
        createdAt: now,
        completedAt: now,
      };
      restore(db, o);
      log(o, "24小时未成团，模拟原路退款", now, "system");
      changed = true;
    }
  }
  return changed;
}
