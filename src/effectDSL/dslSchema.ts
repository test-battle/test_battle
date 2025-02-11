// Generated by ts-to-zod
import { z } from 'zod'
import {
  type EffectDSL,
  type ActionDSL,
  type ConditionDSL,
  type SelectorDSL,
  type Value,
  type DynamicValue,
  type SelectorChain,
  EffectTrigger,
} from './dsl'
import { BaseSelector, Extractor } from '@/effectBuilder/selector'
import { Operators } from '@/effectBuilder/operator'

const selectorKeys = Object.keys(BaseSelector)
export const baseSelectorSchema = z.enum(selectorKeys as [keyof typeof BaseSelector])

const effectTriggerSchema = z.nativeEnum(EffectTrigger)

const opreatorKeys = Object.keys(Operators)
const operatorSchema = z.enum(opreatorKeys as [keyof typeof Operators])

const COMPARE_OPERATORS = ['>', '<', '>=', '<=', '=='] as const
const compareOperatorSchema = z.enum(COMPARE_OPERATORS)

const extractorKeys = Object.keys(Extractor)
const extractorSchema = z.enum(extractorKeys as [keyof typeof Extractor])

export const rawValueSchema = z.object({
  type: z.literal('raw'),
  value: z.union([z.number(), z.string()]),
})

export const effectDSLSchema: z.ZodSchema<EffectDSL> = z.lazy(() =>
  z.object({
    id: z.string(),
    trigger: effectTriggerSchema,
    priority: z.number(),
    apply: actionDSLSchema,
    condition: conditionDSLSchema.optional(),
    consumesStacks: z.number().optional(),
  }),
)

export const actionDSLSchema: z.ZodSchema<ActionDSL> = z.lazy(() =>
  z.object({
    operator: operatorSchema,
    target: selectorDSLSchema,
    args: z.array(valueSchema).optional(),
  }),
)

export const conditionDSLSchema: z.ZodSchema<ConditionDSL> = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal('compare'),
      target: z.string(),
      operator: compareOperatorSchema,
      value: valueSchema,
    }),
    z.object({
      type: z.literal('same'),
      value: valueSchema,
    }),
    z.object({
      type: z.literal('any'),
      conditions: z.array(conditionDSLSchema),
    }),
    z.object({
      type: z.literal('all'),
      conditions: z.array(conditionDSLSchema),
    }),
    z.object({
      type: z.literal('probability'),
      percent: valueSchema,
    }),
  ]),
)

export const selectorDSLSchema: z.ZodSchema<SelectorDSL> = z.lazy(() =>
  z.union([
    baseSelectorSchema,
    z.object({
      base: baseSelectorSchema,
      chain: z.array(selectorChainSchema),
    }),
  ]),
)

export const valueSchema: z.ZodSchema<Value> = z.lazy(() => z.union([rawValueSchema, dynamicValueSchema]))

export const dynamicValueSchema: z.ZodSchema<DynamicValue> = z.lazy(() =>
  z.object({
    type: z.literal('dynamic'),
    selector: selectorDSLSchema,
  }),
)

const selectorChainSchema: z.ZodSchema<SelectorChain> = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal('select'),
      arg: z.union([extractorSchema, z.string()]),
    }),
    z.object({
      type: z.literal('where'),
      arg: conditionDSLSchema,
    }),
  ]),
)
