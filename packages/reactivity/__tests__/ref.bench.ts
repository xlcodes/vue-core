import { bench, describe } from 'vitest'
import { ref } from '../src/index'

// 性能测试
describe('ref', () => {
  // 创建 ref
  bench('create ref', () => {
    ref(100)
  })

  // 创建一个局部作用域给 ref 赋值操作
  {
    let i = 0
    const v = ref(100)
    bench('write ref', () => {
      v.value = i++
    })
  }

  // 读取 ref
  {
    const v = ref(100)
    bench('read ref', () => {
      v.value
    })
  }

  // 写入 and 读取 ref
  {
    let i = 0
    const v = ref(100)
    bench('write/read ref', () => {
      v.value = i++

      v.value
    })
  }
})
