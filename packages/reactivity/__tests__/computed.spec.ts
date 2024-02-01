import { h, nextTick, nodeOps, render, serializeInner } from '@vue/runtime-test'
import {
  type DebuggerEvent,
  ITERATE_KEY,
  TrackOpTypes,
  TriggerOpTypes,
  type WritableComputedRef,
  computed,
  effect,
  isReadonly,
  reactive,
  ref,
  toRaw,
} from '../src'
import { DirtyLevels } from '../src/constants'
import { expect } from 'vitest'

describe('计算属性 computed', () => {
  it('同步返回更新后的值', () => {
    // 创建响应式对象
    const value = reactive<{ foo?: number }>({})
    // 创建一个可读的 计算属性，绑定 value 的 foo 属性
    const cValue = computed(() => value.foo)
    // 未赋值的时候为 undefined
    expect(cValue.value).toBe(undefined)
    // 给 value.foo 赋值
    value.foo = 1
    // 此时计算属性同步保持更新
    expect(cValue.value).toBe(1)
  })

  it('computed 是懒惰的，具体表现在第一次不会被调用', () => {
    const value = reactive<{ foo?: number }>({})
    // 设置 getter 函数
    const getter = vi.fn(() => value.foo)
    const cValue = computed(getter)

    // lazy
    // 初始创建计算属性的时候 getter 函数不会被调用
    expect(getter).not.toHaveBeenCalled()

    // 初始化计算属性跟 value 保持一致
    expect(cValue.value).toBe(undefined)
    // cValue.value => 通过 getter 函数获取 value.foo
    // 所以这里 getter 函数被调用了一次
    expect(getter).toHaveBeenCalledTimes(1)

    // should not compute again
    cValue.value
    // 这里 getter 函数不会被调用，是因为原始响应式对象 value 值未改变
    expect(getter).toHaveBeenCalledTimes(1)

    // should not compute until needed
    value.foo = 1
    // 只是设置原始响应式对象，计算属性的 getter 方法不会被触发
    expect(getter).toHaveBeenCalledTimes(1)

    // now it should compute
    expect(cValue.value).toBe(1)
    // 只有获取计算属性的值的时候，getter 函数才会被调用
    expect(getter).toHaveBeenCalledTimes(2)

    // should not compute again
    cValue.value
    // 原始响应式对象值未变化，getter 函数不会被调用
    expect(getter).toHaveBeenCalledTimes(2)
  })

  it('effect 作用域包裹的计算属性也能正常工作', () => {
    const value = reactive<{ foo?: number }>({})
    const cValue = computed(() => value.foo)
    let dummy
    effect(() => {
      // 这里 dummy 被赋值成了计算属性
      dummy = cValue.value
    })
    // 初始化计算属性的值为 undefined
    expect(dummy).toBe(undefined)
    // value.foo 改变，触发 cValue 的改变，cValue 的改变触发 dummy 的改变
    value.foo = 1
    expect(dummy).toBe(1)
  })

  it('链式调用的计算属性也可以正常工作', () => {
    const value = reactive({ foo: 0 })
    const c1 = computed(() => value.foo)
    const c2 = computed(() => c1.value + 1)
    // c1, c2 均符合预期
    expect(c2.value).toBe(1)
    expect(c1.value).toBe(0)
    value.foo++
    // value 的改变同时会触发 c1,c2 的改变
    expect(c2.value).toBe(2)
    expect(c1.value).toBe(1)
  })

  it('包裹在 effect 作用域中的计算属性同样可以被链式调用', () => {
    const value = reactive({ foo: 0 })
    const getter1 = vi.fn(() => value.foo)
    const getter2 = vi.fn(() => {
      return c1.value + 1
    })
    const c1 = computed(getter1)
    const c2 = computed(getter2)

    let dummy
    effect(() => {
      dummy = c2.value
    })
    // 读取 dummy 会同时触发 c1，c2 的 getter 方法
    expect(dummy).toBe(1)
    expect(getter1).toHaveBeenCalledTimes(1)
    expect(getter2).toHaveBeenCalledTimes(1)
    value.foo++
    // 设置 value 的值触发 c1,c2 的 getter 函数，同时 dummy 的值也符合预期
    expect(dummy).toBe(2)
    // should not result in duplicate calls
    expect(getter1).toHaveBeenCalledTimes(2)
    expect(getter2).toHaveBeenCalledTimes(2)
  })

  it('在 effect 作用域中可以同时包含计算属性的混合调用', () => {
    const value = reactive({ foo: 0 })
    const getter1 = vi.fn(() => value.foo)
    const getter2 = vi.fn(() => {
      return c1.value + 1
    })
    const c1 = computed(getter1)
    const c2 = computed(getter2)

    let dummy
    effect(() => {
      dummy = c1.value + c2.value
    })
    expect(dummy).toBe(1)

    expect(getter1).toHaveBeenCalledTimes(1)
    expect(getter2).toHaveBeenCalledTimes(1)
    value.foo++
    expect(dummy).toBe(3)
    // should not result in duplicate calls
    expect(getter1).toHaveBeenCalledTimes(2)
    expect(getter2).toHaveBeenCalledTimes(2)
  })

  it('调用包含在计算属性上的 effect.stop() 方法，计算属性的响应式立即停止', () => {
    // 创建一个响应式对象
    const value = reactive<{ foo?: number }>({})
    // 创建一个计算属性
    const cValue = computed(() => value.foo)
    let dummy
    // 创建一个 effect 作用域
    effect(() => {
      dummy = cValue.value
    })
    expect(dummy).toBe(undefined)
    value.foo = 1
    expect(dummy).toBe(1)
    // 调用 effect.stop 方法
    cValue.effect.stop()
    value.foo = 2
    // dummy 不再具有响应式，本质是 cValue 不再具有响应式
    expect(dummy).toBe(1)
  })

  it('计算属性支持修改', () => {
    const n = ref(1)
    const plusOne = computed({
      get: () => n.value + 1,
      set: val => {
        n.value = val - 1
      },
    })

    expect(plusOne.value).toBe(2)
    n.value++
    expect(plusOne.value).toBe(3)

    // 设置计算属性的时候值也符合预期
    plusOne.value = 0
    expect(n.value).toBe(-1)
  })

  it('包裹在 effect 中的 setter 函数也能正常工作', () => {
    const n = ref(1)
    const plusOne = computed({
      get: () => n.value + 1,
      set: val => {
        n.value = val - 1
      },
    })

    let dummy
    effect(() => {
      dummy = n.value
    })
    expect(dummy).toBe(1)

    // 修改了计算属性的值之后
    // 依赖这个计算属性的 effect 也会被触发
    plusOne.value = 0
    expect(n.value).toBe(-1)
    expect(dummy).toBe(-1)
  })

  // INFO: 这是一个针对 [bug#5720] 的单元测试
  // LINK: https://github.com/vuejs/core/issues/5720
  it('should invalidate before non-computed effects', () => {
    let plusOneValues: number[] = []
    const n = ref(0)
    const plusOne = computed(() => n.value + 1)
    effect(() => {
      n.value
      plusOneValues.push(plusOne.value)
    })
    // access plusOne, causing it to be non-dirty
    plusOne.value
    // mutate n
    n.value++
    // on the 2nd run, plusOne.value should have already updated.
    expect(plusOneValues).toMatchObject([1, 2])
  })

  it('只读的计算属性不能被修改', () => {
    const n = ref(1)
    const plusOne = computed(() => n.value + 1)
    ;(plusOne as WritableComputedRef<number>).value++ // Type cast to prevent TS from preventing the error

    expect(
      'Write operation failed: computed value is readonly',
    ).toHaveBeenWarnedLast()
  })

  it('计算属性包含只读标记', () => {
    let a = { a: 1 }
    const x = computed(() => a)
    // x 被打上只读标记
    expect(isReadonly(x)).toBe(true)
    // x 的属性没被打上只读标记
    expect(isReadonly(x.value)).toBe(false)
    expect(isReadonly(x.value.a)).toBe(false)
    // 创建一个可写的计算属性
    const z = computed<typeof a>({
      get() {
        return a
      },
      set(v) {
        a = v
      },
    })
    //  z 没被打上只读标记
    expect(isReadonly(z)).toBe(false)
    expect(isReadonly(z.value.a)).toBe(false)
  })

  it('计算属性响应式停止的时候会暴露当前代理的值', () => {
    const x = computed(() => 1)
    x.effect.stop()
    expect(x.value).toBe(1)
  })

  it('debug: onTrack 响应属性或引用作为依赖项被跟踪时被调用', () => {
    let events: DebuggerEvent[] = []
    // 声明一个模拟触发的 onTrack 函数
    const onTrack = vi.fn((e: DebuggerEvent) => {
      events.push(e)
    })
    // 响应式对象
    const obj = reactive({ foo: 1, bar: 2 })
    // 计算属性
    const c = computed(() => (obj.foo, 'bar' in obj, Object.keys(obj)), {
      // 调试时触发的函数
      onTrack,
    })
    // 计算属性会返回最后一个值
    expect(c.value).toEqual(['foo', 'bar'])
    // 计算属性 getter 返回了 3 个响应式依赖项目
    // 【obj.foo】【'bar' in obj】【Object.keys(obj)】
    expect(onTrack).toHaveBeenCalledTimes(3)
    // 断言返回的值是否符合预期
    expect(events).toEqual([
      {
        effect: c.effect,
        target: toRaw(obj),
        type: TrackOpTypes.GET,
        key: 'foo',
      },
      {
        effect: c.effect,
        target: toRaw(obj),
        type: TrackOpTypes.HAS,
        key: 'bar',
      },
      {
        effect: c.effect,
        target: toRaw(obj),
        type: TrackOpTypes.ITERATE,
        key: ITERATE_KEY,
      },
    ])
  })

  it('debug: onTrigger 侦听器回调被依赖项的变更触发时被调用', () => {
    let events: DebuggerEvent[] = []
    const onTrigger = vi.fn((e: DebuggerEvent) => {
      events.push(e)
    })
    const obj = reactive<{ foo?: number }>({ foo: 1 })
    const c = computed(() => obj.foo, { onTrigger })

    // computed won't trigger compute until accessed
    c.value
    // 获取值 onTrigger 不会被触发
    expect(onTrigger).toHaveBeenCalledTimes(0)

    // 设置值的时候计算属性正常工作且 onTrigger 会被触发
    obj.foo!++
    expect(c.value).toBe(2)
    expect(onTrigger).toHaveBeenCalledTimes(1)
    // setter 触发的时候，回调参数符合预期
    expect(events[0]).toEqual({
      effect: c.effect,
      target: toRaw(obj),
      type: TriggerOpTypes.SET,
      key: 'foo',
      oldValue: 1,
      newValue: 2,
    })

    delete obj.foo
    // 删除值的时候，计算属性也可以监听到并且调用 setter 方法
    expect(c.value).toBeUndefined()
    // 此时 onTrigger 也会被调用
    expect(onTrigger).toHaveBeenCalledTimes(2)
    // 回调参数也会收集到对应的事件
    expect(events[1]).toEqual({
      effect: c.effect,
      target: toRaw(obj),
      type: TriggerOpTypes.DELETE,
      key: 'foo',
      oldValue: 2,
    })
  })

  // https://github.com/vuejs/core/pull/5912#issuecomment-1497596875
  it('should query deps dirty sequentially', () => {
    const cSpy = vi.fn()
    // a => { v: 1 }
    const a = ref<null | { v: number }>({
      v: 1,
    })
    // b => a => { v: 1 }
    const b = computed(() => {
      return a.value
    })
    // c => 1
    const c = computed(() => {
      cSpy()
      return b.value?.v
    })

    // d => 1
    const d = computed(() => {
      if (b.value) {
        return c.value
      }
      return 0
    })

    d.value
    a.value!.v = 2
    a.value = null
    d.value
    expect(cSpy).toHaveBeenCalledTimes(1)
  })

  // https://github.com/vuejs/core/pull/5912#issuecomment-1738257692
  it('chained computed dirty reallocation after querying dirty', () => {
    let _msg: string | undefined

    const items = ref<number[]>()
    const isLoaded = computed(() => {
      return !!items.value
    })
    const msg = computed(() => {
      if (isLoaded.value) {
        return 'The items are loaded'
      } else {
        return 'The items are not loaded'
      }
    })

    effect(() => {
      _msg = msg.value
    })

    items.value = [1, 2, 3]
    items.value = [1, 2, 3]
    items.value = undefined

    expect(_msg).toBe('The items are not loaded')
  })

  it('chained computed dirty reallocation after trigger computed getter', () => {
    let _msg: string | undefined

    const items = ref<number[]>()
    const isLoaded = computed(() => {
      return !!items.value
    })
    const msg = computed(() => {
      if (isLoaded.value) {
        return 'The items are loaded'
      } else {
        return 'The items are not loaded'
      }
    })

    _msg = msg.value
    items.value = [1, 2, 3]
    isLoaded.value // <- trigger computed getter
    _msg = msg.value
    items.value = undefined
    _msg = msg.value

    expect(_msg).toBe('The items are not loaded')
  })

  // https://github.com/vuejs/core/pull/5912#issuecomment-1739159832
  it('deps order should be consistent with the last time get value', () => {
    const cSpy = vi.fn()

    const a = ref(0)
    const b = computed(() => {
      return a.value % 3 !== 0
    })
    const c = computed(() => {
      cSpy()
      if (a.value % 3 === 2) {
        return 'expensive'
      }
      return 'cheap'
    })
    const d = computed(() => {
      return a.value % 3 === 2
    })
    const e = computed(() => {
      if (b.value) {
        if (d.value) {
          return 'Avoiding expensive calculation'
        }
      }
      return c.value
    })

    e.value
    a.value++
    e.value

    expect(e.effect.deps.length).toBe(3)
    expect(e.effect.deps.indexOf((b as any).dep)).toBe(0)
    expect(e.effect.deps.indexOf((d as any).dep)).toBe(1)
    expect(e.effect.deps.indexOf((c as any).dep)).toBe(2)
    expect(cSpy).toHaveBeenCalledTimes(2)

    a.value++
    e.value

    expect(cSpy).toHaveBeenCalledTimes(2)
  })

  it('should trigger by the second computed that maybe dirty', () => {
    const cSpy = vi.fn()

    const src1 = ref(0)
    const src2 = ref(0)
    const c1 = computed(() => src1.value)
    const c2 = computed(() => (src1.value % 2) + src2.value)
    const c3 = computed(() => {
      cSpy()
      c1.value
      c2.value
    })

    c3.value
    src1.value = 2
    c3.value
    expect(cSpy).toHaveBeenCalledTimes(2)
    src2.value = 1
    c3.value
    expect(cSpy).toHaveBeenCalledTimes(3)
  })

  it('should trigger the second effect', () => {
    const fnSpy = vi.fn()
    const v = ref(1)
    const c = computed(() => v.value)

    effect(() => {
      c.value
    })
    effect(() => {
      c.value
      fnSpy()
    })

    expect(fnSpy).toBeCalledTimes(1)
    v.value = 2
    expect(fnSpy).toBeCalledTimes(2)
  })

  it('should chained recurse effects clear dirty after trigger', () => {
    const v = ref(1)
    const c1 = computed(() => v.value)
    const c2 = computed(() => c1.value)

    c1.effect.allowRecurse = true
    c2.effect.allowRecurse = true
    c2.value

    expect(c1.effect._dirtyLevel).toBe(DirtyLevels.NotDirty)
    expect(c2.effect._dirtyLevel).toBe(DirtyLevels.NotDirty)
  })

  it('should chained computeds dirtyLevel update with first computed effect', () => {
    const v = ref(0)
    const c1 = computed(() => {
      if (v.value === 0) {
        v.value = 1
      }
      return v.value
    })
    const c2 = computed(() => c1.value)
    const c3 = computed(() => c2.value)

    c3.value

    expect(c1.effect._dirtyLevel).toBe(DirtyLevels.Dirty)
    expect(c2.effect._dirtyLevel).toBe(DirtyLevels.MaybeDirty)
    expect(c3.effect._dirtyLevel).toBe(DirtyLevels.MaybeDirty)
  })

  it('计算属性在链式调用的时候也会产生符合预期的响应式效果', () => {
    const v = ref(0)
    const c1 = computed(() => {
      if (v.value === 0) {
        v.value = 1
      }
      return 'foo'
    })
    const c2 = computed(() => v.value + c1.value)
    // 此时 v.value === 0，c1 计算属性的 getter 函数对 v.value 的修改暂时没有产生响应
    expect(c2.value).toBe('0foo')
    expect(c2.effect._dirtyLevel).toBe(DirtyLevels.Dirty)
    // 再次调用 c2 的 getter 方法，会重新计算 v.value 和 c1.value 的值，此时 v.value 产生了响应式
    expect(c2.value).toBe('1foo')
  })

  it('effect 作用域会导致计算属性依赖的响应式对戏产生脏值', () => {
    // 作为一个标记函数
    const fnSpy = vi.fn()
    const v = ref(0)
    const c1 = computed(() => {
      if (v.value === 0) {
        v.value = 1
      }
      return 'foo'
    })
    // 计算属性中在 getter 函数修改的响应式对象不会触发依赖
    // 因为return的数据并非当前响应式对象
    expect(v.value).toBe(0)
    const c2 = computed(() => v.value + c1.value)

    // 将 c2 包裹在 effect 作用域中，c1 计算属性在 getter 函数中修改的响应式对象产生的结果作用到了 c2 上
    effect(() => {
      fnSpy()
      c2.value
    })
    // fnSpy 函数初始化调用一次
    expect(fnSpy).toBeCalledTimes(1)
    // todo: _dirtyLevel 定义的意义是什么
    expect(c1.effect._dirtyLevel).toBe(DirtyLevels.Dirty)
    expect(c2.effect._dirtyLevel).toBe(DirtyLevels.Dirty)
    v.value = 2
    // 修改 v 的值也会导致 c2 重新计算，fnSpy 也就重新调用了一次
    expect(fnSpy).toBeCalledTimes(2)
    expect(c2.value).toBe('2foo')
  })

  it('层层嵌套之后修改的计算属性，获取到的值也应当符合预期（即计算属性的值不应该被污染，只要依赖的原始响应式对象发生改变，不管在哪里改变的，计算属性的响应式都不应该丢失）', async () => {
    const state = reactive<any>({})
    const consumer = computed(() => {
      // state 上不存在 a 属性的时候， 设置 a 属性的值为 1，然后返回
      if (!('a' in state)) state.a = 1
      return state.a
    })
    // 创建一个组件
    const Comp = {
      setup: () => {
        // 初始化的时候 state.a === 1
        // nextTick 等待节点更新之后修改原始响应式数据的值
        nextTick().then(() => {
          state.a = 2
        })
        return () => consumer.value
      },
    }
    const root = nodeOps.createElement('div')
    render(h(Comp), root)
    await nextTick()
    await nextTick()
    // 节点渲染完成，state.a 已经被修改为 2， 此时 consumer.value 应该为 2
    // TODO: ?? serializeInner 具体做了什么需要继续研究
    expect(serializeInner(root)).toBe(`2`)
    expect(state.a).toBe(2)
    expect(consumer.value).toBe(2)
  })
})
