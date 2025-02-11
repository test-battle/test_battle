import { ConsoleUI } from './src/console/console'
import { BattleActions } from './src/effectBuilder/operator'
import { Selector, Extractor } from './src/effectBuilder/selector'
import { BattleSystem } from './src/core/battleSystem'
import { AttackTargetOpinion, StatTypeWithoutHp } from './src/core/const'
import { Effect, EffectTrigger } from './src/core/effect'
import { CreateStatStageMark, Mark } from './src/core/mark'
import { Nature } from './src/core/nature'
import { Species, Pet } from './src/core/pet'
import { Player } from './src/core/player'
import { Skill, Category } from './src/core/skill'
import { Element } from './src/core/element'
import { EffectContext, UseSkillContext, AddMarkContext } from '@/core/context'
import { BattleMessageType } from '@/core/message'

const swordsDance = new Skill.Builder()
  .withID('swords-dance')
  .withName('剑舞')
  .withSkillType(Category.Status) // 变化类技能
  .withType(Element.Normal) // 一般系
  .withPower(0) // 无直接伤害
  .withAccuracy(1) // 必定命中
  .withRageCost(10) // 消耗30怒气
  .withTarget(AttackTargetOpinion.self) // 目标为自身
  .addEffect(
    new Effect(
      'swords-dance-effect',
      EffectTrigger.BeforeAttack, // 在攻击前触发
      (ctx: EffectContext<EffectTrigger>) => {
        if (ctx.source instanceof Skill && ctx.parent instanceof UseSkillContext) {
          // 创建攻击+2的印记
          const atkUpMark = CreateStatStageMark(StatTypeWithoutHp.atk, 2)

          // 添加到使用者身上
          ctx.parent.pet.addMark(
            new AddMarkContext(
              ctx, // 父级上下文
              ctx.parent.pet, // 目标宠物
              atkUpMark, // 攻击强化印记
              2,
            ),
          )
          // 战斗信息提示
          ctx.battle.emitMessage(BattleMessageType.StatChange, {
            pet: ctx.parent.pet.name,
            stat: StatTypeWithoutHp.atk,
            stage: 2,
            reason: 'swords-dance',
          })
        }
      },
      100, // 高优先级确保先执行
    ),
  )
  .build()

const shiledDance = new Skill.Builder()
  .withID('shiled-dance')
  .withName('盾舞')
  .withSkillType(Category.Status) // 变化类技能
  .withType(Element.Normal) // 一般系
  .withPower(0) // 无直接伤害
  .withAccuracy(1) // 必定命中
  .withRageCost(10) // 消耗30怒气
  .withTarget(AttackTargetOpinion.self) // 目标为自身
  .addEffect(
    new Effect(
      'swords-dance-effect',
      EffectTrigger.BeforeAttack, // 在攻击前触发
      (ctx: EffectContext<EffectTrigger>) => {
        if (ctx.source instanceof Skill && ctx.parent instanceof UseSkillContext) {
          // 创建攻击+2的印记
          const atkUpMark = CreateStatStageMark(StatTypeWithoutHp.atk, -2)

          // 添加到使用者身上
          ctx.parent.pet.addMark(
            new AddMarkContext(
              ctx, // 父级上下文
              ctx.parent.pet, // 目标宠物
              atkUpMark, // 攻击强化印记
              2,
            ),
          )
          // 战斗信息提示
          ctx.battle.emitMessage(BattleMessageType.StatChange, {
            pet: ctx.parent.pet.name,
            stat: StatTypeWithoutHp.atk,
            stage: 2,
            reason: 'swords-dance',
          })
        }
      },
      100, // 高优先级确保先执行
    ),
  )
  .build()

const burn = new Mark(
  'burn',
  '烧伤',
  [
    new Effect(
      'shaoshang',
      EffectTrigger.TurnEnd,
      Selector.self.apply(BattleActions.dealDamage(Selector.self.select(Extractor.maxhp).divide(8))),
      0,
    ),
  ],
  {
    duration: 3,
    persistent: false,
    destoyable: true,
  },
)

const penshehuoyan = new Skill(
  'penshehuoyan',
  '喷射火焰',
  Category.Physical,
  Element.Fire,
  80,
  1,
  15,
  0,
  AttackTargetOpinion.opponent,
  1,
  false,
  [new Effect('pshy', EffectTrigger.PostDamage, Selector.foe.apply(BattleActions.addMark(burn, 1)), 1)],
)

// 妙蛙草系列
const venusaurSpecies: Species = {
  id: 'miaowahua',
  num: 1,
  name: '妙蛙草',
  type: Element.Grass,
  baseStats: {
    hp: 160,
    atk: 82,
    def: 83,
    spa: 100,
    spd: 100,
    spe: 80,
  },
}

const venusaur: Pet = new Pet(
  '叶之守护',
  venusaurSpecies,
  50,
  {
    hp: 252,
    atk: 0,
    def: 128,
    spa: 128,
    spd: 0,
    spe: 0,
  },
  {
    hp: 31,
    atk: 31,
    def: 31,
    spa: 31,
    spd: 31,
    spe: 31,
  },
  Nature.Modest,
  [penshehuoyan, new Skill('ee', '寄生种子', Category.Status, Element.Grass, 0, 1, 10, 1)],
)

// 皮卡丘系列
const pikachuSpecies: Species = {
  id: 'pikaqiu',
  num: 2,
  name: '皮卡丘',
  type: Element.Electric,
  baseStats: {
    hp: 35,
    atk: 55,
    def: 40,
    spa: 50,
    spd: 50,
    spe: 90,
  },
}

const thunderPikachu: Pet = new Pet(
  '闪电小子',
  pikachuSpecies,
  50,
  {
    hp: 0,
    atk: 0,
    def: 0,
    spa: 252,
    spd: 4,
    spe: 252,
  },
  {
    hp: 31,
    atk: 31,
    def: 31,
    spa: 31,
    spd: 31,
    spe: 31,
  },
  Nature.Timid,
  [
    new Skill('dd', '十万伏特', Category.Special, Element.Electric, 90, 1, 15, 1),
    new Skill('ff', '电光一闪', Category.Physical, Element.Normal, 40, 1, 30, 1),
  ],
)

// 耿鬼系列
const gengarSpecies: Species = {
  id: 'genggui',
  num: 514,
  name: '耿鬼',
  type: Element.Shadow,
  baseStats: {
    hp: 60,
    atk: 65,
    def: 60,
    spa: 130,
    spd: 75,
    spe: 110,
  },
}

const shadowGengar: Pet = new Pet(
  '暗影行者',
  gengarSpecies,
  50,
  {
    hp: 0,
    atk: 0,
    def: 0,
    spa: 252,
    spd: 4,
    spe: 252,
  },
  {
    hp: 31,
    atk: 31,
    def: 31,
    spa: 31,
    spd: 31,
    spe: 31,
  },
  Nature.Timid,
  [
    new Skill('ggsd', '暗影球', Category.Special, Element.Shadow, 80, 1, 15, 0),
    new Skill('cc', '污泥炸弹', Category.Special, Element.Grass, 90, 1, 10, 0),
  ],
)

// 快龙系列
const dragoniteSpecies: Species = {
  id: 'kuailong',
  num: 114,
  name: '快龙',
  type: Element.Dragon,
  baseStats: {
    hp: 91,
    atk: 134,
    def: 95,
    spa: 100,
    spd: 100,
    spe: 80,
  },
}

const stormDragon: Pet = new Pet(
  '暴风龙',
  dragoniteSpecies,
  50,
  {
    hp: 0,
    atk: 252,
    def: 0,
    spa: 0,
    spd: 4,
    spe: 252,
  },
  {
    hp: 31,
    atk: 31,
    def: 31,
    spa: 31,
    spd: 31,
    spe: 31,
  },
  Nature.Adamant,
  [penshehuoyan, swordsDance, shiledDance, new Skill('ll', '神速', Category.Physical, Element.Normal, 80, 1, 5, 2)],
)

const player2 = new Player('小茂', stormDragon, [stormDragon, shadowGengar])
const player1 = new Player('小智', venusaur, [venusaur, thunderPikachu])

const battle = new BattleSystem(player1, player2, {
  allowKillerSwitch: true,
})
const consoleui = new ConsoleUI(battle, player1, player2)
consoleui.run()
