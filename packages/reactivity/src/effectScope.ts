import type { ReactiveEffect } from './effect'
import { warn } from './warning'

let activeEffectScope: EffectScope | undefined

export class EffectScope {
  /**
   * 当前作用域是否处于激活状态
   * @internal
   */
  private _active = true
  /**
   * 记录作用域
   * @internal
   */
  effects: ReactiveEffect[] = []
  /**
   * 清除队列
   * @internal
   */
  cleanups: (() => void)[] = []

  /**
   * only assigned by undetached scope
   * 仅由未分离作用域分配
   * 未分离的作用域应当知道上一级的作用域
   * @internal
   */
  parent: EffectScope | undefined
  /**
   * record undetached scopes
   * 记录未分离的作用域
   * @internal
   */
  scopes: EffectScope[] | undefined
  /**
   * track a child scope's index in its parent's scopes array for optimized
   * removal
   * 跟踪子作用域在其父作用域数组中的索引，以优化删除
   * @internal
   */
  private index: number | undefined

  constructor(public detached = false) {
    // 实例话的时候，将当前激活的 effectScope 赋值给 this.parent，可能是用来记录？
    this.parent = activeEffectScope
    // 当前effectScope 为非独立状态且 activeEffectScope 存在
    if (!detached && activeEffectScope) {
      this.index =
        (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(
          this,
        ) - 1
    }
  }

  get active() {
    // 获取当前作用域的激活状态
    return this._active
  }

  run<T>(fn: () => T): T | undefined {
    // 只有被激活的作用域，run 方法的内部逻辑才会被执行
    if (this._active) {
      const currentEffectScope = activeEffectScope
      try {
        // TODO：🤔这里先存储老的 activeEffectScope，然后又把 this 赋值给 activeEffectScope，不知道是什么意思
        activeEffectScope = this
        // 将 fn 函数执行的结果返回
        return fn()
      } finally {
        // TODO: 最后又还原了 activeEffectScope 的引用
        activeEffectScope = currentEffectScope
      }
    } else if (__DEV__) {
      // 开发环境，_active 为 false，报警告
      warn(`cannot run an inactive effect scope.`)
    }
  }

  /**
   * This should only be called on non-detached scopes
   * on 方法应该在非分离作用域的时候调用
   * @internal
   */
  on() {
    activeEffectScope = this
  }

  /**
   * This should only be called on non-detached scopes
   * off 方法应该在分离作用域的时候调用
   * @internal
   */
  off() {
    activeEffectScope = this.parent
  }

  stop(fromParent?: boolean) {
    // 只有是激活状态的 effect 才会执行 stop 逻辑
    if (this._active) {
      let i, l
      // 循环清除内部的 effect 作用域
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].stop()
      }
      // 循环清除内部的 effect 作用域，也就是 onScopeDispose 注册的回调方法
      for (i = 0, l = this.cleanups.length; i < l; i++) {
        this.cleanups[i]()
      }
      // 如果有未分离的作用域，也依次调用这些作用域的 stop 方法
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].stop(true)
        }
      }
      // nested scope, dereference from parent to avoid memory leaks
      // 嵌套作用域，从父级解引用以避免内存泄漏
      if (!this.detached && this.parent && !fromParent) {
        // optimized O(1) removal
        const last = this.parent.scopes!.pop()
        if (last && last !== this) {
          this.parent.scopes![this.index!] = last
          last.index = this.index!
        }
      }
      // 当前作用域的父级 effectScope 置为 undefined
      this.parent = undefined
      // 将当前的激活状态设置为 false
      this._active = false
    }
  }
  // INFO: run 方法在开发环境报警告，这里为什么没报
  // 在这里，stop函数执行之后，说明当前依赖已经全部清空
  // 再次调用 stop 就相当于执行了一个空函数，报警告无意义，因此就没报警告
}

/**
 * Creates an effect scope object which can capture the reactive effects (i.e.
 * computed and watchers) created within it so that these effects can be
 * disposed together. For detailed use cases of this API, please consult its
 * corresponding {@link https://github.com/vuejs/rfcs/blob/master/active-rfcs/0041-reactivity-effect-scope.md | RFC}.
 * 创建一个效果作用域对象，它可以捕获在其中创建的反应效果(即计算和观察者)，以便这些效果可以一起处理
 * @param detached - Can be used to create a "detached" effect scope.
 * detached 参数可以用来创建一个独立的效果作用域。
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#effectscope}
 */
export function effectScope(detached?: boolean) {
  return new EffectScope(detached)
}

/**
 * 在指定的作用域中记录一个有效作用域（effect）
 * 即在指定的作用域的 effects 数组添加一个 effect
 * @param effect
 * @param scope
 */
export function recordEffectScope(
  effect: ReactiveEffect,
  scope: EffectScope | undefined = activeEffectScope,
) {
  if (scope && scope.active) {
    scope.effects.push(effect)
  }
}

/**
 * Returns the current active effect scope if there is one.
 * 返回当前有效的作用范围
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#getcurrentscope}
 */
export function getCurrentScope() {
  return activeEffectScope
}

/**
 * Registers a dispose callback on the current active effect scope. The
 * callback will be invoked when the associated effect scope is stopped.
 * 在当前活动效果范围上注册处置回调
 * 当关联的效果范围停止时将调用回调。
 * @param fn - The callback function to attach to the scope's cleanup.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#onscopedispose}
 */
export function onScopeDispose(fn: () => void) {
  // 有激活的 effectScope 的时候，把 fn 放到清除队列
  if (activeEffectScope) {
    activeEffectScope.cleanups.push(fn)
  } else if (__DEV__) {
    // onScopeDispose() 在没有活动效果范围时被调用。
    warn(
      `onScopeDispose() is called when there is no active effect scope` +
        ` to be associated with.`,
    )
  }
}
