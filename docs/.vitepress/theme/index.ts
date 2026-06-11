import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import HomeFeatures from "./components/HomeFeatures.vue";
import EmitterMatrix from "./components/EmitterMatrix.vue";
import "./style.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("HomeFeatures", HomeFeatures);
    app.component("EmitterMatrix", EmitterMatrix);
  },
} satisfies Theme;
