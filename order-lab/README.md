# 拼享 · Vue 3 订单实验室

参考拼多多常见电商场景设计的独立教学系统。Vue 3 + JavaScript + Vue Router + Vite + mockdata.json；无后端、无数据库、无支付账号、无环境变量配置。不是拼多多官方系统，也不声称复刻其内部实现。

## 1. 安装与启动（Windows / macOS / Linux）

安装 Node.js **22.12 或以上版本**（建议 22/24 LTS），终端检查 `node -v`、`npm -v`。解压后进入包含 package.json 的目录：

```bash
cd order-lab
npm install
npm run dev
```

浏览器打开终端显示的地址，默认 http://127.0.0.1:5173 。结束服务按 Ctrl+C。不要双击 index.html，项目需要 Vite 编译 Vue 文件。

```bash
npm test         # 业务规则自动化测试，不依赖浏览器
npm run build    # 生成 dist 生产静态文件
npm run preview  # 本地预览构建结果，默认 4173 端口
```

压缩包不包含 node_modules 和 package-lock.json；首次安装后 npm 会正常生成锁文件。顶层依赖固定版本，但传递依赖仍由安装当时解析；正式开发建议保留自己安装后生成的锁文件。

## 2. 从哪里开始

- **订单中心**：12笔示例订单，覆盖待付款、待成团、待发货、待收货、待评价、已完成、已关闭、售后处理中。
- **精选好物**：6款商品，每款2种规格，拼单/单独购买、数量、优惠券、运费、收货信息与留言。
- **订单详情**：状态进度、支付/拼单倒计时、地址快照、金额拆分、物流、售后、评价、操作日志。
- **顶部角色切换**：买家处理购物与售后；商家发货、审核售后、确认退货退款。
- **演示控制台**：快进1/25小时验证超时；导出当前JSON；恢复初始数据。

第一次建议按 [操作手册](docs/03-USER-GUIDE.md) 的三条流程实际操作。

## 3. 文件导航

```text
order-lab/
├── README.md
├── package.json / vite.config.js / index.html / .gitignore
├── public/mockdata.json             # 商品、规格、库存、券、地址、订单种子
├── src/
│   ├── main.js                     # Vue入口与Hash路由
│   ├── App.vue                     # 导航、角色切换、初始化、时钟
│   ├── style.css                   # 全局视觉与响应式样式
│   ├── domain/orders.js            # 金额、创建、状态转换、权限、超时
│   ├── services/store.js           # 加载JSON、事务副本、本地持久化
│   ├── components/
│   │   ├── Modal.vue               # 对话框、焦点约束、Escape关闭
│   │   ├── ProductArt.vue          # 本地emoji商品示意
│   │   └── ActionPanel.vue         # 按角色生成按钮及对应业务表单
│   └── views/
│       ├── Orders.vue              # 统计、筛选、列表、分页
│       ├── Shop.vue                # 商品、规格、确认订单
│       ├── Detail.vue              # 订单详情及生命周期
│       └── Lab.vue                 # 模拟控制台
├── tests/orders.test.js            # Node内置测试，无额外测试依赖
├── tests/browser-smoke.cjs         # 可选Playwright浏览器闭环测试
└── docs/
    ├── 01-ANALYSIS.md              # 拼多多订单模块拆解、设计取舍
    ├── 02-DESIGN.md                # 状态机、模型、接口、实现方案
    ├── 03-USER-GUIDE.md            # 详细操作及故障排查
    ├── 04-TEST-REPORT.md           # 实际验证结果、范围与限制
    └── 05-ROADMAP.md               # 后端落地、迭代与验收清单
```

## 4. 数据如何工作

首次读取 public/mockdata.json → 将相对时间转换为当前时间 → 保存 localStorage。之后优先恢复当前浏览器数据。浏览器不会把你的操作写回磁盘上的 mockdata.json。

修改 mockdata.json 后，在演示控制台点“恢复初始数据”才能重新载入。localStorage键为 `pinxiang-order-lab-v1`。清除站点数据或更换浏览器/端口会导致本地记录不可见。该项目定位为**单人、单标签页演示**，不支持多人或多标签页并发协作。

## 5. 明确的范围

完整实现的是本文定义的“单商品多数量、单店单包裹、整单售后”演示闭环。没有接入真实支付、真实物流、登录鉴权、聊天客服、平台仲裁、电子发票；不包含购物车跨店拆单、部分退款、换货、多包裹、自动确认收货。这些不是隐藏的半成品按钮，方案与后续落地路径见 docs。

商品为emoji示意，不依赖外部图片/CDN；安装后运行不需要访问真实电商服务。
