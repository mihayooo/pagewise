#!/usr/bin/env node

/**
 * R195: CoverageInfraRootFix — Coverage 目录清理脚本
 *
 * 安全地清理 coverage 目录下的临时文件，处理 root-owned 目录的 EACCES 问题。
 *
 * 根因: c8 运行时（尤其在 CI Docker 或 sudo 环境中）可能以 root 身份创建临时文件，
 * 导致后续以普通用户运行 rm -rf 时出现 Permission denied。
 *
 * 策略:
 *  1. 先尝试删除 c8 标准 tmpDir (coverage/tmp)
 *  2. 再尝试删除所有 coverage/_tmp_* 目录
 *  3. 对无法删除的目录记录警告（不中断流程）
 *  4. 退出码始终为 0（清理失败不应阻止覆盖率生成）
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const COVERAGE_DIR = path.join(ROOT, 'coverage')

/**
 * 递归删除目录，处理 EACCES 权限问题
 * @param {string} dirPath - 要删除的目录路径
 * @returns {{ success: boolean, error?: string }}
 */
export function safeRmdir(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true })
    return { success: true }
  } catch (err) {
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      // EACCES/EPERM: 权限不足（root-owned 目录）
      // 尝试 chmod 后再删
      try {
        execSync(`chmod -R u+w "${dirPath}" 2>/dev/null`)
        fs.rmSync(dirPath, { recursive: true, force: true })
        return { success: true }
      } catch {
        return { success: false, error: `Permission denied: ${dirPath} (owned by different user)` }
      }
    }
    return { success: false, error: `${err.code}: ${err.message}` }
  }
}

/**
 * 获取 coverage 目录下匹配 _tmp_* 模式的子目录列表
 * @param {string} coverageDir
 * @returns {string[]}
 */
export function findTmpDirs(coverageDir) {
  if (!fs.existsSync(coverageDir)) return []
  try {
    return fs.readdirSync(coverageDir)
      .filter(name => name.startsWith('_tmp_'))
      .map(name => path.join(coverageDir, name))
      .filter(p => {
        try { return fs.statSync(p).isDirectory() } catch { return false }
      })
  } catch {
    return []
  }
}

/**
 * 主清理逻辑
 */
export function cleanCoverage() {
  const results = { cleaned: [], skipped: [], errors: [] }

  // 1. 清理 c8 标准 tmpDir
  const tmpDir = path.join(COVERAGE_DIR, 'tmp')
  if (fs.existsSync(tmpDir)) {
    const result = safeRmdir(tmpDir)
    if (result.success) {
      results.cleaned.push(tmpDir)
    } else {
      results.skipped.push({ dir: tmpDir, reason: result.error })
    }
  }

  // 2. 清理 _tmp_* 残留目录
  const tmpDirs = findTmpDirs(COVERAGE_DIR)
  for (const dir of tmpDirs) {
    const result = safeRmdir(dir)
    if (result.success) {
      results.cleaned.push(dir)
    } else {
      results.skipped.push({ dir, reason: result.error })
    }
  }

  // 3. 重建 coverage/tmp 目录（c8 运行时需要）
  fs.mkdirSync(path.join(COVERAGE_DIR, 'tmp'), { recursive: true })

  return results
}

// 仅在直接运行时执行清理（非 import 时）
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const results = cleanCoverage()

  if (results.cleaned.length > 0) {
    console.log(`✓ Cleaned ${results.cleaned.length} coverage tmp dir(s)`)
  }

  if (results.skipped.length > 0) {
    console.warn(`⚠ Skipped ${results.skipped.length} dir(s) (permission denied):`)
    for (const { dir, reason } of results.skipped) {
      console.warn(`  - ${path.relative(ROOT, dir)}: ${reason}`)
    }
    console.warn('  Hint: Run "sudo rm -rf coverage/_tmp_*" to clean stale root-owned dirs')
  }

  if (results.cleaned.length === 0 && results.skipped.length === 0) {
    console.log('✓ Coverage directory already clean')
  }
}

// 始终退出 0 — 清理失败不应阻止覆盖率生成
process.exitCode = 0
