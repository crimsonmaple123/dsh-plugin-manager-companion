/**
 * 「链接式安装条目」的识别与删除（跨平台）。
 *
 * ## 为什么需要单独一层
 *
 * 官方安装通道把 `link:` / 路径依赖落成**链接**：POSIX 上是符号链接，Windows 上是
 * **junction**（目录联接）。两者在 Node 里的表现完全不同：
 *
 * | 判据 | 符号链接 | junction |
 * |---|---|---|
 * | `lstatSync().isSymbolicLink()` | `true` | **`false`**（它看起来就是个目录） |
 * | `readlinkSync()` | 目标路径 | 抛 `EINVAL` |
 * | `realpathSync()`（JS 实现） | 解析到目标 | **返回链接自身** |
 * | `realpathSync.native()` | 解析到目标 | 解析到目标 |
 * | 删除 | `unlinkSync` | `unlinkSync` 抛 `EPERM`；`rmdirSync` 可删（且不动目标内容） |
 *
 * 0.1.x 的代码一律只判 `isSymbolicLink()`，于是**在 Windows 上整类判断失效**：
 * 路径安装的残留看不见、清理动作一条也不动、诊断里"断链"永远是 0。这不是测试环境
 * 的怪癖，而是桌面版的默认形态（本机实测：`fs.symlinkSync(target, link, 'junction')`
 * 成功、`isSymbolicLink()` 为 false、`rmdirSync` 能删而目标内容完好）。
 *
 * ## 判据（保守：宁可少认，不可误删）
 *
 * 一个条目算「链接」当且仅当：
 *   · `lstatSync().isSymbolicLink()` 为真；或
 *   · Windows 上它是目录，且 `realpathSync.native()` 与 `realpathSync()` 给出**不同**结果
 *     （只有重解析点会这样；普通目录两者逐字相同）。
 *
 * 删除只走这两个分支，且**绝不递归**：符号链接用 `unlinkSync`，junction 用 `rmdirSync`
 * （空目录语义，删的是联接本身）。任何一步失败都如实抛给调用方，不吞。
 */

import { lstatSync, readlinkSync, realpathSync, rmdirSync, unlinkSync } from 'node:fs'

/** 一个条目的链接形态。 */
export type LinkKind = 'symlink' | 'junction'

/**
 * 判断条目是不是链接（符号链接或 Windows junction）。
 *
 * @param path - 绝对路径。
 * @returns 链接形态；不是链接（或不存在）时 undefined。
 */
export function linkKindOf(path: string): LinkKind | undefined {
  let stat
  try {
    stat = lstatSync(path)
  } catch {
    return undefined
  }
  if (stat.isSymbolicLink()) return 'symlink'
  if (process.platform !== 'win32' || !stat.isDirectory()) return undefined
  // junction 在 lstat 里是普通目录：只有 native realpath 会把重解析点展开。
  try {
    return realpathSync.native(path) === realpathSync(path) ? undefined : 'junction'
  } catch {
    // realpath 失败（目标已消失的 junction）：仍按目录处理，不猜。
    return undefined
  }
}

/**
 * 读链接指向的目标。
 *
 * @param path - 绝对路径。
 * @returns 目标原文；读不到时 undefined（断链的 junction 就属于这种）。
 */
export function linkTargetOf(path: string): string | undefined {
  try {
    return readlinkSync(path)
  } catch {
    // junction：readlink 不支持，退回 native realpath。
    try {
      return realpathSync.native(path)
    } catch {
      return undefined
    }
  }
}

/**
 * 删除一条链接（不递归、不碰目标内容）。
 *
 * @param path - 绝对路径。
 * @param kind - 已知的链接形态；省略时现判。
 * @returns 是否真的删掉了（不是链接时 false，调用方据此保持"只删链接"的纪律）。
 * @throws 删除失败时原样抛出（调用方逐条记账）。
 */
export function removeLink(path: string, kind: LinkKind | undefined = linkKindOf(path)): boolean {
  if (kind === undefined) return false
  if (kind === 'symlink') unlinkSync(path)
  else rmdirSync(path)
  return true
}
