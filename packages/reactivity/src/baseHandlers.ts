import {
  type Target,
  isReadonly,
  isShallow,
  reactive,
  reactiveMap,
  readonly,
  readonlyMap,
  shallowReactiveMap,
  shallowReadonlyMap,
  toRaw,
} from './reactive'
import { ReactiveFlags, TrackOpTypes, TriggerOpTypes } from './constants'
import {
  pauseScheduling,
  pauseTracking,
  resetScheduling,
  resetTracking,
} from './effect'
import { ITERATE_KEY, track, trigger } from './reactiveEffect'
import {
  hasChanged,
  hasOwn,
  isArray,
  isIntegerKey,
  isObject,
  isSymbol,
  makeMap,
} from '@vue/shared'
import { isRef } from './ref'
import { warn } from './warning'

/**
 * 不需要追踪的属性
 * 内置标识符号不需要响应式处理，因为一般标记之后就不会变化了
 * @description 相当于做了如下处理
 * const set = new Set(`__proto__,__v_isRef,__isVue`.split(','));
 * set => Set(3) {'__proto__', '__v_isRef', '__isVue'}
 * return value => set.has(value)
 */
const isNonTrackableKeys = /*#__PURE__*/ makeMap(`__proto__,__v_isRef,__isVue`)

/**
 * 内置的 Symbol
 * @description 相当于创建了一个包含如下内容的 Set 对象
 * Symbol(Symbol.asyncIterator)
 * Symbol(Symbol.hasInstance)
 * Symbol(Symbol.isConcatSpreadable)
 * Symbol(Symbol.iterator)
 * Symbol(Symbol.match)
 * Symbol(Symbol.matchAll)
 * Symbol(Symbol.replace)
 * Symbol(Symbol.search)
 * Symbol(Symbol.species)
 * Symbol(Symbol.split)
 * Symbol(Symbol.toPrimitive)
 * Symbol(Symbol.toStringTag)
 * Symbol(Symbol.unscopables)
 */
const builtInSymbols = new Set(
  /*#__PURE__*/
  Object.getOwnPropertyNames(Symbol)
    // ios10.x Object.getOwnPropertyNames(Symbol) can enumerate 'arguments' and 'caller'
    // but accessing them on Symbol leads to TypeError because Symbol is a strict mode
    // function
    // ios10.x Object.getOwnPropertyNames(Symbol)可以枚举 'arguments' 和 'caller'
    // 但在Symbol上访问它们会导致TypeError，因为Symbol是严格模式函数
    .filter(key => key !== 'arguments' && key !== 'caller')
    .map(key => (Symbol as any)[key])
    .filter(isSymbol),
)

const arrayInstrumentations = /*#__PURE__*/ createArrayInstrumentations()

/**
 * 处理数组的方法
 * @description
 * INFO：个人猜想
 * Object.defineProperty() 无法监听到数组的变化，
 * 因此在框架内部对数组的变更方法进行了包裹，以达到监听数据变化的目的
 */
function createArrayInstrumentations() {
  // 数组方法依赖收集
  // 这种处理是为了兼容 Object.defineProperty() 针对数组无法处理的情况
  // 将数组中的原始方法收集起来，以便数组方法同样也可以触发依赖收集
  // ES6 中的 Proxy 则不存在这种问题
  const instrumentations: Record<string, Function> = {}
  // instrument identity-sensitive Array methods to account for possible reactive
  // values
  ;(['includes', 'indexOf', 'lastIndexOf'] as const).forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = toRaw(this) as any
      for (let i = 0, l = this.length; i < l; i++) {
        track(arr, TrackOpTypes.GET, i + '')
      }
      // we run the method using the original args first (which may be reactive)
      // 我们首先使用原始参数运行该方法(可能是响应式的)
      const res = arr[key](...args)
      if (res === -1 || res === false) {
        // if that didn't work, run it again using raw values.
        // 如果不能正常工作，则使用原始值再次运行
        return arr[key](...args.map(toRaw))
      } else {
        return res
      }
    }
  })
  // instrument length-altering mutation methods to avoid length being tracked
  // which leads to infinite loops in some cases (#2137)
  // 这些方法会改变数组长度，避免数组长度被追踪，以避免某些情况下出现无限循环(#2137)
  ;(['push', 'pop', 'shift', 'unshift', 'splice'] as const).forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      pauseTracking()
      pauseScheduling()
      const res = (toRaw(this) as any)[key].apply(this, args)
      resetScheduling()
      resetTracking()
      return res
    }
  })
  return instrumentations
}

function hasOwnProperty(this: object, key: string) {
  // 将 this 转换为原始对象
  const obj = toRaw(this)
  track(obj, TrackOpTypes.HAS, key)
  return obj.hasOwnProperty(key)
}

class BaseReactiveHandler implements ProxyHandler<Target> {
  constructor(
    protected readonly _isReadonly = false,
    protected readonly _shallow = false,
  ) {}

  get(target: Target, key: string | symbol, receiver: object) {
    const isReadonly = this._isReadonly,
      shallow = this._shallow
    if (key === ReactiveFlags.IS_REACTIVE) {
      // 如果访问的是 __v_isReactive 属性，那么返回 isReadonly 的取反值
      return !isReadonly
    } else if (key === ReactiveFlags.IS_READONLY) {
      //  // 如果访问的是 __v_isReadonly 属性，那么返回 isReadonly 的值
      return isReadonly
    } else if (key === ReactiveFlags.IS_SHALLOW) {
      // 如果访问的是 __v_isShallow 属性，那么返回 shallow 的值
      return shallow
    } else if (key === ReactiveFlags.RAW) {
      // 如果访问的是 __v_raw 属性，并且有一堆条件满足，那么返回 target
      if (
        receiver ===
          (isReadonly
            ? shallow
              ? shallowReadonlyMap
              : readonlyMap
            : shallow
              ? shallowReactiveMap
              : reactiveMap
          ).get(target) ||
        // receiver is not the reactive proxy, but has the same prototype
        // this means the reciever is a user proxy of the reactive proxy
        Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)
      ) {
        return target
      }
      // early return undefined
      return
    }

    // target 是否是数组
    const targetIsArray = isArray(target)

    // 如果不是只读的
    if (!isReadonly) {
      // 如果是数组，并且访问的是数组的一些方法，那么返回对应的方法
      if (targetIsArray && hasOwn(arrayInstrumentations, key)) {
        return Reflect.get(arrayInstrumentations, key, receiver)
      }
      // 如果访问的是 hasOwnProperty 方法，那么返回 hasOwnProperty 方法
      if (key === 'hasOwnProperty') {
        return hasOwnProperty
      }
    }

    // 获取 target 的 key 属性值
    const res = Reflect.get(target, key, receiver)

    // 如果是内置的 Symbol，或者是不可追踪的 key，那么直接返回 res
    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      return res
    }

    // 如果不是只读的，那么进行依赖收集
    if (!isReadonly) {
      track(target, TrackOpTypes.GET, key)
    }

    // 如果是浅的，那么直接返回 res
    if (shallow) {
      return res
    }

    // 如果 res 是 ref，对返回的值进行解包
    if (isRef(res)) {
      // 对于数组和整数类型的 key，不进行解包
      return targetIsArray && isIntegerKey(key) ? res : res.value
    }

    // 如果 res 是对象，递归代理
    if (isObject(res)) {
      // 将返回的值也转换为代理。我们在这里进行 isObject 检查，以避免无效的值警告。
      // 还需要延迟访问 readonly 和 reactive，以避免循环依赖。
      return isReadonly ? readonly(res) : reactive(res)
    }

    return res
  }
}

class MutableReactiveHandler extends BaseReactiveHandler {
  constructor(shallow = false) {
    super(false, shallow)
  }

  /**
   * 闭包返回一个 set 方法
   */
  set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: object,
  ): boolean {
    // 获取旧的值
    let oldValue = (target as any)[key]
    if (!this._shallow) {
      const isOldValueReadonly = isReadonly(oldValue)
      if (!isShallow(value) && !isReadonly(value)) {
        oldValue = toRaw(oldValue)
        value = toRaw(value)
      }
      if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
        if (isOldValueReadonly) {
          return false
        } else {
          oldValue.value = value
          return true
        }
      }
    } else {
      // in shallow mode, objects are set as-is regardless of reactive or not
    }

    const hadKey =
      isArray(target) && isIntegerKey(key)
        ? Number(key) < target.length
        : hasOwn(target, key)
    const result = Reflect.set(target, key, value, receiver)
    // don't trigger if target is something up in the prototype chain of original
    if (target === toRaw(receiver)) {
      if (!hadKey) {
        trigger(target, TriggerOpTypes.ADD, key, value)
      } else if (hasChanged(value, oldValue)) {
        trigger(target, TriggerOpTypes.SET, key, value, oldValue)
      }
    }
    return result
  }

  deleteProperty(target: object, key: string | symbol): boolean {
    const hadKey = hasOwn(target, key)
    const oldValue = (target as any)[key]
    const result = Reflect.deleteProperty(target, key)
    if (result && hadKey) {
      trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
    }
    return result
  }

  has(target: object, key: string | symbol): boolean {
    const result = Reflect.has(target, key)
    if (!isSymbol(key) || !builtInSymbols.has(key)) {
      track(target, TrackOpTypes.HAS, key)
    }
    return result
  }

  ownKeys(target: object): (string | symbol)[] {
    track(
      target,
      TrackOpTypes.ITERATE,
      isArray(target) ? 'length' : ITERATE_KEY,
    )
    return Reflect.ownKeys(target)
  }
}

/**
 * 只读的 reactive 处理函数
 * set 和 delete 的时候都报警告⚠️
 */
class ReadonlyReactiveHandler extends BaseReactiveHandler {
  constructor(shallow = false) {
    // 实例化的时候就透传了 isReadonly 标识，是否浅层响应，则看用户传递的值
    super(true, shallow)
  }

  // 在开发环境调用 setter，报警告
  set(target: object, key: string | symbol) {
    if (__DEV__) {
      warn(
        `Set operation on key "${String(key)}" failed: target is readonly.`,
        target,
      )
    }
    return true
  }

  // 在开发环境调用 delete，报警告
  deleteProperty(target: object, key: string | symbol) {
    if (__DEV__) {
      warn(
        `Delete operation on key "${String(key)}" failed: target is readonly.`,
        target,
      )
    }
    return true
  }
}

export const mutableHandlers: ProxyHandler<object> =
  /*#__PURE__*/ new MutableReactiveHandler()

export const readonlyHandlers: ProxyHandler<object> =
  /*#__PURE__*/ new ReadonlyReactiveHandler()

export const shallowReactiveHandlers = /*#__PURE__*/ new MutableReactiveHandler(
  true,
)

// Props handlers are special in the sense that it should not unwrap top-level
// refs (in order to allow refs to be explicitly passed down), but should
// retain the reactivity of the normal readonly object.
export const shallowReadonlyHandlers =
  /*#__PURE__*/ new ReadonlyReactiveHandler(true)
