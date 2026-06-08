/**
 * 等级系统 — 前端工具函数
 * 与后端 src/lib/level.ts 保持一致
 * CI 检查两份 LEVEL_THRESHOLDS 数组是否一致，防 drift
 */

export const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100]

export const LEVEL_NAMES = {
  1: 'Lv.1',
  2: 'Lv.2',
  3: 'Lv.3',
  4: 'Lv.4',
  5: 'Lv.5',
  6: 'Lv.6',
  7: 'Lv.7',
}

/**
 * 根据总经验计算等级
 */
export function calcLevel(totalExp) {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalExp >= LEVEL_THRESHOLDS[i]) return i + 1
  }
  return 1
}

/**
 * 获取当前等级进度
 */
export function calcLevelProgress(totalExp) {
  const level = calcLevel(totalExp)
  if (level >= 7) {
    return { current: totalExp - LEVEL_THRESHOLDS[6], needed: 0, progress: 1 }
  }
  const currentThreshold = LEVEL_THRESHOLDS[level - 1]
  const nextThreshold = LEVEL_THRESHOLDS[level]
  const current = totalExp - currentThreshold
  const needed = nextThreshold - currentThreshold
  return { current, needed, progress: current / needed }
}

/**
 * 签到倍率
 */
export function getCheckinMultiplier(level) {
  const multipliers = { 1: 1.0, 2: 1.1, 3: 1.2, 4: 1.3, 5: 1.5, 6: 1.8, 7: 2.0 }
  return multipliers[level] || 1.0
}

/**
 * 积分倍率
 */
export function getPointsMultiplier(level) {
  const multipliers = { 1: 1.0, 2: 1.05, 3: 1.15, 4: 1.15, 5: 1.20, 6: 1.30, 7: 1.50 }
  return multipliers[level] || 1.0
}

/**
 * 获取等级颜色（用于 UI 展示）
 */
export function getLevelColor(level) {
  const colors = {
    1: '#9CA3AF', // gray
    2: '#60A5FA', // blue
    3: '#34D399', // green
    4: '#FBBF24', // yellow
    5: '#F97316', // orange
    6: '#EC4899', // pink
    7: '#A855F7', // purple
  }
  return colors[level] || colors[1]
}
