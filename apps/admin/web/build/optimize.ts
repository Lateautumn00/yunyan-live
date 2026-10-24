/**
 * 此文件作用于 `vite.config.ts` 的 `optimizeDeps.include` 依赖预构建配置项
 */
const include = [
  "qs",
  "mitt",
  "dayjs",
  "axios",
  "pinia",
  "vue-i18n",
  "js-cookie",
  "vue-tippy",
  "echarts",
  "element-plus",
  "nprogress",
  "@vueuse/core",
  "@vueuse/motion",
  "@pureadmin/utils",
  "vue",
  "vue-router",
  "responsive-storage",
  "localforage"
];

/**
 * 在预构建中强制排除的依赖项
 */
const exclude = ["@iconify/json"];

export { include, exclude };
