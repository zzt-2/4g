#!/usr/bin/env python3
"""
扫描 Claude Code + Codex 对话日志，找出被创建/修改过但现已丢失的文件。
区分：真正丢失 vs 有意删除（代码精简）vs 有未提交风险。

用法:
  python3 scripts/audit-lost-files.py              # 完整报告
  python3 scripts/audit-lost-files.py --json       # JSON 输出
  python3 scripts/audit-lost-files.py --no-codex   # 只扫 Claude Code
"""

import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path("/mnt/d/code/frontend/dongfanghong")
CLAUDE_LOGS = Path.home() / ".claude/projects/-mnt-d-code-frontend-dongfanghong"
CODEX_LOGS = Path.home() / ".codex/sessions"


def git(cmd):
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
    return r.stdout.strip()


def get_tracked_files():
    return set(git(["git", "ls-files"]).split('\n')) if git(["git", "ls-files"]) else set()


def get_git_status():
    result = git(["git", "status", "--porcelain"])
    files = {}
    for line in result.split('\n'):
        if not line.strip():
            continue
        status = line[:2]
        filepath = line[3:].strip()
        files[filepath] = status
    return files


def scan_claude_logs():
    """扫描 Claude Code 对话日志"""
    file_ops = defaultdict(lambda: {
        "sessions": set(), "writes": 0, "edits": 0,
        "write_snippets": [], "edit_snippets": [],
    })

    log_files = sorted(CLAUDE_LOGS.glob("*.jsonl"))
    print(f"扫描 Claude Code 日志: {len(log_files)} 个", file=sys.stderr)

    for lf in log_files:
        sid = lf.stem
        with open(lf) as f:
            for line in f:
                try:
                    obj = json.loads(line.strip())
                    for item in obj.get("message", {}).get("content", []):
                        if not isinstance(item, dict) or item.get("name") not in ("Edit", "Write"):
                            continue
                        fp = item.get("input", {}).get("file_path", "")
                        if not fp or not fp.startswith(str(REPO)):
                            continue
                        info = file_ops[fp]
                        info["sessions"].add(sid)
                        info["source"] = "claude"
                        if item["name"] == "Write":
                            info["writes"] += 1
                            txt = item["input"].get("content", "")
                            info["write_snippets"].append((sid[:8], txt[:100].replace('\n', ' ')))
                        else:
                            info["edits"] += 1
                            old = item["input"].get("old_string", "")[:60].replace('\n', ' ')
                            new = item["input"].get("new_string", "")[:60].replace('\n', ' ')
                            info["edit_snippets"].append((sid[:8], old, new))
                except (json.JSONDecodeError, KeyError):
                    continue
    return file_ops


def scan_codex_logs():
    """扫描 Codex 对话日志 (exec_command 中提取文件写入操作)"""
    file_ops = defaultdict(lambda: {
        "sessions": set(), "writes": 0, "edits": 0,
        "write_snippets": [], "edit_snippets": [],
    })

    log_files = sorted(CODEX_LOGS.rglob("*.jsonl"))
    print(f"扫描 Codex 日志: {len(log_files)} 个", file=sys.stderr)

    # 匹配写入文件的 shell 命令模式
    write_patterns = [
        re.compile(r"(?:cat|tee)\s*>\s*['\"]?(\S+?)['\"]?"),       # cat > file / tee > file
        re.compile(r"echo\s+.*?>\s*['\"]?(\S+?)['\"]?"),           # echo ... > file
        re.compile(r"(\S+?)\s*=\s*['\"]?.*?['\"]?\s*>\s*"),         # redirect patterns
    ]
    # 简化：匹配 > 重定向目标
    redirect_re = re.compile(r">\s*['\"]?(/[^\s'\"]+)")

    for lf in log_files:
        sid = lf.stem.split('-')[-1][:8] if '-' in lf.stem else lf.stem[:8]
        with open(lf) as f:
            for line in f:
                try:
                    obj = json.loads(line.strip())
                    payload = obj.get("payload", {})
                    if payload.get("type") != "function_call":
                        continue
                    if payload.get("name") != "exec_command":
                        continue
                    args = json.loads(payload.get("arguments", "{}"))
                    cmd = args.get("cmd", "")
                    workdir = args.get("workdir", "")

                    # 查找重定向写入
                    for match in redirect_re.finditer(cmd):
                        target = match.group(1)
                        # 解析相对路径
                        if not target.startswith('/'):
                            target = os.path.join(workdir or str(REPO), target)
                        target = os.path.normpath(target)
                        if not target.startswith(str(REPO)):
                            continue
                        info = file_ops[target]
                        info["sessions"].add(sid)
                        info["source"] = "codex"
                        info["writes"] += 1
                        info["write_snippets"].append((sid, cmd[:120].replace('\n', ' ')))
                except (json.JSONDecodeError, KeyError):
                    continue
    return file_ops


def classify(file_ops):
    tracked = get_tracked_files()
    status_map = get_git_status()

    results = {
        "lost": [],          # 真正丢失：从未提交，现在不存在
        "intentional_del": [],  # 有意删除：曾被 git 跟踪，工作区已删除（代码精简）
        "at_risk": [],       # 有未提交改动
        "safe": [],          # 已提交，无未提交改动
        "untracked": [],     # 存在但未跟踪
    }

    for fp, info in sorted(file_ops.items()):
        rel = os.path.relpath(fp, REPO)
        exists = os.path.exists(fp)
        is_tracked = rel in tracked
        wt_status = status_map.get(rel, "")

        if not exists:
            if is_tracked:
                # 曾被 git 跟踪但工作区已删除 → 有意删除（代码精简）
                results["intentional_del"].append((rel, info, wt_status))
            else:
                # 从未被 git 跟踪且不存在 → 真正丢失
                results["lost"].append((rel, info))
        elif is_tracked:
            if wt_status:
                results["at_risk"].append((rel, info, wt_status))
            else:
                results["safe"].append((rel, info))
        else:
            results["untracked"].append((rel, info))

    return results


def print_report(results, json_mode=False):
    if json_mode:
        out = {"lost": [], "intentional_del": [], "at_risk": []}
        for rel, info in results["lost"]:
            out["lost"].append({"path": rel, "writes": info["writes"], "edits": info["edits"],
                                "source": info.get("source", "?"), "snippets": info["write_snippets"][:3]})
        for rel, info, st in results["intentional_del"]:
            out["intentional_del"].append({"path": rel, "writes": info["writes"], "edits": info["edits"]})
        for rel, info, st in results["at_risk"]:
            out["at_risk"].append({"path": rel, "status": st, "writes": info["writes"], "edits": info["edits"]})
        print(json.dumps(out, indent=2, ensure_ascii=False))
        return

    # 真正丢失
    lost = results["lost"]
    print(f"\n{'='*60}")
    print(f"真正丢失（从未提交，现已不存在）：{len(lost)} 个")
    print(f"{'='*60}")
    for rel, info in lost:
        src = info.get("source", "?")
        print(f"  {rel}")
        print(f"    来源: {src}  Write: {info['writes']}  Edit: {info['edits']}  对话: {len(info['sessions'])}")
        for sid, snip in info["write_snippets"][:2]:
            print(f"    [{sid}] {snip[:100]}")

    # 有意删除
    intentional = results["intentional_del"]
    print(f"\n{'='*60}")
    print(f"有意删除（代码精简，git 可恢复）：{len(intentional)} 个")
    print(f"{'='*60}")
    for rel, info, st in intentional:
        print(f"  {rel}  (Write: {info['writes']}, Edit: {info['edits']})")

    # 有风险
    at_risk = results["at_risk"]
    print(f"\n{'='*60}")
    print(f"有风险（未提交改动）：{len(at_risk)} 个")
    print(f"{'='*60}")
    for rel, info, st in at_risk:
        print(f"  [{st}] {rel}  (Edit: {info['edits']}, Write: {info['writes']})")

    # 安全 + 编辑可能被覆盖
    safe_edited = [(rel, info) for rel, info in results["safe"] if info["edits"] > 0 or info["writes"] > 0]
    print(f"\n{'='*60}")
    print(f"已提交安全：{len(results['safe'])} 个  |  未跟踪存在：{len(results['untracked'])} 个")
    print(f"其中已提交但有对话编辑的（编辑可能被覆盖）：{len(safe_edited)} 个")
    print(f"{'='*60}")
    for rel, info in safe_edited:
        src = info.get("source", "?")
        print(f"  {rel}  [{src}] (Edit: {info['edits']}, Write: {info['writes']})")
        for sid, old, new in info["edit_snippets"][-2:]:
            print(f"    [{sid}] ...{old[:50]}... → ...{new[:50]}...")


if __name__ == "__main__":
    json_mode = "--json" in sys.argv
    skip_codex = "--no-codex" in sys.argv

    ops = scan_claude_logs()

    if not skip_codex:
        codex_ops = scan_codex_logs()
        # 合并
        for fp, info in codex_ops.items():
            existing = ops[fp]
            existing["sessions"].update(info["sessions"])
            existing["writes"] += info["writes"]
            existing["edits"] += info["edits"]
            existing["write_snippets"].extend(info["write_snippets"])
            if "source" not in existing:
                existing["source"] = info.get("source", "codex")
            elif info.get("source") == "codex":
                existing["source"] = "claude+codex"

    results = classify(ops)
    print_report(results, json_mode=json_mode)
