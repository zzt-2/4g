# S009 Electron 主窗口 devTools 默认开 + 无边框窗口 + 自定义窗口控制按钮

> 2026-06-22 | 实施 | 状态:代码完成,待用户实测
> 2026-06-22 续接 | 顺手修滚动条盖标题栏 bug(早存,frameless 后暴露)

## 目标

用户三件事需求(原话见 voice.md 2026-06-22):

1. **DevTools 默认打开**——dev 模式自动开,不用每次 Ctrl+Shift+I
2. **去掉系统默认标题栏**——无边框窗口
3. **自定义窗口控制按钮**——最小化/最大化/关闭三个按钮放到应用顶部条

质量要求(用户原话):"别给我堆屎山"——自定义标题栏要正经做,样式走 `--rw-*` token,IPC 通道命名规范,preload expose 的 API 类型要补全。

## 记录

### 改动全景(三层联动)

| 层 | 文件 | 改动 |
|----|------|------|
| 主进程 | `src-electron/main/index.ts` | `frame: false` + dev 自动 `openDevTools({mode:'detach'})` + 注册/清理 window handlers |
| 主进程 | `src-electron/main/window-handlers.ts` | **新增** —— 5 个 IPC handler(minimize/maximize-toggle/is-maximized/close + maximize-changed 推送)|
| 类型 | `src/shared/platform-bridge.ts` | 新增 `WindowControlBridge` interface + 加到 `RewritePlatformBridge.windowControl?` |
| preload | `src-electron/preload/index.ts` | 新增 `windowControlBridge` 实现 + expose 到 `rewriteBridge` |
| 渲染层 | `src/app/AppShell.vue` | q-toolbar 加 3 按钮 + drag/no-drag 区 + 最大化图标响应式同步 |

### 关键设计决策(详见 D009)

**1. `frame: false` 全自定义 vs `titleBarStyle: 'hidden'`** —— 选 `frame: false`:
- 用户明确"把三个按钮放到标题栏" → 意图是自画,不是藏标题文字留系统按钮
- 项目 builder 只有 linux target(`quasar.config.ts:85-109`),`titleBarStyle: 'hidden' + titleBarOverlay` 在 Linux 上不稳;`frame: false` 跨平台一致
- 自画按钮 + CSS `-webkit-app-region: drag` 是 Electron 无边框窗口的标准做法

**2. DevTools dev 开 / prod 关** —— 用 `process.env.DEV` 判断:
- dev: `win.webContents.openDevTools({ mode: 'detach' })`(独立窗口不遮应用界面)
- prod: 不开(最终用户不需要;要 prod 开走单独"调试模式"开关,本次不做)
- 不碰 `vite-plugin-vue-devtools`(`quasar.config.ts:3,39`)——那是 Vue 组件树 devtools,跟 Electron DevTools 不是一回事

**3. IPC 通道命名** —— 沿用项目 `domain:action` 风格(对齐 `transport:serial-connect` / `file:read-text`):
- `window:minimize` / `window:maximize-toggle` / `window:is-maximized` / `window:close`
- `window:maximize-changed`(主→renderer 推送,最大化状态同步)

**4. 最大化图标同步** —— 主进程推事件而非 renderer 轮询(对齐现有 `transport:event` 推送模式):
- main 监听 `win.on('maximize'/'unmaximize')` → `webContents.send('window:maximize-changed', bool)`
- renderer `onMaximizeChange(cb)` 订阅,图标在 `fullscreen` / `fullscreen_exit` 间切
- 组件 mount 时先 `isMaximized()` 取初始态(避免图标初始错位)

**5. Bridge API 形状** —— 新增 `windowControl` 命名空间(与 transport/file/http/ftp/storage 同级):
```ts
interface WindowControlBridge {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<boolean>;  // 返回切换后状态供点击即时反馈
  isMaximized(): Promise<boolean>;     // 组件初始化取初始图标态
  close(): Promise<void>;
  onMaximizeChange(cb: (maximized: boolean) => void): () => void;
}
```
renderer 直接读 `window[REWRITE_PLATFORM_BRIDGE_KEY]?.windowControl`,**不**经 `src/platform/` facade —— 窗口控制是壳层 UI 能力,与业务 facade 同级,没必要再封一层(也没 caching 需求)。

### 实现细节要点

- **drag 区布局**:整条 `q-toolbar` 是 `-webkit-app-region: drag`(标题栏任意空白处可拖动窗口),menu 按钮 + 窗口控制按钮组分别标 `no-drag`(否则点不到)
- **三按钮样式**:走 `--rw-color-*` token——普通态 `text-secondary`,hover 浅 `surface-selected` + `text-primary`;**关闭按钮单独 hover 红底白字**(`status-danger` + `#ffffff`,退出语义)
- **按钮间距**:`gap: var(--rw-space-1)` + `margin-left: var(--rw-space-2)`,与现有 q-header 视觉融合
- **lifecycle 合并**:AppShell 原有 runtime onMounted/onUnmounted 与窗口控制初始化订阅合并到单组 hook(避免两组 onMounted 分散)
- **cleanup 配对**:`registerWindowHandlers` 挂的 `maximize`/`unmaximize` 监听 + 4 个 ipcMain.handle,在 `cleanupWindowHandlers` 全移除(对齐其他 handlers 的 register/cleanup 配对模式),并在 `mainWindow.on('closed')` 调用

### 验证状态

| 项 | 结果 | 说明 |
|----|------|------|
| lint | **0 新增 error** | 全局 10 个 error 全在无关文件(serial-handlers/display/northbound/storage-highspeed/HomePage,本任务未碰) |
| tsc(我的文件) | **0 error** | `window-handlers.ts` + `preload/index.ts` + `platform-bridge.ts` 三文件一起 strict tsc 过(exit 0) |
| AppShell.vue | eslint 过(0 新增) | 用标准 Quasar 组件 + 已验证的 CSS token,无类型风险 |
| build | **EBUSY 失败(环境,非代码)** | rimraf 清 `dist/electron/Packaged/win-unpacked/resources/app.asar` 时文件锁——**正是 D006 / topic-index 记录的已知环境问题**。失败发生在清理阶段,**没编到我的代码**(electron-main.js 时间戳停在 06-21)。5 个 electron.exe 在跑(含一个 dev server),app.asar 被某进程锁住,我不杀不明进程。 |
| dev GUI 实测 | **未实测** | 当前有 dev server 在跑,我的 renderer 改动 HMR 可生效,但 **main/preload 改动需重启 dev server** 才生效(`frame:false` 和 DevTools 自开是主进程行为)。 |

### 待用户做的验证(必做)

1. **完全重启 `quasar dev -m electron`**(关掉当前 dev server 再开,不是 HMR):
   - 窗口出来就**自动开 DevTools**(detach 独立窗口)
   - 窗口**没有系统标题栏**(Win 上无左上角图标/标题/右上角三系统按钮)
   - 应用顶部条右侧有**自画三按钮**,点击行为正确
   - **标题栏可拖动**(按住非按钮区拖窗口)
   - 最大化/还原图标随窗口状态切换(点按钮 + Win+Up/Snap/双击标题栏都应同步)
2. **prod build**:解除 app.asar 文件锁后跑 `quasar build -m electron`,确认 prod 不开 DevTools、无边框窗口同样生效。

## 决策引用

- **D009**(新建,decisions.md):无边框窗口方案 —— `frame:false` 全自定义(否决 `titleBarStyle:'hidden'`)+ DevTools dev-only 自开 + windowControl bridge 契约。

## 范围确认

- 本轮是否在 scope boundary 内:**是**。窗口壳层属应用层体验调整,ui-feature-bugs 是杂项收纳筐(S005 碰过 electron 打包、S006 碰过 UI 重设计),本任务一致。
- 未碰业务 feature(task/send/receive/display/northbound)。
- 未碰 _archive-legacy。
- 未引入新依赖(electron 自带 BrowserWindow API 够用)。

## 后续

- **必做**:用户重启 dev server 实测三件事 + 解锁后 prod build。
- **可选优化**(用户没要求,不做):macOS traffic lights 适配(builder 只有 linux target,本次按 Win/Linux 一致处理);窗口双击标题栏最大化(当前靠系统 Snap,frame:false 下部分系统不自动——但按钮 + drag 已覆盖核心交互);maximize-changed 推送在 webContents 销毁后 send 会抛(cleanup 已移除监听,理论安全)。

## 续接(2026-06-22):修滚动条盖标题栏 bug

### 用户反馈

> "为啥目前页面的滚动条甚至盖到了标题栏？顶层搞的不好？要不看看咋弄"

### 根因(systematic-debugging 四阶段走完)

**这不是 frameless 改动引入的 bug**——DOM 滚动模型不变,frame:false 只影响窗口外框。但 frameless 后右上角是**自画窗口按钮**,滚动条盖住的是"刚加的按钮区"而非"系统标题栏",**视觉更刺眼**,用户这才注意到。**早就存在**,b40e2b8 此前尝试修过但半截。

**完整高度链断裂分析**(读 Quasar 源 CSS 铁证):
```
.q-layout { width:100%; outline:0; }              /* 无 height! */
.q-layout-container { position:relative; height:100%; }  /* 父级要有高度 */
.q-layout-container .q-layout { min-height:100%; }       /* 内容超高会撑开 */
.q-page-container { /* 仅 transition,无 height/overflow */ }
.q-page { position:relative; }                            /* 无 height */
```
+ base.scss 此前只有 `html,body,#q-app { min-height:100% }`(**无 height,无 overflow**)

**断裂点**:
1. `body` 只有 `min-height:100%` 无 `height` → body 可被超高内容撑过视口
2. `#q-app`(=.q-layout-container)`height:100%` 的父级 body 无 height → `height:100%` 退化为 auto
3. `.q-layout { min-height:100% }` 内容超高撑开
4. `.app-shell__page-container { height:100%; overflow:hidden }`(b40e2b8 的修复)**失效**:`height:100%` 的父级 `.q-layout` 无明确 height → 退化为 auto → 容器随内容撑开,`overflow:hidden` 无溢出可裁 → 溢出向上冒泡到 body
5. body 撑过视口 → **body 级滚动条出现**

**为啥滚动条盖住 fixed header**:Quasar 按 view="hHh" 让 q-header `position:fixed` 钉视口顶,但**滚动条是浏览器绘制在视口右边缘的最顶层元素**(z-index 无效,浏览器行为),fixed header 也盖不住。b40e2b8 注释里"= q-layout = 100vh"的假设是错的——`.q-layout` 不是 100vh,是 `min-height:100%`。

### 修复(根因修复,非治标)

两文件改:
- **`src/css/layers/_base.scss`**:`html,body,#q-app` 加 `height:100%`(给 .q-layout-container 一个稳定视口高度父级,让高度链成立)+ `html,body` 加 `overflow:hidden`(body 本身永不滚动)。
- **`src/app/AppShell.vue`**:`.app-shell__page-container` 从 `overflow:hidden` 改 `overflow-y:auto`(成为唯一滚动容器,在 header 下方滚动——Quasar 按 view 自动给本容器加 padding-top=header 高度,滚动条出现在 header 下而非盖住)。

**兼容性**(两个 q-page 模式都不破):
- `h-full` 页面(Display/Send/TaskManage):q-page 高度恰 100% 不溢出,不滚动,行为不变
- `min-h-full` 页面(Home/Connection/CommandIngress/FrameList/Settings/History):超高时在 page-container 内滚,滚动条在 header 下方

**不动**:q-dialog/q-menu(Quasar portal + position:fixed 视口定位,body overflow:hidden 不影响)、q-drawer(layout 内部)、业务 feature。

### 续接验证

- SCSS 编译过(sass.compile app.scss → 4571 bytes,0 error)
- AppShell.vue eslint 0 error(scss 文件 eslint 无配置忽略,符合预期)
- 纯 CSS 改动,无 TS/模板改动,tsc 不受影响
- **待用户实测**:base.scss 改动需重启 dev server(全局 CSS 重编),AppShell 改动 HMR 可生效
