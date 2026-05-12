import { defineComponent, createApp, h, ref, type Component, type VNode } from 'vue';
import styles from './ConfirmDialog.module.css';

interface ConfirmOptions {
  title?: string;
  content: string | Component | VNode | (() => VNode);
  confirmText?: string;
  cancelText?: string;
}

const ConfirmModal = defineComponent({
  name: 'ConfirmModal',
  props: {
    title: String,
    content: [String, Object, Function],
    confirmText: { type: String, default: '确认' },
    cancelText: { type: String, default: '取消' },
    onConfirm: Function,
    onCancel: Function
  },
  setup(props) {
    const visible = ref(false);
    
    // 入场动画
    setTimeout(() => {
      visible.value = true;
    }, 10);

    const handleCancel = () => {
      visible.value = false;
      props.onCancel?.();
    };

    const handleConfirm = () => {
      visible.value = false;
      props.onConfirm?.();
    };

    return () => (
      <div class={[styles.overlay, { [styles.show]: visible.value }]}>
        <div class={styles.modal}>
          <div class={styles.header}>
            <h3>{props.title || '确认'}</h3>
          </div>
          <div class={styles.body}>
            {typeof props.content === 'string' 
              ? <p>{props.content}</p>
              : (typeof props.content === 'function' ? (props.content as () => VNode)() : (props.content as VNode))
            }
          </div>
          <div class={styles.footer}>
            <button class={[styles.btn, styles.btnCancel]} onClick={handleCancel}>{props.cancelText}</button>
            <button class={[styles.btn, styles.btnOk]} onClick={handleConfirm}>{props.confirmText}</button>
          </div>
        </div>
      </div>
    );
  }
});

/**
 * 导出命令式调用函数
 * 使用方式: const ok = await showConfirm({ title: '确认', content: '是否删除？' });
 */
export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    const app = createApp({
      render() {
        return h(ConfirmModal, {
          ...options,
          onConfirm: () => {
            setTimeout(() => {
              app.unmount();
              div.remove();
              resolve(true);
            }, 300);
          },
          onCancel: () => {
            setTimeout(() => {
              app.unmount();
              div.remove();
              resolve(false);
            }, 300);
          }
        });
      }
    });

    app.mount(div);
  });
}
