import { nextTick, watch, watchEffect } from '@vue/runtime-core'
import {
  type ComputedRef,
  EffectScope,
  computed,
  effect,
  getCurrentScope,
  onScopeDispose,
  reactive,
  ref,
} from '../src'
import { expect } from 'vitest'

describe('reactivity/effect/scope', () => {
  it('run 方法默认调用', () => {
    const fnSpy = vi.fn(() => {})
    // 创建一个 effectScope 对象并调用 run 方法， fnSpy 模拟函数被调用
    new EffectScope().run(fnSpy)
    expect(fnSpy).toHaveBeenCalledTimes(1)
  })

  it('初始化创建的 scope.effects 长度为0', () => {
    const scope = new EffectScope()
    expect(scope.effects.length).toBe(0)
  })

  it('effectScope.run 方法包含返回值', () => {
    expect(new EffectScope().run(() => 1)).toBe(1)
  })

  it('effectScope 通过 active 标记当前是否包含响应式', () => {
    const scope = new EffectScope()
    scope.run(() => 1)
    expect(scope.active).toBe(true)
    scope.stop()
    expect(scope.active).toBe(false)
  })

  it('在 effectScope.run 方法中创建的 effect 作用域正常工作', () => {
    const scope = new EffectScope()
    scope.run(() => {
      let dummy
      const counter = reactive({ num: 0 })
      effect(() => (dummy = counter.num))

      expect(dummy).toBe(0)
      counter.num = 7
      expect(dummy).toBe(7)
    })

    expect(scope.effects.length).toBe(1)
  })

  it('通过调用 stop 方法阻止响应式', () => {
    let dummy, doubled
    const counter = reactive({ num: 0 })

    const scope = new EffectScope()
    scope.run(() => {
      effect(() => (dummy = counter.num))
      effect(() => (doubled = counter.num * 2))
    })

    expect(scope.effects.length).toBe(2)

    expect(dummy).toBe(0)
    counter.num = 7
    expect(dummy).toBe(7)
    expect(doubled).toBe(14)

    scope.stop()
    // 在执行完 stop 方法之后，响应式停止
    counter.num = 6
    expect(dummy).toBe(7)
    expect(doubled).toBe(14)
  })

  it('嵌套在 effectScope.run 方法中的 effectScope，父级 effectScope 调用 run 方法，子级 effectScope 的响应式也同时被阻止', () => {
    let dummy, doubled
    const counter = reactive({ num: 0 })

    const scope = new EffectScope()
    scope.run(() => {
      effect(() => (dummy = counter.num))
      // nested scope
      new EffectScope().run(() => {
        effect(() => (doubled = counter.num * 2))
      })
    })

    expect(scope.effects.length).toBe(1)
    // effectScope 内部包含了 scopes 数组存储 effectScope 对象
    expect(scope.scopes!.length).toBe(1)
    expect(scope.scopes![0]).toBeInstanceOf(EffectScope)

    expect(dummy).toBe(0)
    counter.num = 7
    expect(dummy).toBe(7)
    // 子级在 run 方法中创建的 effect 作用域也同时生效
    expect(doubled).toBe(14)

    // stop the nested scope as well
    scope.stop()

    counter.num = 6
    expect(dummy).toBe(7)
    // 子级创建的 effect 的作用域也收到父级的控制
    expect(doubled).toBe(14)
  })

  it('子级 effectScope 可以通过传递 detached 创建一个独立的 effect 作用域，从而摆脱父级 effectScope 的控制', () => {
    let dummy, doubled
    const counter = reactive({ num: 0 })

    const scope = new EffectScope()
    scope.run(() => {
      effect(() => (dummy = counter.num))
      // nested scope
      new EffectScope(true).run(() => {
        effect(() => (doubled = counter.num * 2))
      })
    })

    expect(scope.effects.length).toBe(1)

    expect(dummy).toBe(0)
    counter.num = 7
    expect(dummy).toBe(7)
    expect(doubled).toBe(14)

    scope.stop()

    counter.num = 6
    expect(dummy).toBe(7)

    // nested scope should not be stopped
    // 子级创建的 effect 是独立的，不受父级影响
    expect(doubled).toBe(12)
  })

  it('一个 effectScope 可以调用多个 run 方法', () => {
    let dummy, doubled
    const counter = reactive({ num: 0 })

    const scope = new EffectScope()
    scope.run(() => {
      effect(() => (dummy = counter.num))
    })

    expect(scope.effects.length).toBe(1)

    scope.run(() => {
      effect(() => (doubled = counter.num * 2))
    })

    expect(scope.effects.length).toBe(2)

    counter.num = 7
    expect(dummy).toBe(7)
    expect(doubled).toBe(14)

    scope.stop()
  })

  it('调用了 stop 方法的作用域不能再次调用 run 方法', () => {
    let dummy, doubled
    const counter = reactive({ num: 0 })

    const scope = new EffectScope()
    scope.run(() => {
      effect(() => (dummy = counter.num))
    })

    expect(scope.effects.length).toBe(1)

    scope.stop()

    scope.run(() => {
      effect(() => (doubled = counter.num * 2))
    })

    expect('[Vue warn] cannot run an inactive effect scope.').toHaveBeenWarned()

    expect(scope.effects.length).toBe(1)

    counter.num = 7
    // dummy 因为第一次调用 effect 的时候被复制，此时 dummy 为普通对象，不再有响应式
    expect(dummy).toBe(0)
    // doubled 因为第二次调用 effect 的时候，effect 不再工作，因此值为 undefined
    expect(doubled).toBe(undefined)
  })

  it('onScopeDispose 会在 effectScope 调用 stop 方法后被依次调用', () => {
    let dummy = 0

    const scope = new EffectScope()
    scope.run(() => {
      onScopeDispose(() => (dummy += 1))
      onScopeDispose(() => (dummy += 2))
    })

    scope.run(() => {
      onScopeDispose(() => (dummy += 4))
    })

    expect(dummy).toBe(0)

    scope.stop()
    expect(dummy).toBe(7)
  })

  it('onScopeDispose 需要在 scope 作用域内调用，否则报警告', () => {
    const spy = vi.fn()
    const scope = new EffectScope()
    scope.run(() => {
      onScopeDispose(spy)
    })

    // 没有调用 stop，所以不会调用 onScopeDispose
    expect(spy).toHaveBeenCalledTimes(0)

    // 在 effectScope 中调用的 onScopeDispose 不生效
    onScopeDispose(spy)

    expect(
      '[Vue warn] onScopeDispose() is called when there is no active effect scope to be associated with.',
    ).toHaveBeenWarned()

    scope.stop()
    // effectScope 失效的时候，onScopeDispose 被触发，导致 spy 函数被调用
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('子 effectScope 调用 stop 方法，子 effectScope 会被父 effectScope 移除', () => {
    const parent = new EffectScope()
    const child = parent.run(() => new EffectScope())!
    expect(parent.scopes!.includes(child)).toBe(true)
    child.stop()
    expect(parent.scopes!.includes(child)).toBe(false)
  })

  it('测试其他高级 API', async () => {
    const r = ref(1)

    const computedSpy = vi.fn()
    const watchSpy = vi.fn()
    const watchEffectSpy = vi.fn()

    let c: ComputedRef
    const scope = new EffectScope()
    scope.run(() => {
      c = computed(() => {
        computedSpy()
        return r.value + 1
      })

      watch(r, watchSpy)
      watchEffect(() => {
        watchEffectSpy()
        r.value
      })
    })

    // 获取计算属性 c
    c!.value // computed is lazy so trigger collection
    // 计算属性的 getter 方法被调用
    expect(computedSpy).toHaveBeenCalledTimes(1)
    // watch 监听不调用
    expect(watchSpy).toHaveBeenCalledTimes(0)
    expect(watchEffectSpy).toHaveBeenCalledTimes(1)

    r.value++
    c!.value
    await nextTick()
    expect(computedSpy).toHaveBeenCalledTimes(2)
    expect(watchSpy).toHaveBeenCalledTimes(1)
    expect(watchEffectSpy).toHaveBeenCalledTimes(2)

    scope.stop()

    // 设置原始 ref 的值
    r.value++
    // 读取计算属性的值
    c!.value
    await nextTick()
    // should not trigger anymore
    // getter、watch 和 watchEffect 都被调用
    expect(computedSpy).toHaveBeenCalledTimes(2)
    expect(watchSpy).toHaveBeenCalledTimes(1)
    expect(watchEffectSpy).toHaveBeenCalledTimes(2)
  })

  it('getCurrentScope() 在运行分离的嵌套 EffectScope 时保持有效', () => {
    const parentScope = new EffectScope()

    parentScope.run(() => {
      // 获取保持活跃的 scope， 此时活跃的 scope 即为 parentScope
      const currentScope = getCurrentScope()

      expect(currentScope).toBeDefined()
      const detachedScope = new EffectScope(true)
      detachedScope.run(() => {
        // 在这里，活跃的 scope 应当是独立的 detachedScope
        expect(getCurrentScope()).toBe(detachedScope)
      })

      expect(getCurrentScope()).toBe(currentScope)
    })
  })

  it('在活动作用域中调用分离作用域的。off 方法不应该破坏 currentScope', () => {
    const parentScope = new EffectScope()

    parentScope.run(() => {
      const childScope = new EffectScope(true)
      // 显式声明当前活跃的 scope 为 childScope
      childScope.on()
      expect(getCurrentScope()).toBe(childScope)
      // 显式声明当前活跃的 scope 为当前 scope 的父级
      childScope.off()
      expect(getCurrentScope()).toBe(parentScope)
    })
  })
})
