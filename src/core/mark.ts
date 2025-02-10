import { Effect, type EffectContainer, EffectScheduler, EffectTrigger } from './effect'
import { AddMarkContext, type AllContext, EffectContext, TurnContext } from './context'
import { Pet } from './pet'
import { BattleSystem } from './battleSystem'
import { STAT_STAGE_MULTIPLIER, StatTypeOnBattle, type OwnedEntity, type Prototype } from './const'

export enum StackStrategy {
  'stack', // 叠加层数并刷新持续时间
  'refresh', // 保持层数但刷新持续时间
  'extend', // 叠加层数并延长持续时间
  'max', // 取最大层数并刷新持续时间
  'replace', // 完全替换为新的印记
}

export class Mark implements EffectContainer, Prototype, OwnedEntity {
  public _stacks: number = 1
  public duration: number
  public owner: Pet | BattleSystem | null = null
  public isActive: boolean = true

  constructor(
    public readonly id: string,
    public name: string,
    public readonly effects: Effect<EffectTrigger>[],
    public config: {
      duration?: number
      persistent?: boolean
      maxStacks?: number
      stackable?: boolean
      stackStrategy?: StackStrategy
      destoyable?: boolean
    } = {
      destoyable: true,
    },
    private readonly tags: string[] = [],
  ) {
    this.duration = config.duration ?? 3
    this.config.stackStrategy = config.stackStrategy ?? StackStrategy.stack
  }

  get stacks(): number {
    return this._stacks
  }

  set stacks(value: number) {
    this._stacks = value
  }

  setOwner(owner: BattleSystem | Pet): void {
    this.owner = owner
  }

  attachTo(target: Pet | BattleSystem) {
    this.owner = target
  }

  private detach() {
    if (this.owner) {
      this.owner.marks = this.owner.marks.filter(m => m !== this)
    }
    this.owner = null
  }

  update(ctx: TurnContext): boolean {
    if (!this.isActive) return true
    if (this.config.persistent) return false

    this.duration--
    const expired = this.duration <= 0

    if (expired) {
      this.destory(ctx)
    }

    return expired
  }

  addStack(value: number) {
    this.stacks = Math.min(this.config.maxStacks ?? Infinity, this.stacks + value)
  }

  tryStack(ctx: AddMarkContext): boolean {
    if (!this.isStackable) return false

    const maxStacks = this.config.maxStacks ?? Infinity
    const strategy = this.config.stackStrategy!
    const newMark = ctx.mark

    let newStacks = this.stacks
    let newDuration = this.duration

    ctx.battle.applyEffects(ctx, EffectTrigger.OnStack)

    switch (strategy) {
      case StackStrategy.stack:
        newStacks = Math.min(newStacks + newMark.stacks, maxStacks)
        newDuration = Math.max(newDuration, newMark.duration)
        break

      case StackStrategy.refresh:
        newDuration = Math.max(newDuration, newMark.duration)
        break

      case StackStrategy.extend:
        newStacks = Math.min(newStacks + newMark.stacks, maxStacks)
        newDuration += newMark.duration
        break

      case StackStrategy.max:
        newStacks = Math.min(Math.max(newStacks, newMark.stacks), maxStacks)
        newDuration = Math.max(newDuration, newMark.duration)
        break

      case StackStrategy.replace:
        newStacks = Math.min(newMark.stacks, maxStacks)
        newDuration = newMark.duration
        break
      default:
        return false
    }
    // 只有当数值发生变化时才更新
    const changed = newStacks !== this.stacks || newDuration !== this.duration
    this.stacks = newStacks
    this.duration = newDuration
    this.isActive = true

    return changed
  }

  consumeStacks(ctx: EffectContext<EffectTrigger>, amount: number): number {
    const actual = Math.min(amount, this.stacks)
    this.stacks -= actual

    if (this.stacks <= 0) {
      this.destory(ctx)
    }

    return actual
  }

  get isStackable() {
    if (this.config.stackable !== undefined) return this.config.stackable
    return false
  }

  collectEffects(trigger: EffectTrigger, baseContext: AllContext) {
    if (!this.isActive) return

    this.effects
      .filter(effect => effect.trigger === trigger)
      .forEach(effect => {
        const effectContext = new EffectContext(baseContext, trigger, this)
        if (!effect.condition || effect.condition(effectContext)) {
          EffectScheduler.getInstance().addEffect(effect, effectContext)
        }
      })
  }

  clone(ctx: AddMarkContext): Mark {
    ctx.battle.applyEffects(ctx, EffectTrigger.OnMarkCreate)
    const mark = new Mark(this.id, this.name, this.effects, this.config, this.tags)
    mark.stacks = this.stacks
    mark.duration = this.duration
    return mark
  }

  destory(ctx: EffectContext<EffectTrigger> | TurnContext | AddMarkContext) {
    if (!this.isActive || !this.config.destoyable) return
    this.isActive = false

    // 触发移除效果
    if (this.owner instanceof Pet) {
      ctx.battle.applyEffects(ctx, EffectTrigger.OnMarkDestroy)
      ctx.battle.cleanupMarks()
    }
  }
}

//能力强化印记
export class StatLevelMark extends Mark {
  constructor(
    public readonly statType: StatTypeOnBattle, // 改用StatTypeOnBattle类型
    public level: number,
    id: string,
    name: string,
    effects: Effect<EffectTrigger>[] = [],
    config: Mark['config'] = {},
  ) {
    super(
      id,
      name,
      effects,
      {
        ...config,
        persistent: true,
        maxStacks: 6,
        stackStrategy: StackStrategy.stack,
      },
      ['stat-stage'],
    )
  }

  tryStack(ctx: AddMarkContext): boolean {
    const isSameType = ctx.mark instanceof StatLevelMark && ctx.mark.statType === this.statType

    if (!isSameType) return super.tryStack(ctx)

    // 计算新等级
    const maxLevel = (STAT_STAGE_MULTIPLIER.length - 1) / 2
    const newLevel = Math.max(-maxLevel, Math.min(maxLevel, this.level + (ctx.mark as StatLevelMark).level))

    // 等级归零时标记为待移除
    if (newLevel === 0) {
      this.destory(ctx)
      return true
    }

    // 正常更新等级
    this.level = newLevel
    this.name = `${this.statType.toUpperCase()} ${this.level > 0 ? '+' : ''}${this.level}`

    if (this.owner instanceof Pet) {
      this.owner.statStage[this.statType] = this.level
    }

    return true
  }

  attachTo(target: Pet | BattleSystem) {
    super.attachTo(target)
    if (target instanceof Pet) {
      target.statStage[this.statType] = this.level
    }
  }

  get stacks() {
    return this.level
  }

  clone(ctx: AddMarkContext): StatLevelMark {
    ctx.battle.applyEffects(ctx, EffectTrigger.OnMarkCreate)
    const cloned = new StatLevelMark(this.statType, this.level, this.id, this.name, this.effects, this.config)
    return cloned
  }
}

export function CreateStatStageMark(statType: StatTypeOnBattle, level: number): StatLevelMark {
  return new StatLevelMark(
    statType,
    level,
    `stat-stage-${statType}-${level > 0 ? 'up' : 'down'}`,
    `${statType.toUpperCase()} ${level > 0 ? '+' : ''}${level}`,
    [], // 可添加额外效果
    {
      persistent: true,
      duration: -1,
      maxStacks: 6,
      stackStrategy: StackStrategy.stack,
    },
  )
}
