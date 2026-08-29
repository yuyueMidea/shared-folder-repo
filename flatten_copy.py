#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
递归复制并扁平化文件夹

功能：
1. 递归扫描源文件夹中的所有文件（支持任意多层子目录）。
2. 将所有文件复制到目标文件夹的同一层。
3. 不修改、不移动、不删除源文件。
4. 如果出现同名文件，自动重命名，避免覆盖：
   example.txt
   example_1.txt
   example_2.txt
   ...
5. 使用 shutil.copy2()，尽量保留文件的修改时间等元数据。

用法：
    python flatten_copy.py "D:\\source" "D:\\target"

也可以直接运行脚本，然后按提示输入源目录和目标目录。
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


def get_unique_target_path(target_dir: Path, filename: str) -> Path:
    """
    在目标目录中生成一个不重复的文件路径。

    例如：
        report.pdf
        report_1.pdf
        report_2.pdf
    """
    candidate = target_dir / filename

    if not candidate.exists():
        return candidate

    source_name = Path(filename)
    stem = source_name.stem
    suffix = source_name.suffix

    index = 1
    while True:
        candidate = target_dir / f"{stem}_{index}{suffix}"
        if not candidate.exists():
            return candidate
        index += 1


def is_inside(child: Path, parent: Path) -> bool:
    """判断 child 是否位于 parent 内部（或与 parent 相同）。"""
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def flatten_copy(source_dir: Path, target_dir: Path) -> tuple[int, int]:
    """
    将 source_dir 下的全部文件递归复制到 target_dir 根目录。

    返回：
        (复制成功数量, 失败数量)
    """
    source_dir = source_dir.expanduser().resolve()
    target_dir = target_dir.expanduser().resolve()

    if not source_dir.exists():
        raise FileNotFoundError(f"源文件夹不存在：{source_dir}")

    if not source_dir.is_dir():
        raise NotADirectoryError(f"源路径不是文件夹：{source_dir}")

    if source_dir == target_dir:
        raise ValueError("源文件夹和目标文件夹不能是同一个目录。")

    # 先创建目标目录。
    target_dir.mkdir(parents=True, exist_ok=True)

    # 如果目标目录位于源目录里面，需要避免把刚复制进去的文件再次扫描，
    # 否则可能出现重复复制甚至无限扩张。
    target_inside_source = is_inside(target_dir, source_dir)

    copied_count = 0
    failed_count = 0

    print(f"源目录：{source_dir}")
    print(f"目标目录：{target_dir}")
    print("-" * 70)

    # 使用 rglob("*") 递归遍历所有层级。
    for source_file in source_dir.rglob("*"):
        if not source_file.is_file():
            continue

        # 目标目录如果位于源目录内部，则跳过目标目录自身的内容。
        if target_inside_source and is_inside(source_file, target_dir):
            continue

        target_file = get_unique_target_path(target_dir, source_file.name)

        try:
            shutil.copy2(source_file, target_file)
            copied_count += 1

            if target_file.name == source_file.name:
                print(f"[复制] {source_file} -> {target_file.name}")
            else:
                print(
                    f"[重名改名] {source_file} -> {target_file.name}"
                )

        except (OSError, shutil.Error) as exc:
            failed_count += 1
            print(f"[失败] {source_file}")
            print(f"       原因：{exc}", file=sys.stderr)

    print("-" * 70)
    print(f"处理完成：成功复制 {copied_count} 个文件，失败 {failed_count} 个文件。")

    return copied_count, failed_count


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="递归复制源目录中的全部文件，并扁平化到目标目录。"
    )
    parser.add_argument(
        "source",
        nargs="?",
        help="源文件夹路径",
    )
    parser.add_argument(
        "target",
        nargs="?",
        help="目标文件夹路径",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    source = args.source
    target = args.target

    # 如果没有通过命令行传参，则进入交互输入模式。
    if not source:
        source = input("请输入源文件夹路径：").strip().strip('"')

    if not target:
        target = input("请输入目标文件夹路径：").strip().strip('"')

    if not source or not target:
        print("错误：源文件夹和目标文件夹都不能为空。", file=sys.stderr)
        return 1

    try:
        _, failed_count = flatten_copy(Path(source), Path(target))
        return 0 if failed_count == 0 else 2

    except (FileNotFoundError, NotADirectoryError, ValueError, OSError) as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
