import { ref, onUnmounted } from 'vue';

/**
 * 视口管理工具：解决移动端 100vh 包含导航栏导致的遮挡问题
 */
export const useViewport = () => {
  const visualHeight = ref(window.innerHeight);
  const visualWidth = ref(window.innerWidth);

  const updateViewport = () => {
    if (window.visualViewport) {
      // 使用 visualViewport.height 获得实际可见区域高度（不含键盘和地址栏遮挡部分）
      visualHeight.value = window.visualViewport.height;
      visualWidth.value = window.visualViewport.width;
    } else {
      visualHeight.value = window.innerHeight;
      visualWidth.value = window.innerWidth;
    }

    // 设置 CSS 变量供全局使用
    const vh = visualHeight.value * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    document.documentElement.style.setProperty('--visual-height', `${visualHeight.value}px`);
  };

  const init = () => {
    updateViewport();
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewport);
      window.visualViewport.addEventListener('scroll', updateViewport);
    }
    window.addEventListener('resize', updateViewport);
  };

  const destroy = () => {
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', updateViewport);
      window.visualViewport.removeEventListener('scroll', updateViewport);
    }
    window.removeEventListener('resize', updateViewport);
  };

  return { init, destroy, visualHeight, visualWidth };
};
