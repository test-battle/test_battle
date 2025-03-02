import { Effect, MarkInstance, Pet, Player, UseSkillContext } from '@test-battle/battle'
import {
  type baseMarkId,
  type effectId,
  EffectTrigger,
  type StatTypeOnBattle,
  StatTypeWithoutHp,
} from '@test-battle/const'
import { DataRepository } from '@test-battle/data-repository'
import {
  BaseSelector,
  ChainableSelector,
  type Condition,
  Conditions,
  createExtractor,
  type Evaluator,
  Extractor,
  Operators,
  type SelectorOpinion,
  type ValueSource,
} from '@test-battle/effect-builder'
import { RuntimeTypeChecker } from '@test-battle/effect-builder/runtime-type-checker'
import type {
  ActionDSL,
  ConditionDSL,
  EffectDSL,
  EvaluatorDSL,
  ExtractorDSL,
  SelectorChain,
  SelectorDSL,
  Value,
} from '@test-battle/effect-dsl'

export function parseEffect(dsl: EffectDSL): Effect<EffectTrigger> {
  const actions = createAction(dsl.apply)
  const condition = dsl.condition ? parseCondition(dsl.condition) : undefined
  return new Effect(dsl.id as effectId, dsl.trigger, actions, dsl.priority, condition)
}

export function parseSelector<T extends SelectorOpinion>(dsl: SelectorDSL): ChainableSelector<T> {
  // 解析基础选择器
  const baseSelector = typeof dsl === 'string' ? getBaseSelector(dsl) : getBaseSelector(dsl.base)

  // 处理链式操作
  if (typeof dsl !== 'string' && dsl.chain) {
    return dsl.chain.reduce(
      (selector, step) => applySelectorStep(selector, step),
      baseSelector as ChainableSelector<SelectorOpinion>,
    ) as ChainableSelector<T>
  }

  return baseSelector as ChainableSelector<T>
}

function getBaseSelector(selectorKey: string): ChainableSelector<SelectorOpinion> {
  if (!(selectorKey in BaseSelector)) {
    throw new Error(`未知的基础选择器: ${selectorKey}`)
  }
  return BaseSelector[selectorKey as keyof typeof BaseSelector]
}

function applySelectorStep(
  selector: ChainableSelector<SelectorOpinion>,
  step: SelectorChain,
): ChainableSelector<SelectorOpinion> {
  try {
    switch (step.type) {
      case 'select':
        return selector.select(parseExtractor(step.arg))

      case 'selectPath': {
        validatePath(selector, step.arg)
        return selector.selectPath(step.arg)
      }

      case 'selectProp': {
        if (process.env.NODE_ENV !== 'production') {
          validatePath(selector, step.arg)
        }

        return selector.selectProp(step.arg as keyof NonNullable<SelectorOpinion>) as ChainableSelector<SelectorOpinion>
      }

      case 'where':
        return selector.where(parseEvaluator(step.arg))

      case 'whereAttr':
        return selector.whereAttr(parseExtractor(step.extractor), parseEvaluator(step.condition))

      case 'and':
        return selector.and(parseSelector(step.arg).build())

      case 'or':
        return selector.or(parseSelector(step.arg).build(), step.duplicate ?? false)

      case 'randomPick':
        return selector.randomPick(step.arg)

      case 'randomSample':
        return selector.randomSample(step.arg)

      case 'sum': {
        assertNumberSelector(selector)
        return selector.sum()
      }

      case 'add': {
        assertNumberSelector(selector)
        return typeof step.arg === 'number' ? selector.add(step.arg) : selector.add(parseSelector<number>(step.arg))
      }

      case 'multiply': {
        assertNumberSelector(selector)
        return typeof step.arg === 'number'
          ? selector.multiply(step.arg)
          : selector.multiply(parseSelector<number>(step.arg))
      }

      case 'divide': {
        assertNumberSelector(selector)
        if (typeof step.arg === 'number' && step.arg === 0) {
          throw new Error('除数不能为0')
        }
        return typeof step.arg === 'number'
          ? selector.divide(step.arg)
          : selector.divide(parseSelector<number>(step.arg))
      }

      case 'shuffled':
        return selector.shuffled()

      case 'clampMax': {
        assertNumberSelector(selector)
        return selector.clampMax(step.arg)
      }

      case 'clampMin': {
        assertNumberSelector(selector)
        return selector.clampMax(step.arg)
      }

      default:
        throw new Error(`未知的操作类型: ${(step as any).type}`)
    }
  } catch (e) {
    throw new Error(`步骤[${step.type}]执行失败: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function assertNumberSelector(
  selector: ChainableSelector<SelectorOpinion>,
): asserts selector is ChainableSelector<number> {
  if (!selector.isNumberType()) {
    throw new Error(`数值操作需要选择器返回数字类型，当前类型为 ${selector.typePath}`)
  }
}

export function parseExtractor(dsl: ExtractorDSL) {
  switch (dsl.type) {
    case 'base':
      return Extractor[dsl.arg]
    case 'dynamic':
      return createExtractor(dsl.arg)
  }
}

function parseEvaluator(dsl: EvaluatorDSL): Evaluator<SelectorOpinion> {
  switch (dsl.type) {
    case 'compare':
      return Conditions.compare(
        dsl.operator,
        parseValue(dsl.value) as ValueSource<number>,
      ) as Evaluator<SelectorOpinion>
    case 'same':
      return Conditions.same(
        parseValue(dsl.value) as ValueSource<number | string | boolean>,
      ) as Evaluator<SelectorOpinion>
    case 'any':
      // 递归解析嵌套条件（OR 逻辑）
      return Conditions.any(...dsl.conditions.map(v => parseEvaluator(v)))
    case 'all':
      // 递归解析嵌套条件（AND 逻辑）
      return Conditions.all(...dsl.conditions.map(v => parseEvaluator(v)))
    case 'probability':
      return Conditions.probability(parseValue(dsl.percent) as ValueSource<number>)
    default: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw new Error(`Unknown condition type: ${(dsl as any).type}`)
    }
  }
}

export function createAction(dsl: ActionDSL) {
  switch (dsl.type) {
    case 'dealDamage':
      return parseDamageAction(dsl)
    case 'heal':
      return parseHealAction(dsl)
    case 'addMark':
      return parseAddMarkAction(dsl)
    case 'addStacks':
      return parseAddStacksAction(dsl)
    case 'consumeStacks':
      return parseConsumeStacksAction(dsl)
    case 'modifyStat':
      return parseModifyStatAction(dsl)
    case 'statStageBuff':
      return parseStatStageBuffAction(dsl)
    case 'addRage':
      return parseAddRageAction(dsl)
    case 'amplifyPower':
      return parseAmplifyPowerAction(dsl)
    case 'addPower':
      return parseAddPowerAction(dsl)
    case 'transferMark':
      return parseTransferMark(dsl)
  }
}

// Common value parser reused across actions [source_id: parse.ts]
export function parseValue(v: Value): string | number | boolean | ChainableSelector<SelectorOpinion> {
  if (v.type === 'raw:number') return v.value as number
  if (v.type === 'raw:string') return v.value as string
  if (v.type === 'raw:boolean') return v.value as boolean
  if (v.type === 'raw:markId') return v.value as string
  return parseSelector(v.selector)
}

export function isNumberValue(value: ValueSource<SelectorOpinion>): value is number {
  return typeof value === 'number'
}

export function parseDamageAction(dsl: Extract<ActionDSL, { type: 'dealDamage' }>) {
  const value = parseValue(dsl.value)
  if (!isNumberValue(value)) {
    throw new Error('Damage value must be a number')
  }
  return parseSelector<Pet>(dsl.target).apply(Operators.dealDamage(parseValue(dsl.value) as ValueSource<number>))
}

export function parseHealAction(dsl: Extract<ActionDSL, { type: 'heal' }>) {
  const selector = parseSelector<Pet>(dsl.target)
  return selector.apply(Operators.heal(parseValue(dsl.value) as ValueSource<number>))
}

export function parseAddMarkAction(dsl: Extract<ActionDSL, { type: 'addMark' }>) {
  const selector = parseSelector<Pet>(dsl.target)
  const mark = DataRepository.getInstance().getMark(dsl.mark as baseMarkId)
  return selector.apply(Operators.addMark(mark, dsl.duration))
}

// Pattern for stack-related actions [source_id: operator.ts]
export function parseAddStacksAction(dsl: Extract<ActionDSL, { type: 'addStacks' }>) {
  return parseSelector<MarkInstance>(dsl.target).apply(Operators.addStack(dsl.value))
}

export function parseConsumeStacksAction(dsl: Extract<ActionDSL, { type: 'consumeStacks' }>) {
  return parseSelector<MarkInstance>(dsl.target).apply(Operators.consumeStacks(dsl.value))
}

// Stat modification pattern [source_id: parse.ts]
export function parseModifyStatAction(dsl: Extract<ActionDSL, { type: 'modifyStat' }>) {
  return parseSelector<Pet>(dsl.target).apply(
    Operators.modifyStat(
      parseValue(dsl.statType) as ValueSource<StatTypeOnBattle>,
      parseValue(dsl.value) as ValueSource<number>,
      parseValue(dsl.percent) as ValueSource<number>,
    ),
  )
}

export function parseStatStageBuffAction(dsl: Extract<ActionDSL, { type: 'statStageBuff' }>) {
  return parseSelector<Pet>(dsl.target).apply(
    Operators.statStageBuff(
      parseValue(dsl.statType) as ValueSource<StatTypeWithoutHp>,
      parseValue(dsl.value) as ValueSource<number>,
    ),
  )
}

// Utility action handlers [source_id: operator.ts]
export function parseAddRageAction(dsl: Extract<ActionDSL, { type: 'addRage' }>) {
  return parseSelector<Player>(dsl.target).apply(Operators.addRage(parseValue(dsl.value) as ValueSource<number>))
}

export function parseAmplifyPowerAction(dsl: Extract<ActionDSL, { type: 'amplifyPower' }>) {
  return parseSelector<UseSkillContext>(dsl.target).apply(
    Operators.amplifyPower(parseValue(dsl.value) as ValueSource<number>),
  )
}

export function parseAddPowerAction(dsl: Extract<ActionDSL, { type: 'addPower' }>) {
  return parseSelector<UseSkillContext>(dsl.target).apply(
    Operators.addPower(parseValue(dsl.value) as ValueSource<number>),
  )
}

export function parseTransferMark(dsl: Extract<ActionDSL, { type: 'transferMark' }>) {
  return parseSelector<Pet>(dsl.target).apply(Operators.transferMark(parseValue(dsl.mark) as ValueSource<MarkInstance>))
}

export function parseCondition(dsl: ConditionDSL): Condition {
  const target = parseSelector(dsl.target)
  const evaluator = parseEvaluator(dsl.evaluator)
  return target.condition(evaluator)
}

function validatePath(selector: ChainableSelector<SelectorOpinion>, path: string) {
  if (!RuntimeTypeChecker.validatePath(selector.typePath, path)) {
    const expected = RuntimeTypeChecker.getExpectedType(selector.typePath, path)
    throw new Error(`[路径校验失败] 路径 '${path}' 在类型 ${selector.typePath} 中不存在\n预期类型: ${expected}`)
  }
}
