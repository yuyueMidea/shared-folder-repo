# 代码对比（Code Compare）

Vue 3 + TypeScript + Vite + Monaco Diff Editor。纯前端，无后端，内容只保存在浏览器 localStorage。

## 本地运行
```bash
npm install
npm run dev
```

## 部署到 Vercel
1. 推送到 GitHub / GitLab。
2. Vercel → Add New Project → 导入仓库。框架会自动识别为 Vite（`vercel.json` 已配置）。
3. 直接 Deploy。或使用 CLI：`npx vercel --prod`。

## 目录结构
```
src/
  App.vue                  工具栏、导入/导出、补丁生成
  components/DiffPane.vue  Monaco Diff Editor 封装（双向绑定、统计、拖拽导入）
  monaco/loader.ts         Monaco 懒加载、worker、明暗主题
  composables/useSettings.ts  设置与内容持久化
  utils/languages.ts       语言列表与扩展名识别
```
