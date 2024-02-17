import type { Node } from '@babel/types'
import { unwrapTSNode } from '@vue/compiler-dom'
import type { ScriptCompileContext } from './context'
import { isCallOf } from './utils'
import { DEFINE_PROPS } from './defineProps'
import { DEFINE_EMITS } from './defineEmits'
import { DEFINE_EXPOSE } from './defineExpose'
import { DEFINE_SLOTS } from './defineSlots'

export const DEFINE_OPTIONS = 'defineOptions'

export function processDefineOptions(
  ctx: ScriptCompileContext,
  node: Node,
): boolean {
  if (!isCallOf(node, DEFINE_OPTIONS)) {
    return false
  }
  // 判断 defineOptions 是否重复调用
  if (ctx.hasDefineOptionsCall) {
    ctx.error(`duplicate ${DEFINE_OPTIONS}() call`, node)
  }
  // defineOptions 声明类型参数会报错
  if (node.typeParameters) {
    ctx.error(`${DEFINE_OPTIONS}() cannot accept type arguments`, node)
  }
  // defineOptions()
  if (!node.arguments[0]) return true

  ctx.hasDefineOptionsCall = true
  ctx.optionsRuntimeDecl = unwrapTSNode(node.arguments[0])

  let propsOption = undefined
  let emitsOption = undefined
  let exposeOption = undefined
  let slotsOption = undefined
  if (ctx.optionsRuntimeDecl.type === 'ObjectExpression') {
    for (const prop of ctx.optionsRuntimeDecl.properties) {
      if (
        (prop.type === 'ObjectProperty' || prop.type === 'ObjectMethod') &&
        prop.key.type === 'Identifier'
      ) {
        if (prop.key.name === 'props') propsOption = prop
        if (prop.key.name === 'emits') emitsOption = prop
        if (prop.key.name === 'expose') exposeOption = prop
        if (prop.key.name === 'slots') slotsOption = prop
      }
    }
  }

  // 针对 props 的报错
  if (propsOption) {
    ctx.error(
      `${DEFINE_OPTIONS}() cannot be used to declare props. Use ${DEFINE_PROPS}() instead.`,
      propsOption,
    )
  }
  // 针对 emits 的报错
  if (emitsOption) {
    ctx.error(
      `${DEFINE_OPTIONS}() cannot be used to declare emits. Use ${DEFINE_EMITS}() instead.`,
      emitsOption,
    )
  }
  // 针对 expose 的报错
  if (exposeOption) {
    ctx.error(
      `${DEFINE_OPTIONS}() cannot be used to declare expose. Use ${DEFINE_EXPOSE}() instead.`,
      exposeOption,
    )
  }
  // 针对插槽的报错
  if (slotsOption) {
    ctx.error(
      `${DEFINE_OPTIONS}() cannot be used to declare slots. Use ${DEFINE_SLOTS}() instead.`,
      slotsOption,
    )
  }

  return true
}
