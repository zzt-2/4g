# Linux 构建说明

## 前置依赖

在 WSL 中构建 Linux 应用前，需要安装以下依赖：

### Ubuntu/Debian 系统

```bash
# 安装构建 deb 包所需的工具
sudo apt-get update
sudo apt-get install -y dpkg-dev fakeroot

# 安装构建 AppImage 所需的依赖（可选，如果只需要 deb 可以跳过）
sudo apt-get install -y fuse

# 安装 electron-builder 可能需要的其他依赖
sudo apt-get install -y libfuse2 libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2
```

## 构建命令

配置文件中已设置同时构建 AppImage 和 deb 两种格式，运行：

```bash
pnpm build:linux
```

构建完成后，文件会在 `dist/electron/Packaged/` 目录下。

## 如果只想构建单一格式

如果遇到问题，可以修改 `quasar.config.ts` 中的 `linux.target` 数组，只保留一种格式：

```typescript
linux: {
  target: [
    {
      target: 'AppImage',  // 或 'deb'
      arch: ['x64'],
    },
  ],
  // ... 其他配置
}
```

## 调试启动问题

如果 AppImage 双击无反应或 deb 安装后无法启动，请按以下步骤排查：

### 1. 在终端中运行 AppImage（推荐）

在终端中运行 AppImage 可以看到详细的错误信息：

```bash
# 给 AppImage 添加执行权限（如果需要）
chmod +x "激光链路标准测试设备上位机-1.0.0.AppImage"

# 在终端中运行并查看日志
./激光链路标准测试设备上位机-1.0.0.AppImage

# 或者使用绝对路径
/path/to/激光链路标准测试设备上位机-1.0.0.AppImage
```

### 2. 检查可执行文件

如果是 unpacked 版本（从 deb 安装或解压的），检查可执行文件：

```bash
# 查找应用安装位置
dpkg -L <package-name> | grep lct-commander

# 或手动查找（通常在以下位置之一）
# /opt/lct-commander/lct-commander
# /usr/bin/lct-commander
# ~/.local/share/lct-commander/lct-commander

# 在终端中运行可执行文件
/path/to/lct-commander
```

### 3. 检查依赖库

确保系统安装了所需的依赖库：

```bash
# 检查是否有缺失的库
ldd /path/to/lct-commander | grep "not found"

# 如果发现缺失的库，安装对应的包
# 例如：libfuse2, libnss3 等
sudo apt-get install -y libfuse2 libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2
```

### 4. 启用详细日志

设置环境变量以获取更详细的日志：

```bash
# 启用 Electron 调试日志
DEBUG=* ./激光链路标准测试设备上位机-1.0.0.AppImage

# 或使用 Electron 的调试标志
./激光链路标准测试设备上位机-1.0.0.AppImage --enable-logging
```

### 5. 检查桌面文件（deb 安装后）

如果通过 deb 安装后找不到应用，检查 desktop 文件：

```bash
# 查找 desktop 文件
find /usr/share/applications ~/.local/share/applications -name "*lct*" -o -name "*commander*"

# 检查 desktop 文件内容
cat /usr/share/applications/com.lct.commander.desktop

# 验证 Exec 字段中的路径是否正确
# Exec 字段应该指向实际的可执行文件路径
```

### 6. 常见错误及解决方案

- **错误：`cannot execute binary file`**
  - 检查文件架构是否匹配：`file lct-commander` 应该显示 `x86-64`
  
- **错误：`No such file or directory`**
  - 可能是缺少依赖库，使用 `ldd` 检查
  
- **错误：`Permission denied`**
  - 添加执行权限：`chmod +x lct-commander`
  
- **窗口不显示（常见原因：asar 文件加载问题）**
  - 如果日志显示路径包含 `app.asar`，确保使用 `loadFile()` 而不是 `loadURL()` 加载文件
  - 检查日志中是否有页面加载失败的错误
  - 确保 `index.html` 存在于 `app.asar` 中
  - 检查是否缺少必要的图形库

## 常见问题

1. **如果 AppImage 构建失败**：确保安装了 `fuse` 库
2. **如果 deb 构建失败**：确保安装了 `dpkg-dev` 和 `fakeroot`
3. **如果提示缺少库**：根据错误信息安装对应的系统库
4. **如果双击无反应**：在终端中运行查看详细错误日志（见上面的调试指南）

