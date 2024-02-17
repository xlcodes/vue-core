import { type DebuggerOptions, ReactiveEffect, scheduleEffects } from './effect'
import { type Ref, trackRefValue, triggerRefValue } from './ref'
import { NOOP, hasChanged, isFunction } from '@vue/shared'
import { toRaw } from './reactive'
import type { Dep } from './dep'
import { DirtyLevels, ReactiveFlags } from './constants'

declare const ComputedRefSymbol: unique symbol

export interface ComputedRef<T = any> extends WritableComputedRef<T> {
  readonly value: T
  [ComputedRefSymbol]: true
}

export interface WritableComputedRef<T> extends Ref<T> {
  readonly effect: ReactiveEffect<T>
}

export type ComputedGetter<T> = (oldValue?: T) => T
export type ComputedSetter<T> = (newValue: T) => void

export interface WritableComputedOptions<T> {
  get: ComputedGetter<T>
  set: ComputedSetter<T>
}

// 计算属性对象
export class ComputedRefImpl<T> {
  public dep?: Dep = undefined

  // 当前计算属性的值
  private _value!: T
  // 声明一个只读的 effect 作用域
  public readonly effect: ReactiveEffect<T>

  // 标记当前对象是 ref 类型
  public readonly __v_isRef = true
  //
  /**
   * 当前计算属性是否是可读的
   * @example
   * const doubleCount = computed(() => {})，此时 doubleCount 就是只读的
   */
  public readonly [ReactiveFlags.IS_READONLY]: boolean = false

  // 当前值是否使用缓存数据，不使用缓存数据的话就需要重新执行 getter 方法
  public _cacheable: boolean

  constructor(
    getter: ComputedGetter<T>,
    private readonly _setter: ComputedSetter<T>,
    isReadonly: boolean,
    isSSR: boolean,
  ) {
    // 创建一个响应式
    this.effect = new ReactiveEffect(
      () => getter(this._value),
      () => triggerRefValue(this, DirtyLevels.MaybeDirty),
      () => this.dep && scheduleEffects(this.dep),
    )
    // effect 作用域绑定当前计算属性
    this.effect.computed = this
    // 初始化肯定不能走缓存，需要重新计算
    this.effect.active = this._cacheable = !isSSR
    // 当前计算属性的可读性
    this[ReactiveFlags.IS_READONLY] = isReadonly
  }

  get value() {
    // the computed ref may get wrapped by other proxies e.g. readonly() #3376
    // 将当前计算属性的实例转为普通对象
    const self = toRaw(this)
    // 当前计算属性不存在缓存数据 或者 作用域被污染了需要重新计算
    if (!self._cacheable || self.effect.dirty) {
      // 判断当前值是否改变了
      // TODO: 看完 ref 再回来看
      if (hasChanged(self._value, (self._value = self.effect.run()!))) {
        triggerRefValue(self, DirtyLevels.Dirty)
      }
    }
    trackRefValue(self)
    if (self.effect._dirtyLevel >= DirtyLevels.MaybeDirty) {
      triggerRefValue(self, DirtyLevels.MaybeDirty)
    }
    return self._value
  }

  set value(newValue: T) {
    // 设置函数直接使用实例化传递的值，如果用户没传的化，set 函数就是一个空函数 () => {}
    this._setter(newValue)
  }

  // #region polyfill _dirty for backward compatibility third party code for Vue <= 3.3.x
  // ISSUE：缓存造成污染的数据？？？
  get _dirty() {
    return this.effect.dirty
  }

  set _dirty(v) {
    this.effect.dirty = v
  }
  // #endregion
}

/**
 * Takes a getter function and returns a readonly reactive ref object for the
 * returned value from the getter. It can also take an object with get and set
 * functions to create a writable ref object.
 *
 * @example
 * ```js
 * // Creating a readonly computed ref:
 * const count = ref(1)
 * const plusOne = computed(() => count.value + 1)
 *
 * console.log(plusOne.value) // 2
 * plusOne.value++ // error
 * ```
 *
 * ```js
 * // Creating a writable computed ref:
 * const count = ref(1)
 * const plusOne = computed({
 *   get: () => count.value + 1,
 *   set: (val) => {
 *     count.value = val - 1
 *   }
 * })
 *
 * plusOne.value = 1
 * console.log(count.value) // 0
 * ```
 *
 * @param getter - Function that produces the next value.
 * @param debugOptions - For debugging. See {@link https://vuejs.org/guide/extras/reactivity-in-depth.html#computed-debugging}.
 * @see {@link https://vuejs.org/api/reactivity-core.html#computed}
 */
export function computed<T>(
  getter: ComputedGetter<T>,
  debugOptions?: DebuggerOptions,
): ComputedRef<T>
export function computed<T>(
  options: WritableComputedOptions<T>,
  debugOptions?: DebuggerOptions,
): WritableComputedRef<T>
export function computed<T>(
  getterOrOptions: ComputedGetter<T> | WritableComputedOptions<T>,
  debugOptions?: DebuggerOptions,
  isSSR = false,
) {
  let getter: ComputedGetter<T>
  let setter: ComputedSetter<T>

  // 只传递了 getter 方法
  const onlyGetter = isFunction(getterOrOptions)
  if (onlyGetter) {
    getter = getterOrOptions
    // 此时的 setter 方法，开发环境报警告，正式环境就会创建一个空函数，计算属性的 setter 就不会生效
    setter = __DEV__
      ? () => {
          console.warn('Write operation failed: computed value is readonly')
        }
      : NOOP
  } else {
    // 将用户传递的 getter 方法和 setter 方法传递存储起来
    getter = getterOrOptions.get
    setter = getterOrOptions.set
  }

  // 判断当前计算属性是否是可读的，得看 !setter 是否为 false
  // setter 转换为布尔值的时候，有可能是用户没传，也有可能用户传递了一个空值
  const cRef = new ComputedRefImpl(getter, setter, onlyGetter || !setter, isSSR)

  // 开发环境、用户传递了调试函数且当前环境不是 SSR 环境的时候，给 effect 作用域添加调试函数，以便用户调试计算属性
  if (__DEV__ && debugOptions && !isSSR) {
    cRef.effect.onTrack = debugOptions.onTrack
    cRef.effect.onTrigger = debugOptions.onTrigger
  }

  return cRef as any
}
