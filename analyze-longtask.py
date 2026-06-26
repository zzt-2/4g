#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
扒出指定 Long Task 时间窗内的全部事件树,看 600ms 到底在跑什么。

用法:
    python analyze-longtask.py <trace.json> --task-index 0
    python analyze-longtask.py <trace.json> --ts 543710220000 --window 620000
"""

import argparse
import json
import sys
from collections import defaultdict, Counter


def load(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    events = data if isinstance(data, list) else data.get("traceEvents", data)
    return events


def find_main_thread(events):
    """找主线程 key + 主线程上所有 RunTask/Task。"""
    thread_names = {}
    thread_counts = defaultdict(int)
    for e in events:
        if e.get("ph") == "M" and e.get("name") == "thread_name":
            thread_names[(e.get("pid"), e.get("tid"))] = e.get("args", {}).get("name", "")
        if e.get("ph") == "X" and e.get("name") in ("Task", "RunTask"):
            thread_counts[(e.get("pid"), e.get("tid"))] += 1
    # 主线程 = 含 CrRendererMain 名 + RunTask 最多的
    candidates = []
    for key, cnt in thread_counts.items():
        name = thread_names.get(key, "")
        # 必须精确匹配 CrRendererMain(GPU/IO/Compositor 都含 main 但不是渲染主线程)
        if name == "CrRendererMain":
            candidates.append((key, cnt, name))
    if not candidates:
        # 退路: 名字含 renderer 但不含 gpu/compositor/io
        for key, cnt in thread_counts.items():
            name = thread_names.get(key, "")
            nl = name.lower()
            if "renderer" in nl and "gpu" not in nl and "compositor" not in nl and nl != "compositor":
                candidates.append((key, cnt, name))
    if not candidates:
        candidates = [(k, c, thread_names.get(k, "")) for k, c in thread_counts.items()]
    candidates.sort(key=lambda x: -x[1])
    return candidates[0]


def find_long_tasks(events, main_key, threshold=50000):
    tasks = []
    for e in events:
        if (e.get("pid"), e.get("tid")) != main_key:
            continue
        if e.get("ph") != "X" or e.get("name") not in ("Task", "RunTask"):
            continue
        if e.get("dur", 0) >= threshold:
            tasks.append(e)
    tasks.sort(key=lambda x: -x["dur"])
    return tasks


def dump_task_tree(events, main_key, task_start, task_dur, max_depth=6, top_n=80):
    """打印落在 [start, start+dur) 内的所有事件,按层级缩进。"""
    task_end = task_start + task_dur
    # 只看主线程上的完整事件 (X) 和嵌套关系。Chromium trace 不显式给 parent,
    # 但事件按 ts 排序 + 同线程嵌套,用栈模拟。
    inner = []
    for e in events:
        if (e.get("pid"), e.get("tid")) != main_key:
            continue
        if e.get("ph") != "X":
            continue
        ts = e.get("ts", 0)
        if ts < task_start or ts >= task_end:
            continue
        if e.get("name") in ("Task", "RunTask") and ts == task_start:
            continue  # 跳过自己
        inner.append(e)
    inner.sort(key=lambda x: x.get("ts", 0))

    # 按耗时降序,只看 top N
    inner.sort(key=lambda x: -x.get("dur", 0))
    print(f"\n=== 时间窗 [{task_start}, {task_end}) 内 top {min(top_n, len(inner))} 事件(按耗时降序) ===")
    print(f"{'耗时':>10} | {'cat':<45} | {'name':<35} | 详情")
    print("-" * 140)
    for e in inner[:top_n]:
        dur = e.get("dur", 0)
        cat = (e.get("cat") or "")[:45]
        name = e.get("name", "")[:35]
        data = e.get("args", {}).get("data", {})
        # 关键详情
        detail_parts = []
        if "functionName" in data:
            detail_parts.append(f"fn={data['functionName']}")
        if "url" in data:
            url = data["url"]
            if "/" in url:
                url = url.split("/")[-1]
            detail_parts.append(f"url={url}")
        if "timerId" in data:
            detail_parts.append(f"timerId={data['timerId']}")
        if "stackTrace" in data and data["stackTrace"]:
            frames = [f.get("functionName", "?") for f in data["stackTrace"][:4]]
            detail_parts.append(f"stack={' < '.join(frames)}")
        if "type" in data:
            detail_parts.append(f"type={data['type']}")
        detail = " ".join(detail_parts)[:80]
        print(f"{dur/1000:>9.2f}ms | {cat:<45} | {name:<35} | {detail}")


def cat_breakdown(events, main_key, task_start, task_dur):
    task_end = task_start + task_dur
    cat_time = defaultdict(int)
    name_time = defaultdict(int)
    for e in events:
        if (e.get("pid"), e.get("tid")) != main_key:
            continue
        if e.get("ph") != "X":
            continue
        ts = e.get("ts", 0)
        if ts < task_start or ts >= task_end:
            continue
        if e.get("name") in ("Task", "RunTask") and ts == task_start:
            continue
        d = e.get("dur", 0)
        cat_time[(e.get("cat") or "").split(",")[0]] += d
        name_time[e.get("name", "")] += d
    print(f"\n=== 时间窗内 cat 分布 ===")
    for cat, t in sorted(cat_time.items(), key=lambda x: -x[1])[:10]:
        print(f"  {cat:<50} {t/1000:>10.2f}ms  ({t/task_dur*100:>5.1f}%)")
    print(f"\n=== 时间窗内 name 分布(top 15) ===")
    for name, t in sorted(name_time.items(), key=lambda x: -x[1])[:15]:
        print(f"  {name:<50} {t/1000:>10.2f}ms  ({t/task_dur*100:>5.1f}%)")


def find_console_events(events, main_key, span_start, span_end):
    """找 console.warn/error 调用、以及 inspector 相关事件。"""
    print(f"\n=== 录制全程 console / inspector 事件统计 ===")
    cat_counts = defaultdict(int)
    cat_dur = defaultdict(int)
    console_events = []
    for e in events:
        if e.get("ph") != "X":
            continue
        name = e.get("name", "")
        cat = (e.get("cat") or "")
        data = e.get("args", {}).get("data", {})
        # console call 通常是 v8.execute 下 functionName 含 console / warn / log
        fn = data.get("functionName", "")
        if name == "consoleCall" or "console" in fn.lower() or "consoleCall" in name.lower():
            console_events.append(e)
        # disabled-by-default-v8.inspector 相关
        if "inspector" in cat.lower() or "inspector" in name.lower():
            cat_counts["inspector"] += 1
            cat_dur["inspector"] += e.get("dur", 0)
    print(f"  consoleCall 事件总数: {len(console_events)}")
    if console_events:
        # 按帧的 functionName / URL 归类
        fn_counter = Counter()
        for e in console_events:
            data = e.get("args", {}).get("data", {})
            fn = data.get("functionName", "?")
            url = data.get("url", "")
            url_short = url.split("/")[-1] if "/" in url else url
            fn_counter[f"{fn} @ {url_short}"] += 1
        print(f"  consoleCall 归类:")
        for k, c in fn_counter.most_common(15):
            print(f"    {c:>5}x  {k}")
    print(f"  inspector 相关事件数: {cat_counts['inspector']}, 累计耗时: {cat_dur['inspector']/1000:.1f}ms")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("trace")
    ap.add_argument("--task-index", type=int, default=0, help="第 N 长 Long Task(0=最长)")
    ap.add_argument("--ts", type=int, default=None, help="直接指定起始 ts(μs)")
    ap.add_argument("--window", type=int, default=620000, help="窗口大小 μs")
    ap.add_argument("--threshold", type=int, default=50000, help="Long Task 阈值 μs")
    args = ap.parse_args()

    events = load(args.trace)
    print(f"[load] {len(events)} 条事件", file=sys.stderr)

    (main_key, main_cnt, main_name) = find_main_thread(events)
    print(f"[main] {main_key} = {main_name} ({main_cnt} RunTask)")

    if args.ts is not None:
        task_start, task_dur = args.ts, args.window
    else:
        tasks = find_long_tasks(events, main_key, args.threshold)
        print(f"[longtask] 共 {len(tasks)} 个 >{args.threshold/1000}ms 长任务")
        if args.task_index >= len(tasks):
            print(f"[error] task-index {args.task_index} 越界", file=sys.stderr)
            sys.exit(1)
        t = tasks[args.task_index]
        task_start, task_dur = t["ts"], t["dur"]

    print(f"\n{'='*80}")
    print(f"目标时间窗: ts={task_start}, dur={task_dur/1000:.2f}ms")
    print(f"{'='*80}")

    cat_breakdown(events, main_key, task_start, task_dur)
    dump_task_tree(events, main_key, task_start, task_dur)
    find_console_events(events, main_key, task_start, task_dur)


if __name__ == "__main__":
    main()
