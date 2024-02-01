/**
 * Make a map and return a function for checking if a key
 * is in that map.
 * 创建一个 map 对象并返回一个函数来检查 key 是否在当前 map 对象中
 * IMPORTANT: all calls of this function must be prefixed with
 * \/\*#\_\_PURE\_\_\*\/
 * So that rollup can tree-shake them if necessary.
 * ‼️重要信息：在调用 makeMap 的时候，需要加上前缀【\/\*#\_\_PURE\_\_\*\/】以便 rollup 可以对其进行 tree-shaking
 * 因为这个函数会返回一个闭包函数，可能导致一些性能问题
 */
export function makeMap(
  str: string,
  expectsLowerCase?: boolean, // 期望小写
): (key: string) => boolean {
  const set = new Set(str.split(','))
  return expectsLowerCase
    ? val => set.has(val.toLowerCase())
    : val => set.has(val)
}
