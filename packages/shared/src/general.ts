import { makeMap } from './makeMap'

// 开发环境创建一个被冻结的对象
// 其他环境创建一个空对象
export const EMPTY_OBJ: { readonly [key: string]: any } = __DEV__
  ? Object.freeze({})
  : {}
// 同上创建数组
export const EMPTY_ARR = __DEV__ ? Object.freeze([]) : []
// 创建一个空函数
export const NOOP = () => {}

/**
 * 创建一个永远返回false的函数
 */
export const NO = () => false

/**
 * 检查传递的 key 值是否包含 on 标识符前缀
 * 并且 第三个字符是否为大写，均满足才返回 true
 * @example
 * onClick => true
 * onclick => false
 * @param key
 */
export const isOn = (key: string) =>
  key.charCodeAt(0) === 111 /* o */ &&
  key.charCodeAt(1) === 110 /* n */ &&
  // uppercase letter
  (key.charCodeAt(2) > 122 || key.charCodeAt(2) < 97)

// 获取 v-model 设置的值的 update 方法
export const isModelListener = (key: string) => key.startsWith('onUpdate:')

export const extend = Object.assign

/**
 * 数组移除方法
 * @param arr
 * @param el
 */
export const remove = <T>(arr: T[], el: T) => {
  const i = arr.indexOf(el)
  if (i > -1) {
    arr.splice(i, 1)
  }
}

const hasOwnProperty = Object.prototype.hasOwnProperty
export const hasOwn = (
  val: object,
  key: string | symbol,
): key is keyof typeof val => hasOwnProperty.call(val, key)

export const isArray = Array.isArray
// 检测 Map 对象
export const isMap = (val: unknown): val is Map<any, any> =>
  toTypeString(val) === '[object Map]'
// 检测 Set 对象
export const isSet = (val: unknown): val is Set<any> =>
  toTypeString(val) === '[object Set]'

// 检测日期对象
export const isDate = (val: unknown): val is Date =>
  toTypeString(val) === '[object Date]'
// 检测正则对象
export const isRegExp = (val: unknown): val is RegExp =>
  toTypeString(val) === '[object RegExp]'
// 是否为函数
export const isFunction = (val: unknown): val is Function =>
  typeof val === 'function'
export const isString = (val: unknown): val is string => typeof val === 'string'
export const isSymbol = (val: unknown): val is symbol => typeof val === 'symbol'
export const isObject = (val: unknown): val is Record<any, any> =>
  val !== null && typeof val === 'object'

export const isPromise = <T = any>(val: unknown): val is Promise<T> => {
  return (
    (isObject(val) || isFunction(val)) &&
    isFunction((val as any).then) &&
    isFunction((val as any).catch)
  )
}

export const objectToString = Object.prototype.toString
export const toTypeString = (value: unknown): string =>
  objectToString.call(value)

export const toRawType = (value: unknown): string => {
  // extract "RawType" from strings like "[object RawType]"
  return toTypeString(value).slice(8, -1)
}

// 判断是否为原始对象
export const isPlainObject = (val: unknown): val is object =>
  toTypeString(val) === '[object Object]'

export const isIntegerKey = (key: unknown) =>
  isString(key) &&
  key !== 'NaN' &&
  key[0] !== '-' &&
  '' + parseInt(key, 10) === key

export const isReservedProp = /*#__PURE__*/ makeMap(
  // the leading comma is intentional so empty string "" is also included
  ',key,ref,ref_for,ref_key,' +
    'onVnodeBeforeMount,onVnodeMounted,' +
    'onVnodeBeforeUpdate,onVnodeUpdated,' +
    'onVnodeBeforeUnmount,onVnodeUnmounted',
)

export const isBuiltInDirective = /*#__PURE__*/ makeMap(
  'bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo',
)

const cacheStringFunction = <T extends (str: string) => string>(fn: T): T => {
  const cache: Record<string, string> = Object.create(null)
  return ((str: string) => {
    const hit = cache[str]
    return hit || (cache[str] = fn(str))
  }) as T
}

const camelizeRE = /-(\w)/g
/**
 * @private
 */
export const camelize = cacheStringFunction((str: string): string => {
  return str.replace(camelizeRE, (_, c) => (c ? c.toUpperCase() : ''))
})

const hyphenateRE = /\B([A-Z])/g
/**
 * @private
 */
export const hyphenate = cacheStringFunction((str: string) =>
  str.replace(hyphenateRE, '-$1').toLowerCase(),
)

/**
 * @private
 */
export const capitalize = cacheStringFunction(<T extends string>(str: T) => {
  return (str.charAt(0).toUpperCase() + str.slice(1)) as Capitalize<T>
})

/**
 * @private
 */
export const toHandlerKey = cacheStringFunction(<T extends string>(str: T) => {
  const s = str ? `on${capitalize(str)}` : ``
  return s as T extends '' ? '' : `on${Capitalize<T>}`
})

// compare whether a value has changed, accounting for NaN.
export const hasChanged = (value: any, oldValue: any): boolean =>
  !Object.is(value, oldValue)

export const invokeArrayFns = (fns: Function[], arg?: any) => {
  for (let i = 0; i < fns.length; i++) {
    fns[i](arg)
  }
}

/**
 * 将指定对象的指定属性代理为可更改、可删除但是不可枚举
 * @param obj
 * @param key
 * @param value
 */
export const def = (obj: object, key: string | symbol, value: any) => {
  Object.defineProperty(obj, key, {
    configurable: true, // 配置当前属性描述符号可更改，可删除
    enumerable: false, // 代理值为不可枚举类型
    value, // 当前值
  })
}

/**
 * "123-foo" will be parsed to 123
 * This is used for the .number modifier in v-model
 */
export const looseToNumber = (val: any): any => {
  const n = parseFloat(val)
  return isNaN(n) ? val : n
}

/**
 * Only concerns number-like strings
 * "123-foo" will be returned as-is
 */
export const toNumber = (val: any): any => {
  const n = isString(val) ? Number(val) : NaN
  return isNaN(n) ? val : n
}

let _globalThis: any
export const getGlobalThis = (): any => {
  return (
    _globalThis ||
    (_globalThis =
      typeof globalThis !== 'undefined'
        ? globalThis
        : typeof self !== 'undefined'
          ? self
          : typeof window !== 'undefined'
            ? window
            : typeof global !== 'undefined'
              ? global
              : {})
  )
}

/**
 * 这个正则表达式用于匹配标识符（identifiers），通常在编程语言中用于表示变量名、函数名等。让我们一步一步解释这个正则表达式的各个部分：
 * ^: 表示匹配字符串的开头。
 * [_$a-zA-Z\xA0-\uFFFF]: 这是一个字符集，匹配一个字符，其可以是下划线 _、美元符号 $，或者是任意字母（大小写不限），以及 Unicode 范围在\xA0-\uFFFF之间的字符。
 * [_$a-zA-Z0-9\xA0-\uFFFF]*: 这是一个量词，表示前面的字符集可以重复零次或多次。这允许匹配零个或多个下划线、美元符号、字母、数字以及 Unicode 范围在\xA0-\uFFFF之间的字符。
 * $: 表示匹配字符串的结尾。
 * 综合起来，这个正则表达式要求标识符以字母、下划线或美元符号开头，后跟零个或多个字母、数字、下划线、美元符号或 Unicode 字符
 *
 * @example
 * 合法标识符:
 * _variable
 * $count
 * userName
 * myVar123
 * _123
 * 汉字Identifier (包含Unicode字符)
 *
 * 不合法标识符:
 * 123variable（开头不能是数字）
 * @username（不包含在字符集中的特殊字符）
 * variable-name（不包含在字符集中的破折号）
 * my variable（不能包含空格）
 * a#b（不能包含井号）
 */
const identRE = /^[_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*$/

export function genPropsAccessExp(name: string) {
  return identRE.test(name)
    ? `__props.${name}`
    : `__props[${JSON.stringify(name)}]`
}
