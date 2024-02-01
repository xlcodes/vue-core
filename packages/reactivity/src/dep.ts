import type { ReactiveEffect } from './effect'
import type { ComputedRefImpl } from './computed'

export type Dep = Map<ReactiveEffect, number> & {
  cleanup: () => void
  computed?: ComputedRefImpl<any>
}

export const createDep = (
  cleanup: () => void, // 清除方法
  computed?: ComputedRefImpl<any>, // 计算属性
): Dep => {
  const dep = new Map() as Dep
  dep.cleanup = cleanup
  dep.computed = computed
  return dep
}
