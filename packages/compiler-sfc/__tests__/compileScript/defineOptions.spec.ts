import { assertCode, compileSFCScript as compile } from '../utils'
import { expect } from 'vitest'

describe('defineOptions()', () => {
  test('defineOptions 基本功能', () => {
    const { content } = compile(`
      <script setup>
      defineOptions({ name: 'FooApp' })
      </script>
    `)
    assertCode(content)

    expect(content).toMatchInlineSnapshot(`
      "
      export default /*#__PURE__*/Object.assign({ name: 'FooApp' }, {
        setup(__props, { expose: __expose }) {
        __expose();

            
            
      return {  }
      }

      })"
    `)

    // 编译产出应当移除 ‘defineOptions’
    expect(content).not.toMatch('defineOptions')
    // 编译产出符合预期
    // 在包含参数的时候，默认导出内容会基于 Object.assign 合并
    expect(content).toMatch(
      `export default /*#__PURE__*/Object.assign({ name: 'FooApp' }, `,
    )
  })

  test('defineOptions 参数为空的时候(defineOptions())不影响正常编译，只是产出结果不会包含默认导出', () => {
    // INFO: defineOptions({}) 都不属于这条测试用例
    const { content } = compile(`
      <script setup>
      defineOptions()
      </script>
    `)
    assertCode(content)

    expect(content).toMatchInlineSnapshot(`
      "
      export default {
        setup(__props, { expose: __expose }) {
        __expose();

            
            
      return {  }
      }

      }"
    `)

    expect(content).toMatch(`export default {`)
    // 参数为空的时候，‘defineOptions’ 也应当被移除
    expect(content).not.toMatch('defineOptions')
  })

  it('defineOptions 重复调用的时候报警告', () => {
    expect(() =>
      compile(`
      <script setup>
      defineOptions({ name: 'FooApp' })
      defineOptions({ name: 'BarApp' })
      </script>
      `),
    ).toThrowError('[@vue/compiler-sfc] duplicate defineOptions() call')
  })

  it('defineOptions 参数不能包含 props、emits 等包含 defineXXX 的参数，否则会报警告', () => {
    // INFO: 这里应该是为了隔离 Props 这些关键字，就将这些参数作为了保留字
    // ISSUE: 可能针对 defineProps 这些 API，也会做同样处理
    expect(() =>
      compile(`
      <script setup>
      defineOptions({ props: { foo: String } })
      </script>
      `),
    ).toThrowError(
      '[@vue/compiler-sfc] defineOptions() cannot be used to declare props. Use defineProps() instead.',
    )

    expect(() =>
      compile(`
      <script setup>
      defineOptions({ emits: ['update'] })
      </script>
    `),
    ).toThrowError(
      '[@vue/compiler-sfc] defineOptions() cannot be used to declare emits. Use defineEmits() instead.',
    )

    expect(() =>
      compile(`
      <script setup>
      defineOptions({ expose: ['foo'] })
      </script>
    `),
    ).toThrowError(
      '[@vue/compiler-sfc] defineOptions() cannot be used to declare expose. Use defineExpose() instead.',
    )

    expect(() =>
      compile(`
      <script setup>
      defineOptions({ slots: ['foo'] })
      </script>
    `),
    ).toThrowError(
      '[@vue/compiler-sfc] defineOptions() cannot be used to declare slots. Use defineSlots() instead.',
    )
  })

  it('defineOptions 指定类型会报错，这里可以判断 defineOptions 不能指定类型', () => {
    expect(() =>
      compile(`
      <script setup lang="ts">
      defineOptions<{ name: 'FooApp' }>()
      </script>
      `),
    ).toThrowError(
      '[@vue/compiler-sfc] defineOptions() cannot accept type arguments',
    )
  })

  it('defineOptions 不能用来声明 props，否则会报错', () => {
    expect(() =>
      compile(`
      <script setup lang="ts">
      defineOptions({ props: [] } as any)
      </script>
      `),
    ).toThrowError(
      '[@vue/compiler-sfc] defineOptions() cannot be used to declare props. Use defineProps() instead.',
    )
  })

  it('给 defineOptions 传递如下参数会报错：props/emits/slots/expose', () => {
    expect(() =>
      compile(`
        <script setup>
        defineOptions({ props: ['foo'] })
        </script>
      `),
    ).toThrowError(
      '[@vue/compiler-sfc] defineOptions() cannot be used to declare props. Use defineProps() instead',
    )

    expect(() =>
      compile(`
        <script setup>
        defineOptions({ emits: ['update'] })
        </script>
      `),
    ).toThrowError(
      '[@vue/compiler-sfc] defineOptions() cannot be used to declare emits. Use defineEmits() instead',
    )

    expect(() =>
      compile(`
        <script setup>
        defineOptions({ expose: ['foo'] })
        </script>
      `),
    ).toThrowError(
      '[@vue/compiler-sfc] defineOptions() cannot be used to declare expose. Use defineExpose() instead',
    )

    expect(() =>
      compile(`
        <script setup lang="ts">
        defineOptions({ slots: Object })
        </script>
      `),
    ).toThrowError(
      '[@vue/compiler-sfc] defineOptions() cannot be used to declare slots. Use defineSlots() instead',
    )
  })
})
