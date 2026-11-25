# requestAnimationFrame 与 Event Loop、微任务、渲染流水线

## 1. rAF 是什么，不是什么

`requestAnimationFrame(cb)` 的语义是：**请求浏览器在下一次重绘之前调用 `cb`**。几个关键事实：

- **它不是定时器，也不属于任何任务队列。** `setTimeout`、`postMessage`、用户事件都会作为 task 进入 task queue，而 rAF 回调存放在每个 Document 自己的"动画帧回调列表"里，由事件循环的"更新渲染（update the rendering）"步骤统一取出执行。
- **它跟着显示器刷新节奏走（VSync）。** 60Hz 约每 16.7ms 一次，120Hz 约 8.3ms 一次。
- **同一帧内所有回调收到的时间戳相同。** 这个时间戳是该帧开始的时间（`DOMHighResTimeStamp`），不是回调实际执行的时刻，所以适合做动画插值。
- **页面不可见时，渲染机会会停止或大幅降频，rAF 随之暂停。** 这是它比 `setInterval(fn, 16)` 省电的主要原因。

## 2. 放进 Event Loop 里看

HTML 规范中事件循环的一次迭代，可以简化成这样：

```
┌─────────────────────────────────────────────┐
│ 1. 从某个 task queue 取一个 task 执行        │
│ 2. 微任务检查点：清空整个微任务队列           │
│ 3. 这一轮是不是"渲染机会"？                  │
│     否 → 回到 1                              │
│     是 → 更新渲染：                          │
│        a. 触发 resize / scroll 事件          │
│        b. 媒体查询、CSS 动画/Web Animations   │
│           推进                               │
│        c. ★ 执行 rAF 回调                    │
│        d. 重新计算样式 + 布局（Style/Layout）│
│        e. ResizeObserver（可能循环到布局稳定）│
│        f. IntersectionObserver               │
│        g. 绘制（Paint）→ 提交给合成器         │
│ 4. 若主线程空闲：可能执行 requestIdleCallback │
└─────────────────────────────────────────────┘
```

由此可以推出几个重要结论。

**① 渲染不是每轮循环都发生。** 浏览器会根据刷新率、页面可见性、是否有视觉变化等判断是否有"渲染机会"。两次渲染之间可能跑了很多个 task，比如多个 `setTimeout`、网络回调、`MessageChannel`。

**② rAF 在样式计算和布局之前执行。** 这是它最有价值的特性：你在 rAF 里改 DOM 或样式，**同一帧内**就会被后面的 Style/Layout/Paint 处理，不会延迟一帧。反过来，如果在 `setTimeout` 里改 DOM，修改可能落在帧的任意位置，也可能被浏览器合并到下一帧。

**③ 一个 task 跑得太久，渲染就被推迟。** 渲染步骤要等当前 task 和微任务都结束才能轮到。如果某个 task 或 rAF 回调耗时 50ms，就会掉帧，这就是 jank 的本质。

## 3. 与微任务队列的关系

微任务（`Promise.then`、`queueMicrotask`、`MutationObserver`）的执行时机是"**JS 调用栈清空时**"，不是"task 结束时"。所以：

- 每个 rAF 回调执行完、调用栈清空后，都会立刻做一次微任务检查点。因此 **rAF 回调 A 中产生的微任务，会在 rAF 回调 B 之前执行**。
- 微任务可以无限追加，这会**饿死渲染**：

```js
function starve() {
  Promise.resolve().then(starve); // 微任务无限自我续命
}
starve(); // 页面卡死，rAF 永远不会被执行
```

而同样写法换成 `setTimeout(starve)` 页面不会卡死，因为每个 timer task 之间，浏览器有机会插入渲染。

用一段代码验证顺序：

```js
console.log('script');

setTimeout(() => console.log('timeout'), 0);

requestAnimationFrame(() => {
  console.log('raf1');
  Promise.resolve().then(() => console.log('micro in raf1'));
});
requestAnimationFrame(() => console.log('raf2'));

Promise.resolve().then(() => console.log('micro'));
```

确定的部分：`script` → `micro`（当前脚本 task 结束后的微任务）；`raf1` → `micro in raf1` → `raf2`（微任务夹在两个 rAF 回调之间）。

**不确定**的部分：`timeout` 与 `raf1` 谁先谁后。通常 `timeout` 先，但如果恰好赶上渲染机会，rAF 可能更早。依赖这个顺序的代码是有 bug 的。

另外，**在 rAF 回调内再调用 `requestAnimationFrame`，新回调属于下一帧**。规范是先取出当前列表的快照再执行，所以不会造成同帧死循环。

## 4. 与渲染流水线的关系

以 Chromium 的多线程架构为例，一帧大致是：

```
主线程:   Input → rAF(JS) → Style → Layout → Pre-paint → Paint ──┐
                                                                 ▼ commit
合成线程:                                       Layerize → Raster(分块) → Draw
GPU进程:                                                   → 显示到屏幕
```

实用推论：

- **JS 和 Style/Layout/Paint 都挤在主线程上，共享一帧的预算。** 16.7ms 里要扣掉浏览器自己的开销，留给你的 rAF 回调通常只有约 10ms。
- **只改 `transform` / `opacity` 的动画可以跳过 Layout 和 Paint**，由合成器线程直接处理，主线程卡住时也能保持流畅，这就是 CSS 动画和 Web Animations 比 JS 逐帧改 `left/top` 更稳的原因。
- **连续输入事件（`mousemove`、`wheel`、`touchmove`）通常会被对齐到 rAF 前派发**，每帧最多一次。所以在 `mousemove` 里只记录最新坐标，真正更新 DOM 放进 rAF，是标准的节流手法。

## 5. 布局抖动（Layout Thrashing）

rAF 回调里读写 DOM 的顺序很关键：

```js
// ❌ 每次循环都：写 → 读（强制同步布局）
items.forEach(el => {
  el.style.width = box.offsetWidth + 'px'; // 先读 offsetWidth 迫使 Layout 重算
});

// ✅ 先批量读，再批量写
requestAnimationFrame(() => {
  const w = box.offsetWidth;                        // 读
  items.forEach(el => (el.style.width = w + 'px')); // 写
});
```

读取 `offsetWidth`、`getBoundingClientRect()` 等属性时，如果样式已被修改过，浏览器必须**立刻同步执行**样式计算和布局来给出正确答案，这会把原本帧末才做一次的工作变成多次。

## 6. 典型用法与技巧

**标准动画循环（基于时间而非帧数）：**

```js
let last;
function loop(ts) {
  last ??= ts;
  const dt = (ts - last) / 1000; // 秒
  last = ts;

  x += speed * dt;               // 速度 × 时间，与刷新率无关
  el.style.transform = `translateX(${x}px)`;

  id = requestAnimationFrame(loop);
}
let id = requestAnimationFrame(loop);
// 停止：cancelAnimationFrame(id)
```

不要写成 `x += 2`。在 120Hz 屏幕上它会比 60Hz 快一倍。

**"双 rAF"确保样式已提交：**

```js
el.classList.add('box');           // 初始状态
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    el.classList.add('box--active'); // 触发 transition
  });
});
```

只用一层 rAF 时，初始样式和目标样式可能被合并到同一次样式计算里，过渡不生效。第一层 rAF 之后，浏览器还没做 Style，第二层 rAF 已经是下一帧，此时初始样式一定已被应用。（强制读取 `el.offsetWidth` 触发 reflow 也能达到同样效果。）

**"让出到绘制之后"：**

```js
requestAnimationFrame(() => {
  // 这里在绘制之前
  const ch = new MessageChannel();
  ch.port1.onmessage = () => { /* 通常在这一帧绘制之后 */ };
  ch.port2.postMessage(null);
});
```

这是"rAF + 宏任务"的常见组合，用于测量"首次绘制后"的时间点或在绘制后做非紧急工作。React 调度器等也用类似思路，现代方案还有 `scheduler.postTask` 和 `scheduler.yield()`。

## 7. 常见误区速查

| 误区 | 事实 |
|---|---|
| rAF 回调保证每 16.7ms 执行一次 | 只保证"下一次渲染前"，帧率受显示器、负载、节能模式影响 |
| rAF 是宏任务 | 不是，它是"更新渲染"步骤的一部分，不在 task queue 中 |
| 在 rAF 里 `await` 之后的代码仍在这一帧 | `await` 之后的续体是微任务，仍在同一次回调的微任务检查点内；但若 await 的是真正的异步操作（网络、timer），续体就会跑到之后的 task 里 |
| 用 rAF 替代所有 `setTimeout` | rAF 只适合与视觉更新同步的工作；后台逻辑、轮询用它会在标签页隐藏时停摆 |
| rAF 回调里做重计算没关系 | 它直接占用帧预算，重活应拆片、交给 Worker，或用 `requestIdleCallback` |
| 后台标签页 rAF 仍会跑 | 通常暂停；需要后台持续运行的逻辑要用别的机制（如 Worker 里的 timer） |

## 8. 一句话总结

> **Event Loop 决定"何时轮到渲染"，微任务决定"每段 JS 结束前先清什么"，rAF 则是渲染流水线在 Style/Layout/Paint 之前留给你的最后一个 JS 钩子。**

把视觉相关的 DOM 写操作放进 rAF，把读操作和重计算放到它之前或之外，避免长任务和失控的微任务链堵住渲染，这样基本就能得到稳定的流畅度。
