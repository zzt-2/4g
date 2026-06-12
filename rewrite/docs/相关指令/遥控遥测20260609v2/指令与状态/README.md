# 指令与状态

本目录放可直接查表使用的文档。

## 目录

- `遥控指令清单/`：每个模块支持哪些遥控 group、param 和动作。
- `遥控指令具体执行/`：每条遥控指令的默认 RS422 发送帧。
- `遥测指令清单/`：每个模块支持哪些遥测组和状态字。
- `遥测状态具体执行/`：每个遥测组的默认回传帧示例。

## 生成工具

```powershell
python .\工程部署\工具\remote_command_inventory\generate_remote_command_inventory.py
```

## UI 字段解释

上位机 UI 使用的字段截取、控件类型和中文显示放在：

```text
../UI字段定义/README.md
```
