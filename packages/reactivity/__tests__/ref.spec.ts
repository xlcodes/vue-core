import {
  type Ref,
  effect,
  isReactive,
  isRef,
  reactive,
  ref,
  toRef,
  toRefs,
} from '../src/index'
import { computed } from '@vue/runtime-dom'
import { customRef, shallowRef, triggerRef, unref } from '../src/ref'
import {
  isReadonly,
  isShallow,
  readonly,
  shallowReactive,
} from '../src/reactive'
import { expect } from 'vitest'

describe('ref 测试', () => {
  it('ref 的 value 属性应当存在', () => {
    const a = ref(1)
    expect(a.value).toBe(1)
    a.value = 2
    expect(a.value).toBe(2)
  })

  it('ref 应当是响应式的', () => {
    const a = ref(1)
    let dummy
    const fn = vi.fn(() => {
      dummy = a.value
    })
    // 创建一个作用域
    effect(fn)
    // effect 创建的函数初始化被调用一次
    expect(fn).toHaveBeenCalledTimes(1)
    // 此时 dummy === a.value === 1
    expect(dummy).toBe(1)
    // 改变 a.value 的值
    a.value = 2
    // fn 函数再次被调用
    expect(fn).toHaveBeenCalledTimes(2)
    // dummy 的值也在预期范围
    expect(dummy).toBe(2)
    // same value should not trigger
    a.value = 2
    // 相同的值 fn 函数不再触发
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('ref 里嵌套的属性也应当是响应式的', () => {
    const a = ref({
      count: 1,
    })
    let dummy
    effect(() => {
      dummy = a.value.count
    })
    expect(dummy).toBe(1)
    a.value.count = 2
    expect(dummy).toBe(2)
  })

  it('ref 应该创建一个初始值', () => {
    const a = ref()
    let dummy
    effect(() => {
      dummy = a.value
    })
    // 第一次调用 effect 回调函数的时候，a.value 已经被创建，但是值为 undefined
    expect(dummy).toBe(undefined)
    // 给 a.value 赋值
    a.value = 2
    // dummy 被正确断言
    expect(dummy).toBe(2)
  })

  it('ref被深层嵌套在 reactive 中也应当正常工作', () => {
    const a = ref(1)
    const obj = reactive({
      a,
      b: {
        c: a,
      },
    })

    let dummy1: number
    let dummy2: number

    effect(() => {
      dummy1 = obj.a
      dummy2 = obj.b.c
    })

    const assertDummiesEqualTo = (val: number) =>
      [dummy1, dummy2].forEach(dummy => expect(dummy).toBe(val))

    // 初始值断言
    // a.value === 1
    assertDummiesEqualTo(1)
    // 修改 a.value
    a.value++
    // a.value === 2
    assertDummiesEqualTo(2)
    obj.a++
    // a.value === 3
    assertDummiesEqualTo(3)
    obj.b.c++
    // a.value === 4
    assertDummiesEqualTo(4)
  })

  it('ref 数据类型继承正常', () => {
    const a = ref(0)
    // b 继承了 a 的类型
    const b = ref(a)
    // b 的类型符合预期
    expect(typeof (b.value + 1)).toBe('number')
  })

  it('对象中的 ref 类型会被展开', () => {
    const a = {
      b: ref(0),
    }
    expect(isRef(a.b)).toBeTruthy()
    // 将 a 响应式处理
    const c = ref(a)
    // 此时 c.value.b 就是普通对象了
    expect(isRef(c.value.b)).toBeFalsy()
    expect(typeof (c.value.b + 1)).toBe('number')
  })

  it('数组中的 ref 类型不会被展开', () => {
    const arr = ref([1, ref(3)]).value
    // arr[0] => 1
    expect(isRef(arr[0])).toBe(false)
    // arr[1] => ref(3)
    expect(isRef(arr[1])).toBe(true)
    // 断言 arr[1] 的值
    expect((arr[1] as Ref).value).toBe(3)
  })

  it('should unwrap ref types as props of arrays', () => {
    const arr = [ref(0)]
    const symbolKey = Symbol('')
    arr['' as any] = ref(1)
    arr[symbolKey as any] = ref(2)
    const arrRef = ref(arr).value
    expect(isRef(arrRef[0])).toBe(true)
    expect(isRef(arrRef['' as any])).toBe(false)
    expect(isRef(arrRef[symbolKey as any])).toBe(false)
    expect(arrRef['' as any]).toBe(1)
    expect(arrRef[symbolKey as any]).toBe(2)
  })

  it('元组数据类型也不会展开 ref', () => {
    const tuple: [number, string, { a: number }, () => number, Ref<number>] = [
      0,
      '1',
      { a: 1 },
      () => 0,
      ref(0),
    ]
    const tupleRef = ref(tuple)

    // tuple[0] => 0
    tupleRef.value[0]++
    expect(tupleRef.value[0]).toBe(1)
    // tuple[1] => '1'
    tupleRef.value[1] += '1'
    expect(tupleRef.value[1]).toBe('11')
    // tuple[2] => { a: 1 }
    tupleRef.value[2].a++
    expect(tupleRef.value[2].a).toBe(2)
    // tuple[3] => () => 0
    expect(tupleRef.value[3]()).toBe(0)
    tupleRef.value[4].value++
    // tuple[4] => ref(0)
    expect(tupleRef.value[4].value).toBe(1)
  })

  it('ref 处理 symbols 也能正常工作', () => {
    const customSymbol = Symbol()
    const obj = {
      [Symbol.asyncIterator]: ref(1),
      [Symbol.hasInstance]: { a: ref('a') },
      [Symbol.isConcatSpreadable]: { b: ref(true) },
      [Symbol.iterator]: [ref(1)],
      [Symbol.match]: new Set<Ref<number>>(),
      [Symbol.matchAll]: new Map<number, Ref<string>>(),
      [Symbol.replace]: { arr: [ref('a')] },
      [Symbol.search]: { set: new Set<Ref<number>>() },
      [Symbol.species]: { map: new Map<number, Ref<string>>() },
      [Symbol.split]: new WeakSet<Ref<boolean>>(),
      [Symbol.toPrimitive]: new WeakMap<Ref<boolean>, string>(),
      [Symbol.toStringTag]: { weakSet: new WeakSet<Ref<boolean>>() },
      [Symbol.unscopables]: { weakMap: new WeakMap<Ref<boolean>, string>() },
      [customSymbol]: { arr: [ref(1)] },
    }

    const objRef = ref(obj)

    const keys: (keyof typeof obj)[] = [
      Symbol.asyncIterator,
      Symbol.hasInstance,
      Symbol.isConcatSpreadable,
      Symbol.iterator,
      Symbol.match,
      Symbol.matchAll,
      Symbol.replace,
      Symbol.search,
      Symbol.species,
      Symbol.split,
      Symbol.toPrimitive,
      Symbol.toStringTag,
      Symbol.unscopables,
      customSymbol,
    ]

    keys.forEach(key => {
      expect(objRef.value[key]).toStrictEqual(obj[key])
    })

    // 修改包含 Symbol 的普通属性，objRef 的值也会更新
    obj[Symbol.asyncIterator].value = 200
    expect(objRef.value[Symbol.asyncIterator].value).toBe(200)
  })

  test('unref 将 ref 的值转换为对应的原始值', () => {
    // 解构非 ref 的值
    expect(unref(1)).toBe(1)
    // 将 ref 的值转换为对应的原始值
    expect(unref(ref(1))).toBe(1)
  })

  test('shallowRef，浅层次的响应式', () => {
    const sref = shallowRef({ a: 1 })
    expect(isReactive(sref.value)).toBe(false)

    let dummy
    effect(() => {
      dummy = sref.value.a
    })
    expect(dummy).toBe(1)

    sref.value = { a: 2 }
    expect(isReactive(sref.value)).toBe(false)
    expect(dummy).toBe(2)
  })

  test('shallowRef 不会被深层递归的转为响应式', () => {
    const sref = shallowRef({ a: 1 })
    let dummy
    effect(() => {
      dummy = sref.value.a
    })
    expect(dummy).toBe(1)

    sref.value.a = 2
    expect(dummy).toBe(1) // should not trigger yet

    // force trigger
    // 强制触发更新
    triggerRef(sref)
    expect(dummy).toBe(2)
  })

  test('shallowRef 属于 isShallow 类型，即对象携带 【__v_isShallow】属性', () => {
    expect(isShallow(shallowRef({ a: 1 }))).toBe(true)
  })

  test('isRef: 是否是 ref 数据类型', () => {
    expect(isRef(ref(1))).toBe(true)
    // computed 也是返回 ref 类型
    expect(isRef(computed(() => 1))).toBe(true)
    // 普通对象
    expect(isRef(0)).toBe(false)
    expect(isRef(1)).toBe(false)
    // 看起来像 ref 但不是 ref 的对象
    expect(isRef({ value: 0 })).toBe(false)
  })

  test('toRef: 将值、refs 或 getters 规范化为 refs', () => {
    const a = reactive({
      x: 1,
    })
    expect(isRef(a.x)).toBeFalsy()
    // 将 x 属性转换为 ref 对象
    const x = toRef(a, 'x')
    expect(isRef(x)).toBe(true)
    expect(x.value).toBe(1)

    // source -> proxy
    a.x = 2
    // x 会保持同步修改
    expect(x.value).toBe(2)

    // proxy -> source
    x.value = 3
    // 原始的 a.x 也应当保持同步修改
    expect(a.x).toBe(3)

    // reactivity
    let dummyX
    effect(() => {
      dummyX = x.value
    })
    // 响应式正常工作
    expect(dummyX).toBe(x.value)

    // mutating source should trigger effect using the proxy refs
    a.x = 4
    // 修改原始的值，通过 effect 作用域也可以捕获响应式变化
    expect(dummyX).toBe(4)

    // should keep ref
    // toRef 传递的是 ref 对下，则保持原有属性不变
    const r = { x: ref(1) }
    expect(toRef(r, 'x')).toBe(r.x)
  })

  test('toRef 针对数组同样保持响应式', () => {
    const a = reactive(['a', 'b'])
    // 代理了 a[1]
    const r = toRef(a, 1)
    expect(r.value).toBe('b')
    r.value = 'c'
    expect(r.value).toBe('c')
    // 原始的 a[1] 也保持同步修改
    expect(a[1]).toBe('c')
  })

  test('toRef 添加默认值', () => {
    const a: { x: number | undefined } = { x: undefined }
    const x = toRef(a, 'x', 1)
    expect(x.value).toBe(1)

    a.x = 2
    expect(x.value).toBe(2)

    a.x = undefined
    // 当 a.x 为 undefined 的时候，x.value 值就为默认值
    expect(x.value).toBe(1)
  })

  test('toRef 创建一个只读的 ref', () => {
    // 创建一个只读的 ref
    const x = toRef(() => 1)
    // x 的值符合预期
    expect(x.value).toBe(1)
    expect(isRef(x)).toBe(true)
    expect(unref(x)).toBe(1)
    //@ts-expect-error
    // 调用 setter 方法直接报错
    expect(() => (x.value = 123)).toThrow()
    // x 标记为只读【__v_isReadonly】
    expect(isReadonly(x)).toBe(true)
  })

  test('toRefs 的行为测试', () => {
    const a = reactive({
      x: 1,
      y: 2,
    })

    const { x, y } = toRefs(a)

    // toRefs 创建的数据于 Ref 数据结构保持一致
    expect(isRef(x)).toBe(true)
    expect(isRef(y)).toBe(true)
    expect(x.value).toBe(1)
    expect(y.value).toBe(2)

    // source -> proxy
    a.x = 2
    a.y = 3
    // toRefs 代理的对象会根据原始数据保持响应式
    expect(x.value).toBe(2)
    expect(y.value).toBe(3)

    // proxy -> source
    x.value = 3
    y.value = 4
    // 修改 toRefs 创建的对象，同时也会修改原始数据
    expect(a.x).toBe(3)
    expect(a.y).toBe(4)

    // reactivity
    let dummyX, dummyY
    effect(() => {
      dummyX = x.value
      dummyY = y.value
    })
    expect(dummyX).toBe(x.value)
    expect(dummyY).toBe(y.value)

    // mutating source should trigger effect using the proxy refs
    a.x = 4
    a.y = 5
    // 通过 effect 代理的数据，也保持响应式
    expect(dummyX).toBe(4)
    expect(dummyY).toBe(5)

    x.value = 10
    y.value = 20
    expect(dummyX).toBe(10)
    expect(dummyY).toBe(20)
  })

  test('toRefs 接收普通对象的时候发出警告', () => {
    toRefs({})
    expect(`toRefs() expects a reactive object`).toHaveBeenWarned()
  })

  test('toRefs 接收数组的时候发出警告', () => {
    toRefs([])
    expect(`toRefs() expects a reactive object`).toHaveBeenWarned()

    toRef([ref(0), ref(1)])
    expect(`toRefs() expects a reactive object`).toHaveBeenWarned()
  })

  test('toRefs 接收一个响应式数组', () => {
    const arr = reactive(['a', 'b', 'c'])
    // 将响应式数组 ref 化
    const refs = toRefs(arr)

    // refs 是一个数组
    expect(Array.isArray(refs)).toBe(true)

    refs[0].value = '1'
    expect(arr[0]).toBe('1')

    // 修改原始响应式数组，toRefs 产生的数组也会相应更新
    arr[1] = '2'
    expect(refs[1].value).toBe('2')
  })

  test('customRef: 自定义 ref，可以完全控制 getter 和 setter 的执行', () => {
    let value = 1
    let _trigger: () => void

    // 创建一个自定义的 ref
    const custom = customRef((track, trigger) => ({
      get() {
        track()
        return value
      },
      set(newValue: number) {
        value = newValue
        _trigger = trigger
      },
    }))

    // 自己创建的 ref 也是 ref 类型
    expect(isRef(custom)).toBe(true)

    let dummy
    // 响应式正常工作
    effect(() => {
      dummy = custom.value
    })
    expect(dummy).toBe(1)

    custom.value = 2
    // should not trigger yet
    // 自定义的 ref 没调用 trigger，值还没改变
    expect(dummy).toBe(1)

    // 手动触发 trigger 方法
    _trigger!()
    expect(dummy).toBe(2)
  })

  test('当响应式被设置为相同的值的时候，代理不会被触发', () => {
    const obj = reactive({ count: 0 })

    const a = ref(obj)
    const spy1 = vi.fn(() => a.value)

    effect(spy1)
    expect(spy1).toBeCalledTimes(1)
    a.value = obj
    // ref 对象，spy1 函数没被调用
    expect(spy1).toBeCalledTimes(1)

    const b = shallowRef(obj)
    const spy2 = vi.fn(() => b.value)

    effect(spy2)
    expect(spy2).toBeCalledTimes(1)
    b.value = obj
    //shallowRef 对象，spy2 函数没被调用
    expect(spy2).toBeCalledTimes(1)
  })

  // TODO: 思考这个单测存在的意义
  test('ref should preserve value shallow/readonly-ness', () => {
    const original = {}
    const r = reactive(original)
    const s = shallowReactive(original)
    const rr = readonly(original)
    const a = ref(original)

    // a 作为 ref 的值，跟 reactive 创建的 r 的值保持一致
    expect(a.value).toBe(r)

    // 改变 a 的值
    a.value = s
    // expect(r).toStrictEqual(s)
    // expect(r).not.toBe(s)
    // 此时 a.value === s
    expect(a.value).toBe(s)
    expect(a.value).not.toBe(r)

    a.value = rr
    expect(a.value).toBe(rr)
    expect(a.value).not.toBe(r)
  })
})
