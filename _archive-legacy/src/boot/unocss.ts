import { boot } from 'quasar/wrappers';
import 'uno.css'; // 导入UnoCSS基础样式

export default boot(() => {
  // 这个启动文件确保UnoCSS样式优先于Quasar的样式
  console.log('UnoCSS initialized');
});
