import { createApp } from "vue";
import { createRouter, createWebHashHistory } from "vue-router";
import App from "./App.vue";
import Orders from "./views/Orders.vue";
import Shop from "./views/Shop.vue";
import Detail from "./views/Detail.vue";
import Lab from "./views/Lab.vue";
import "./style.css";
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/orders" },
    { path: "/orders", component: Orders },
    { path: "/shop", component: Shop },
    { path: "/orders/:id", component: Detail },
    { path: "/lab", component: Lab },
    { path: "/:pathMatch(.*)*", redirect: "/orders" },
  ],
});
createApp(App).use(router).mount("#app");
