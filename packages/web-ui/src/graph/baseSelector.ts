import { LGraphNode, LiteGraph } from '@comfyorg/litegraph'
import type { BaseSelector } from '../../../effectBuilder'

/* ---------- BaseSelector 节点基类 ---------- */
export abstract class BaseSelectorNode extends LGraphNode {
  // 静态属性定义选择器类型，子类需要覆盖
  static selectorType: keyof typeof BaseSelector
  isBaseSelectorNode = true

  constructor() {
    super('BaseSelector')
    // 所有基础选择器节点只有一个输出端口
    this.addOutput('selector', 'base_selector')
    // 统一节点样式
    this.size = [120, 40]
    this.color = '#66ccff' // 基础选择器统一用蓝色系
  }

  onExecute() {
    this.setOutputData(0, (this.constructor as any).selectorType)
  }
}

/* ---------- 具体基础选择器节点实现 ---------- */

// 自身节点
export class SelfNode extends BaseSelectorNode {
  static selectorType = 'self' as const
  constructor() {
    super()
    this.title = '自身'
    this.addWidget('button', 'debug', 'self', () => {
      console.log(this.getOutputData(0))
    })
  }
}

// 目标节点
export class TargetNode extends BaseSelectorNode {
  static selectorType = 'target' as const
  constructor() {
    super()
    this.title = '当前目标'
  }
}

// 敌方节点
export class EnemyNode extends BaseSelectorNode {
  static selectorType = 'foe' as const
  constructor() {
    super()
    this.title = '敌方单位'
  }
}

// 宠物主人节点
export class PetOwnersNode extends BaseSelectorNode {
  static selectorType = 'petOwners' as const
  constructor() {
    super()
    this.title = '宠物主人'
    this.size[0] = 140 // 标题较长时调整宽度
  }
}

// 敌方主人节点
export class FoeOwnersNode extends BaseSelectorNode {
  static selectorType = 'foeOwners' as const
  constructor() {
    super()
    this.title = '敌方主人'
  }
}

// 技能使用上下文节点
export class UsingSkillContextNode extends BaseSelectorNode {
  static selectorType = 'usingSkillContext' as const
  constructor() {
    super()
    this.title = '技能上下文'
    this.size = [140, 40]
  }
}

// 伤害上下文节点
export class DamageContextNode extends BaseSelectorNode {
  static selectorType = 'damageContext' as const
  constructor() {
    super()
    this.title = '伤害上下文'
    this.size = [140, 40]
  }
}

// 标记节点
export class MarkNode extends BaseSelectorNode {
  static selectorType = 'mark' as const
  constructor() {
    super()
    this.title = '标记实体'
  }
}

// 己方标记节点
export class SelfMarksNode extends BaseSelectorNode {
  static selectorType = 'selfMarks' as const
  constructor() {
    super()
    this.title = '己方标记'
  }
}

// 敌方标记节点
export class FoeMarksNode extends BaseSelectorNode {
  static selectorType = 'foeMarks' as const
  constructor() {
    super()
    this.title = '敌方标记'
  }
}

/* ---------- 注册到 LiteGraph ---------- */
const BASE_SELECTOR_NODES = [
  SelfNode,
  TargetNode,
  EnemyNode,
  PetOwnersNode,
  FoeOwnersNode,
  UsingSkillContextNode,
  DamageContextNode,
  MarkNode,
  SelfMarksNode,
  FoeMarksNode,
]

export function IsBaseSelectorNode(node: LGraphNode): node is BaseSelectorNode {
  return BASE_SELECTOR_NODES.some(nodeClass => node instanceof nodeClass)
}

export function registerBaseSelectorNodes() {
  BASE_SELECTOR_NODES.forEach(nodeClass => {
    const typeName = `selector/base/${nodeClass.selectorType}`
    // 注册节点类型
    LiteGraph.registerNodeType(typeName, nodeClass)
  })
}
