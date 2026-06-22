// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from '#q-app/wrappers';
import UnoCSS from 'unocss/vite';
import unoConfig from './uno.config';
import VueDevTools from 'vite-plugin-vue-devtools';

export default defineConfig((ctx) => {
	return {
		// https://v2.quasar.dev/quasar-cli-vite/prefetch-feature
		// preFetch: true,

		// app boot file (/src/boot)
		// --> boot files are part of "main.js"
		// https://v2.quasar.dev/quasar-cli-vite/boot-files
		boot: [
			// 确保UnoCSS在应用启动时加载
			'unocss',
			// 任务管理器初始化和清理逻辑
			'taskManager',
			// Quasar 组件默认属性配置
			'quasarDefaults',
		],

		// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#css
		css: ['../assets/styles/app.scss'],

		// https://github.com/quasarframework/quasar/tree/dev/extras
		extras: [
			// 'ionicons-v4',
			// 'mdi-v7',
			// 'fontawesome-v6',
			// 'eva-icons',
			// 'themify',
			// 'line-awesome',
			// 'roboto-font-latin-ext', // this or either 'roboto-font', NEVER both!

			'roboto-font', // optional, you are not bound to it
			'material-icons', // optional, you are not bound to it
		],

		// Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#build
		build: {
			target: {
				browser: ['es2022', 'firefox115', 'chrome115', 'safari14'],
				node: 'node20',
			},

			typescript: {
				strict: true,
				vueShim: true,
				// extendTsConfig (tsConfig) {}
			},

			vueRouterMode: 'hash', // available values: 'hash', 'history'
			// vueRouterBase,
			vueDevtools: ctx.dev, // 仅在开发环境启用 Vue DevTools
			// vueOptionsAPI: false,

			// rebuildCache: true, // rebuilds Vite/linter/etc cache on startup

			// publicPath: '/',
			// analyze: true,
			// env: {},
			// rawDefine: {}
			// ignorePublicFolder: true,
			// minify: false,
			// polyfillModulePreload: true,
			// distDir

			extendViteConf(viteConf) {
				// 使用配置文件初始化UnoCSS
				viteConf.plugins?.push(UnoCSS(unoConfig));
				// 仅在开发环境启用 Vite 的 Vue DevTools 插件
				if (ctx.dev) {
					viteConf.plugins = viteConf.plugins || [];
					viteConf.plugins.push(VueDevTools());
				}
				viteConf.build = viteConf.build || {};
				viteConf.build.rollupOptions = {
					external: [
						'electron',
						'serialport',
						'@serialport/bindings-cpp',
						'@serialport/parser-readline',
						'@serialport/stream',
					],
					// output: {
					//   format: "commonjs",
					// },

					// external: ["electron"],
					// output: {
					//   format: "es", // 使用 ES 模块格式
					// },

					// external: ["electron"],
					// output: {
					//   format: "commonjs", // 改用 commonjs 格式
					// },
				};
				// 添加这个关键配置
				viteConf.build.commonjsOptions = {
					ignoreDynamicRequires: true,
				};
			},
			// viteVuePluginOptions: {},

			vitePlugins: [
				// 暂时注释掉 vite-plugin-checker 插件
				// [
				//   'vite-plugin-checker',
				//   {
				//     vueTsc: true,
				//     eslint: {
				//       lintCommand: 'eslint -c ./eslint.config.js "./src*/**/*.{ts,js,mjs,cjs,vue}"',
				//       useFlatConfig: true,
				//     },
				//   },
				//   { server: false },
				// ],
			],
		},

		// Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#devserver
		devServer: {
			// https: true,
			open: true, // opens browser window automatically
		},

		// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#framework
		framework: {
			config: {},

			// iconSet: 'material-icons', // Quasar icon set
			// lang: 'en-US', // Quasar language pack

			// For special cases outside of where the auto-import strategy can have an impact
			// (like functional components as one of the examples),
			// you can manually specify Quasar components/directives to be available everywhere:
			//
			// components: [],
			// directives: [],

			// Quasar plugins
			plugins: [
				'Notify', // 确保 Notify 插件在这里
				'Dialog',
				// ...其他插件
			],
		},

		// animations: 'all', // --- includes all animations
		// https://v2.quasar.dev/options/animations
		animations: [],

		// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#sourcefiles
		// sourceFiles: {
		//   rootComponent: 'src/App.vue',
		//   router: 'src/router/index',
		//   store: 'src/store/index',
		//   pwaRegisterServiceWorker: 'src-pwa/register-service-worker',
		//   pwaServiceWorker: 'src-pwa/custom-service-worker',
		//   pwaManifestFile: 'src-pwa/manifest.json',
		//   electronMain: 'src-electron/electron-main',
		//   electronPreload: 'src-electron/electron-preload'
		//   bexManifestFile: 'src-bex/manifest.json
		// },

		// https://v2.quasar.dev/quasar-cli-vite/developing-ssr/configuring-ssr
		ssr: {
			prodPort: 3000, // The default port that the production server should use
			// (gets superseded if process.env.PORT is specified at runtime)

			middlewares: [
				'render', // keep this as last one
			],

			// extendPackageJson (json) {},
			// extendSSRWebserverConf (esbuildConf) {},

			// manualStoreSerialization: true,
			// manualStoreSsrContextInjection: true,
			// manualStoreHydration: true,
			// manualPostHydrationTrigger: true,

			pwa: false,
			// pwaOfflineHtmlFilename: 'offline.html', // do NOT use index.html as name!

			// pwaExtendGenerateSWOptions (cfg) {},
			// pwaExtendInjectManifestOptions (cfg) {}
		},

		// https://v2.quasar.dev/quasar-cli-vite/developing-pwa/configuring-pwa
		pwa: {
			workboxMode: 'GenerateSW', // 'GenerateSW' or 'InjectManifest'
			// swFilename: 'sw.js',
			// manifestFilename: 'manifest.json',
			// extendManifestJson (json) {},
			// useCredentialsForManifestTag: true,
			// injectPwaMetaTags: false,
			// extendPWACustomSWConf (esbuildConf) {},
			// extendGenerateSWOptions (cfg) {},
			// extendInjectManifestOptions (cfg) {}
		},

		// Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-cordova-apps/configuring-cordova
		cordova: {
			// noIosLegacyBuildFlag: true, // uncomment only if you know what you are doing
		},

		// Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor
		capacitor: {
			hideSplashscreen: true,
		},

		// Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/configuring-electron
		electron: {
			extendElectronMainConf: (esbuildConf) => {
				esbuildConf.entryPoints = {
					main: 'src-electron/main/index.ts',
				};
			},
			extendElectronPreloadConf: (esbuildConf) => {
				esbuildConf.entryPoints = {
					preload: 'src-electron/preload/index.ts',
				};
			},

			// extendPackageJson (json) {},

			// Electron preload scripts (if any) from /src-electron, WITHOUT file extension
			preloadScripts: ['electron-preload'],

			// specify the debugging port to use for the Electron app when running in development mode
			inspectPort: 5858,

			bundler: 'builder', // 'packager' or 'builder'

			packager: {
				// 其他配置...
				asar: false, // 关键修改，不使用asar打包
				// extraResource: ['node_modules/serialport', 'node_modules/@serialport'], // 移除这行，让serialport作为正常依赖处理
				// ignore: [
				//   // 忽略开发依赖和不必要的文件
				//   /node_modules\/.*\/test/,
				//   /node_modules\/.*\/tests/,
				//   /node_modules\/.*\/\.nyc_output/,
				//   /node_modules\/.*\/coverage/,
				//   /node_modules\/.*\/\.git/,
				//   /node_modules\/.*\/docs/,
				//   /node_modules\/.*\/examples/,
				//   /node_modules\/.*\/\.vscode/,
				//   /\.pnpm/,
				//   /\.git/,
				//   /dist/,
				//   /src-electron\/.*\.map$/,
				// ],
			},

			builder: {
				// https://www.electron.build/configuration/configuration

				// 修改：使用英文 appId（使用反向域名格式）
				appId: 'com.lct.commander',

				// 禁用自动重建原生依赖，避免 Windows 下 pnpm 执行问题
				// 原生依赖应该在打包前通过 electron-rebuild 手动重建
				npmRebuild: false,

				// 启用 asar 打包（默认启用）
				asar: true,

				// 排除 public 文件夹，不将其打包到 asar 中
				// 然后使用 extraResources 将其作为额外资源放在 resources/public
				files: [
					'**/*',
					'!public/**/*', // 排除 public 文件夹，不打包到 asar
				],

				// 将 public 文件夹作为额外资源放在 resources/public
				// 使用 extraResources 从源目录复制 public 文件夹到 resources/public
				// 这样可以确保 public 文件夹可写，且不会被打包到 asar 中
				extraResources: [
					{
						from: 'public',
						to: 'public',
						filter: ['**/*'],
					},
				],

				// 配置 Windows 特定的构建选项
				win: {
					target: [
						{
							target: 'nsis',
							arch: ['x64'],
						},
					],
				},

				// 配置 NSIS 安装程序选项
				nsis: {
					oneClick: false,
					allowToChangeInstallationDirectory: true,
				},

				// 配置 Linux 特定的构建选项
				linux: {
					target: [
						{
							target: 'AppImage',
							arch: ['x64'],
						},
						{
							target: 'deb',
							arch: ['x64'],
						},
					],
					icon: 'src-electron/icons/icon.png',
					category: 'Utility',
					// 可执行文件名（使用英文，避免路径问题）
					executableName: 'lct-commander',
					// deb 包描述信息
					synopsis: '激光模拟器',
					description: '激光模拟器',
					// desktop 文件配置
					desktop: {
						Name: '激光模拟器',
						Comment: '激光模拟器',
						Categories: 'Utility;',
						// Exec 字段会自动生成，格式为: executableName %U
						// Terminal: false, // 默认 false，如果设置为 true，会在终端中运行
						StartupNotify: true, // 启用启动通知
					},
				},
			},
		},

		// Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-browser-extensions/configuring-bex
		bex: {
			// extendBexScriptsConf (esbuildConf) {},
			// extendBexManifestJson (json) {},

			/**
			 * The list of extra scripts (js/ts) not in your bex manifest that you want to
			 * compile and use in your browser extension. Maybe dynamic use them?
			 *
			 * Each entry in the list should be a relative filename to /src-bex/
			 *
			 * @example [ 'my-script.ts', 'sub-folder/my-other-script.js' ]
			 */
			extraScripts: [],
		},
	};
});
