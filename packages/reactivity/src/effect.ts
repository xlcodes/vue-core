import { NOOP, extend } from '@vue/shared'
import type { ComputedRefImpl } from './computed'
import {
  DirtyLevels,
  type TrackOpTypes,
  type TriggerOpTypes,
} from './constants'
import type { Dep } from './dep'
import { type EffectScope, recordEffectScope } from './effectScope'

export type EffectScheduler = (...args: any[]) => any

export type DebuggerEvent = {
  effect: ReactiveEffect
} & DebuggerEventExtraInfo

export type DebuggerEventExtraInfo = {
  target: object
  type: TrackOpTypes | TriggerOpTypes
  key: any
  newValue?: any
  oldValue?: any
  oldTarget?: Map<any, any> | Set<any>
}

export let activeEffect: ReactiveEffect | undefined

export class ReactiveEffect<T = any> {
  active = true
  deps: Dep[] = []

  /**
   * Can be attached after creation
   * @internal
   */
  computed?: ComputedRefImpl<T>
  /**
   * @internal
   */
  allowRecurse?: boolean

  onStop?: () => void
  // dev only
  onTrack?: (event: DebuggerEvent) => void
  // dev only
  onTrigger?: (event: DebuggerEvent) => void

  /**
   * 当前值污染等级
   * @internal
   */
  _dirtyLevel = DirtyLevels.Dirty
  /**
   * @internal
   */
  _trackId = 0
  /**
   * @internal
   */
  _runnings = 0
  /**
   * @internal
   */
  _shouldSchedule = false
  /**
   * @internal
   */
  _depsLength = 0

  constructor(
    public fn: () => T, // 副作用函数
    public trigger: () => void, // 标志位，用于标识当前 ReactiveEffect 对象是否处于活动状态
    public scheduler?: EffectScheduler, // 调度器，用于控制副作用函数何时执行
    scope?: EffectScope,
  ) {
    // 记录当前 ReactiveEffect 对象的作用域
    recordEffectScope(this, scope)
  }

  public get dirty() {
    if (this._dirtyLevel === DirtyLevels.MaybeDirty) {
      pauseTracking()
      for (let i = 0; i < this._depsLength; i++) {
        const dep = this.deps[i]
        if (dep.computed) {
          triggerComputed(dep.computed)
          if (this._dirtyLevel >= DirtyLevels.Dirty) {
            break
          }
        }
      }
      if (this._dirtyLevel < DirtyLevels.Dirty) {
        this._dirtyLevel = DirtyLevels.NotDirty
      }
      resetTracking()
    }
    return this._dirtyLevel >= DirtyLevels.Dirty
  }

  public set dirty(v) {
    this._dirtyLevel = v ? DirtyLevels.Dirty : DirtyLevels.NotDirty
  }

  run() {
    this._dirtyLevel = DirtyLevels.NotDirty
    // 如果当前 ReactiveEffect 对象不处于活动状态，直接返回 fn 的执行结果
    if (!this.active) {
      return this.fn()
    }
    let lastShouldTrack = shouldTrack
    // 寻找当前 ReactiveEffect 对象的最顶层的父级作用域
    let lastEffect = activeEffect
    try {
      // 将 shouldTrack 设置为 true （表示是否需要收集依赖）
      shouldTrack = true
      // 将当前活动的 ReactiveEffect 对象设置为 “自己”
      activeEffect = this
      this._runnings++
      preCleanupEffect(this)
      return this.fn()
    } finally {
      postCleanupEffect(this)
      this._runnings--
      activeEffect = lastEffect
      shouldTrack = lastShouldTrack
    }
  }

  stop() {
    // 如果当前 ReactiveEffect 对象处于活动状态
    if (this.active) {
      preCleanupEffect(this)
      postCleanupEffect(this)
      // 如果有 onStop 回调函数，就执行
      this.onStop?.()
      // 将 active 设置为 false
      this.active = false
    }
  }
}

/**
 * 触发计算拿到计算属性的值
 * @param computed
 */
function triggerComputed(computed: ComputedRefImpl<any>) {
  return computed.value
}

function preCleanupEffect(effect: ReactiveEffect) {
  effect._trackId++
  effect._depsLength = 0
}

function postCleanupEffect(effect: ReactiveEffect) {
  if (effect.deps && effect.deps.length > effect._depsLength) {
    for (let i = effect._depsLength; i < effect.deps.length; i++) {
      cleanupDepEffect(effect.deps[i], effect)
    }
    effect.deps.length = effect._depsLength
  }
}

/**
 * Dep => Map<ReactiveEffect, number> & { cleanup: () => void computed?: ComputedRefImpl<any> }
 * @param dep
 * @param effect
 */
function cleanupDepEffect(dep: Dep, effect: ReactiveEffect) {
  const trackId = dep.get(effect)
  if (trackId !== undefined && effect._trackId !== trackId) {
    dep.delete(effect)
    if (dep.size === 0) {
      dep.cleanup()
    }
  }
}

export interface DebuggerOptions {
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
}

export interface ReactiveEffectOptions extends DebuggerOptions {
  lazy?: boolean
  scheduler?: EffectScheduler
  scope?: EffectScope
  allowRecurse?: boolean
  onStop?: () => void
}

export interface ReactiveEffectRunner<T = any> {
  (): T
  effect: ReactiveEffect
}

/**
 * Registers the given function to track reactive updates.
 *
 * The given function will be run once immediately. Every time any reactive
 * property that's accessed within it gets updated, the function will run again.
 *
 * @param fn - The function that will track reactive updates.
 * @param options - Allows to control the effect's behaviour.
 * @returns A runner that can be used to control the effect after creation.
 */
export function effect<T = any>(
  fn: () => T,
  options?: ReactiveEffectOptions,
): ReactiveEffectRunner {
  // 如果 fn 对象上有 effect 属性
  if ((fn as ReactiveEffectRunner).effect instanceof ReactiveEffect) {
    // 那么就将 fn 替换为 fn.effect.fn
    fn = (fn as ReactiveEffectRunner).effect.fn
  }

  // 创建一个响应式副作用函数
  const _effect = new ReactiveEffect(fn, NOOP, () => {
    // [0, 1, 2].includes(_effect.dirty)
    // 当 _effect 的值可能被污染了或者已经被污染了的时候，就调用 run 方法
    if (_effect.dirty) {
      _effect.run()
    }
  })
  if (options) {
    // 将传递的 options 与当前对象合并
    extend(_effect, options)
    // 如果配置项中有 scope 属性（该属性的作用是指定副作用函数的作用域）
    // 那么就将 scope 属性记录到响应式副作用函数上（类似一个作用域链）
    if (options.scope) recordEffectScope(_effect, options.scope)
  }
  // 如果没有配置项，或者配置项中没有 lazy 属性，或者配置项中的 lazy 属性为 false
  // 那么就直接执行 run 方法
  if (!options || !options.lazy) {
    _effect.run()
  }
  // 将 _effect.run 的 this 指向 _effect
  const runner = _effect.run.bind(_effect) as ReactiveEffectRunner
  // 将响应式副作用函数赋值给 runner.effect
  runner.effect = _effect
  // 返回 runner
  return runner
}

/**
 * Stops the effect associated with the given runner.
 * 将与 runner 有关联的 effect 全部停止
 * @param runner - Association with the effect to stop tracking.
 */
export function stop(runner: ReactiveEffectRunner) {
  runner.effect.stop()
}

export let shouldTrack = true
export let pauseScheduleStack = 0

const trackStack: boolean[] = []

/**
 * Temporarily pauses tracking.
 * 暂时暂停跟踪。
 */
export function pauseTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

/**
 * Re-enables effect tracking (if it was paused).
 */
export function enableTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = true
}

/**
 * 重置之前的全局效果跟踪状态
 */
export function resetTracking() {
  const last = trackStack.pop()
  shouldTrack = last === undefined ? true : last
}

/**
 * 调度器暂停
 */
export function pauseScheduling() {
  pauseScheduleStack++
}

/**
 * 递归重置调度器
 */
export function resetScheduling() {
  pauseScheduleStack--
  while (!pauseScheduleStack && queueEffectSchedulers.length) {
    // 依次将调度函数移出队列并执行
    queueEffectSchedulers.shift()!()
  }
}

export function trackEffect(
  effect: ReactiveEffect,
  dep: Dep,
  debuggerEventExtraInfo?: DebuggerEventExtraInfo, // 只有 __DEV__ 环境才会传递
) {
  if (dep.get(effect) !== effect._trackId) {
    dep.set(effect, effect._trackId)
    const oldDep = effect.deps[effect._depsLength]
    if (oldDep !== dep) {
      if (oldDep) {
        cleanupDepEffect(oldDep, effect)
      }
      effect.deps[effect._depsLength++] = dep
    } else {
      effect._depsLength++
    }
    // 在开发环境处理用户传递的 onTrack 函数
    if (__DEV__) {
      effect.onTrack?.(extend({ effect }, debuggerEventExtraInfo!))
    }
  }
}

const queueEffectSchedulers: EffectScheduler[] = []

export function triggerEffects(
  dep: Dep,
  dirtyLevel: DirtyLevels,
  debuggerEventExtraInfo?: DebuggerEventExtraInfo,
) {
  pauseScheduling()
  for (const effect of dep.keys()) {
    if (
      effect._dirtyLevel < dirtyLevel &&
      dep.get(effect) === effect._trackId
    ) {
      const lastDirtyLevel = effect._dirtyLevel
      effect._dirtyLevel = dirtyLevel
      if (lastDirtyLevel === DirtyLevels.NotDirty) {
        effect._shouldSchedule = true
        // 开发环境触发用户传递的 onTrigger 函数
        if (__DEV__) {
          effect.onTrigger?.(extend({ effect }, debuggerEventExtraInfo))
        }
        effect.trigger()
      }
    }
  }
  scheduleEffects(dep)
  resetScheduling()
}

/**
 * 调度处理 dep 依赖
 * @param dep
 */
export function scheduleEffects(dep: Dep) {
  for (const effect of dep.keys()) {
    if (
      effect.scheduler &&
      effect._shouldSchedule &&
      (!effect._runnings || effect.allowRecurse) &&
      dep.get(effect) === effect._trackId
    ) {
      effect._shouldSchedule = false
      queueEffectSchedulers.push(effect.scheduler)
    }
  }
}
