// using literal strings instead of numbers so that it's easier to inspect
// debugger events

// 读取响应式数据触发的事件类型
export enum TrackOpTypes {
  GET = 'get', // 获取
  HAS = 'has',
  ITERATE = 'iterate', // 遍历 or 迭代
}

// 修改响应式数据触发的事件类型
export enum TriggerOpTypes {
  SET = 'set', // 设置
  ADD = 'add', // 添加
  DELETE = 'delete', // 删除
  CLEAR = 'clear', // 获取
}

// 响应式标识
export enum ReactiveFlags {
  // SKIP = '__v_skip', // 不做任何处理，传递了这个标识，响应式处理不会生效
  // IS_REACTIVE = '__v_isReactive', // 是响应式对象
  // IS_READONLY = '__v_isReadonly', // 是只读的响应式对象
  // IS_SHALLOW = '__v_isShallow', // 是浅层次响应式对象
  // RAW = '__v_raw', // 原始对象标识

  // 用于标识一个对象是否不可被转为代理对象，对应的值是 __v_skip
  SKIP = '__v_skip',
  // 用于标识一个对象是否是响应式的代理，对应的值是 __v_isReactive
  IS_REACTIVE = '__v_isReactive',
  // 用于标识一个对象是否是只读的代理，对应的值是 __v_isReadonly
  IS_READONLY = '__v_isReadonly',
  // 用于标识一个对象是否为浅层代理，对应的值是 __v_isShallow
  IS_SHALLOW = '__v_isShallow',
  // 用于保存原始对象的 key，对应的值是 __v_raw
  RAW = '__v_raw',
}

// 脏检查的级别
export enum DirtyLevels {
  NotDirty = 0, // 值未被污染
  MaybeDirty = 1, // 值可能被污染了
  Dirty = 2, // 值已经污染了
}
