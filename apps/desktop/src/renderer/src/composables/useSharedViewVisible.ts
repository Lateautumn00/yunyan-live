import { ref, type Ref } from 'vue';

/**
 * 外挂共享视图（F3.4 电路 / F3.5 分子 iframe 浮层）开合的全局旗标。
 * 便签悬浮球 z-index 1500 会压过浮层（z-index 40）浮进 iframe，
 * App 侧据此在浮层打开期间隐藏便签入口（对话框保持挂载不受影响）。
 * 由 SharedViewOverlay 驱动（kind 开→置位、组件卸载→复位），App.vue 消费。
 */
const sharedViewVisible = ref(false);

export function useSharedViewVisible(): {
  /** 外挂视图浮层是否打开中 */
  sharedViewVisible: Ref<boolean>;
  /** 写入口（SharedViewOverlay 开合/卸载时调用） */
  setSharedViewVisible: (visible: boolean) => void;
} {
  function setSharedViewVisible(visible: boolean): void {
    sharedViewVisible.value = visible;
  }

  return { sharedViewVisible, setSharedViewVisible };
}
