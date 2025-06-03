import { boot } from 'quasar/wrappers';

export default boot(({ app }) => {
  // 工业风格配色方案
  const industrialColors = {
    // 主要文本色 - 更柔和的白色
    primaryText: '#e2e8f0',
    // 次要文本色 - 蓝灰色
    secondaryText: '#94a3b8',
    // 选中状态 - 亮蓝色
    primary: '#60a5fa',
    // 悬停状态 - 更亮的蓝色
    primaryHover: '#93c5fd',
    // 未选中状态 - 中性灰蓝色
    inactive: '#64748b',
    // 输入框背景 - 深蓝灰色
    inputBg: 'rgba(47, 52, 62, 0.8)',
    // 边框色 - 蓝灰色
    border: '#334155',
  };

  // 拦截组件渲染过程
  app.mixin({
    beforeMount() {
      const componentName =
        this.$options.name ||
        this.$options.__name ||
        (this.$options.__file && this.$options.__file.includes('QInput'))
          ? 'QInput'
          : this.$options.__file && this.$options.__file.includes('QOptionGroup')
            ? 'QOptionGroup'
            : null;

      // 调试输出
      if (componentName === 'QInput' || componentName === 'QOptionGroup') {
        // console.log('检测到组件:', componentName, this.$props);
      }
    },

    mounted() {
      const componentName = this.$options.name || this.$options.__name;

      // 检查是否是 QOptionGroup 组件
      if (
        componentName === 'QOptionGroup' ||
        (this.$el && this.$el.classList && this.$el.classList.contains('q-option-group'))
      ) {
        // console.log('为 QOptionGroup 应用工业风格配色');

        // 添加 text-white 类
        if (this.$el && this.$el.classList) {
          this.$el.classList.add('text-white');
        }

        // 应用工业风格配色
        if (this.$el) {
          this.$el.style.color = industrialColors.primaryText;

          // 查找所有的 radio 和 checkbox 元素
          const radios = this.$el.querySelectorAll('.q-radio, .q-checkbox');
          radios.forEach((radio: Element) => {
            if (radio instanceof HTMLElement) {
              // 设置整个radio/checkbox的颜色
              radio.style.color = industrialColors.primaryText;

              // 查找并设置标签颜色
              const label = radio.querySelector('.q-radio__label, .q-checkbox__label');
              if (label instanceof HTMLElement) {
                label.style.color = industrialColors.primaryText;
                label.style.fontWeight = '500';
                // 添加悬停效果
                label.addEventListener('mouseenter', () => {
                  label.style.color = industrialColors.primaryHover;
                });
                label.addEventListener('mouseleave', () => {
                  label.style.color = industrialColors.primaryText;
                });
              }

              // 查找并设置内部圆圈/方框的颜色（未选中状态）
              const inner = radio.querySelector('.q-radio__inner, .q-checkbox__inner');
              if (inner instanceof HTMLElement) {
                inner.style.color = industrialColors.inactive;
                inner.style.transition = 'color 0.2s ease';
              }

              // 特别处理选中状态 - 设置为亮蓝色
              if (
                radio.classList.contains('q-radio--checked') ||
                radio.classList.contains('q-checkbox--checked')
              ) {
                if (inner instanceof HTMLElement) {
                  inner.style.color = industrialColors.primary;
                }
              }

              // 添加悬停效果
              radio.addEventListener('mouseenter', () => {
                if (
                  !radio.classList.contains('q-radio--checked') &&
                  !radio.classList.contains('q-checkbox--checked')
                ) {
                  if (inner instanceof HTMLElement) {
                    inner.style.color = industrialColors.secondaryText;
                  }
                }
              });

              radio.addEventListener('mouseleave', () => {
                if (
                  !radio.classList.contains('q-radio--checked') &&
                  !radio.classList.contains('q-checkbox--checked')
                ) {
                  if (inner instanceof HTMLElement) {
                    inner.style.color = industrialColors.inactive;
                  }
                }
              });
            }
          });

          // 监听点击事件，动态更新选中状态的颜色
          this.$el.addEventListener('click', () => {
            setTimeout(() => {
              const allRadios = this.$el.querySelectorAll('.q-radio, .q-checkbox');
              allRadios.forEach((radio: Element) => {
                if (radio instanceof HTMLElement) {
                  const inner = radio.querySelector('.q-radio__inner, .q-checkbox__inner');
                  if (inner instanceof HTMLElement) {
                    if (
                      radio.classList.contains('q-radio--checked') ||
                      radio.classList.contains('q-checkbox--checked')
                    ) {
                      inner.style.color = industrialColors.primary; // 选中状态：亮蓝色
                    } else {
                      inner.style.color = industrialColors.inactive; // 未选中状态：中性灰色
                    }
                  }
                }
              });
            }, 50); // 延迟一点确保DOM更新完成
          });
        }
      }

      // 检查是否是 QInput 组件
      if (
        componentName === 'QInput' ||
        (this.$el && this.$el.classList && this.$el.classList.contains('q-field'))
      ) {
        // console.log('为 QInput 应用工业风格配色');

        // 应用工业风格的输入框样式
        const control = this.$el?.querySelector('.q-field__control');
        if (control instanceof HTMLElement) {
          control.style.backgroundColor = industrialColors.inputBg;
          control.style.borderColor = industrialColors.border;
          control.style.borderRadius = '6px';
          control.style.transition = 'all 0.2s ease';

          // 添加聚焦效果
          const field = this.$el;
          if (field) {
            field.addEventListener('focusin', () => {
              control.style.borderColor = industrialColors.primary;
              control.style.boxShadow = `0 0 0 2px ${industrialColors.primary}20`;
            });

            field.addEventListener('focusout', () => {
              control.style.borderColor = industrialColors.border;
              control.style.boxShadow = 'none';
            });
          }
        }

        const native = this.$el?.querySelector('.q-field__native');
        if (native instanceof HTMLElement) {
          native.style.color = industrialColors.primaryText;
          native.style.fontSize = '14px';
        }

        // 设置占位符颜色
        const style = document.createElement('style');
        style.textContent = `
          .q-field__native::placeholder {
            color: ${industrialColors.secondaryText} !important;
            opacity: 0.7;
          }
        `;
        document.head.appendChild(style);
      }
    },
  });
});
