// src/stores/gameData.ts
import { defineStore } from 'pinia'
import { GameDataLoader } from '@/utils/gameLoader'
import type { SpeciesSchemaType, SkillSchemaType, MarkSchemaType, Effect } from '@arcadia-eternity/schema'

interface GameDataState {
  species: {
    byId: Record<string, SpeciesSchemaType>
    allIds: string[] // 维护有序ID列表
  }
  skills: {
    byId: Record<string, SkillSchemaType>
    allIds: string[]
  }
  marks: {
    byId: Record<string, MarkSchemaType>
    allIds: string[]
  }
  effects: {
    byId: Record<string, Effect>
    allIds: string[]
  }
  loaded: boolean
  gameDataLoaded: boolean
  error: string | null
}

export const useGameDataStore = defineStore('gameData', {
  state: (): GameDataState => ({
    loaded: false,
    error: null,
    species: {
      byId: {},
      allIds: [],
    },
    skills: {
      byId: {},
      allIds: [],
    },
    marks: {
      byId: {},
      allIds: [],
    },
    effects: {
      byId: {},
      allIds: [],
    },
    gameDataLoaded: false,
  }),

  getters: {
    speciesList: state => state.species.allIds.map(id => state.species.byId[id]),
    skillList: state => state.skills.allIds.map(id => state.skills.byId[id]),
    marksList: state => state.marks.allIds.map(id => state.marks.byId[id]),
    effectsList: state => state.effects.allIds.map(id => state.effects.byId[id]),
    getSpecies: state => (id: string) => state.species.byId[id],
    getSkill: state => (id: string) => state.skills.byId[id],
    getMark: state => (id: string) => state.marks.byId[id],
    getEffect: state => (id: string) => state.effects.byId[id],
  },

  actions: {
    async initialize() {
      if (this.loaded) return
      const loader = new GameDataLoader({
        devBasePath: '/data',
        prodBaseUrl: import.meta.env.VITE_API_BASE || '/data',
      })

      try {
        // 并行加载所有数据
        const [rawSpecies, rawSkills, rawMarks, rawEffects] = await Promise.all([
          this.loadSpecies(loader),
          this.loadSkills(loader),
          this.loadMarks(loader),
          this.loadEffects(loader),
        ])

        // 标准化数据结构
        this.species = this.normalizeData(rawSpecies)
        this.skills = this.normalizeData(rawSkills)
        this.marks = this.normalizeData(rawMarks)
        this.effects = this.normalizeData(rawEffects)

        // 验证数据完整性
        this.validateDataIntegrity()

        console.log('store installed')

        this.loaded = true
      } catch (error) {
        this.error = error instanceof Error ? error.message : '未知错误'
        throw error
      }
    },

    normalizeRecordData<T>(item: Record<string, T>) {
      return {
        byId: item,
        allIds: Object.keys(item),
      }
    },

    // 新增数据结构标准化方法
    normalizeData<T extends { id: string }>(
      items: T[],
    ): {
      byId: Record<string, T>
      allIds: string[]
    } {
      return {
        byId: items.reduce(
          (acc, item) => {
            if (acc[item.id]) {
              console.warn(`发现重复ID: ${item.id}`)
            }
            acc[item.id] = item
            return acc
          },
          {} as Record<string, T>,
        ),
        allIds: items.map(item => item.id),
      }
    },

    // 新增数据完整性检查
    validateDataIntegrity() {
      const validate = (data: { allIds: string[]; byId: Record<string, unknown> }, type: string) => {
        data.allIds.forEach(id => {
          if (!data.byId[id]) {
            throw new Error(`${type}数据不完整，缺失ID: ${id}`)
          }
        })
      }

      validate(this.species, '物种')
      validate(this.skills, '技能')
      validate(this.marks, '标记')
      validate(this.effects, '效果')
    },

    // 修改后的加载方法（保持返回原始数组）
    async loadSpecies(loader: GameDataLoader): Promise<SpeciesSchemaType[]> {
      const data = await loader.load<SpeciesSchemaType[]>('species')
      return data
    },

    async loadSkills(loader: GameDataLoader): Promise<SkillSchemaType[]> {
      const data = await loader.load<SkillSchemaType[]>('skill')
      return data
    },

    async loadMarks(loader: GameDataLoader): Promise<MarkSchemaType[]> {
      const [data, data1, data2, data3] = await Promise.all([
        loader.load<MarkSchemaType[]>('mark'),
        loader.load<MarkSchemaType[]>('mark_ability'),
        loader.load<MarkSchemaType[]>('mark_emblem'),
        loader.load<MarkSchemaType[]>('mark_global'),
      ])

      // 合并前检查ID冲突
      const allMarks = [...data, ...data1, ...data2, ...data3]
      const ids = new Set<string>()
      allMarks.forEach(mark => {
        if (ids.has(mark.id)) {
          throw new Error(`发现重复的Mark ID: ${mark.id}`)
        }
        ids.add(mark.id)
      })

      return allMarks
    },

    async loadEffects(loader: GameDataLoader): Promise<Effect[]> {
      const [data1, data2, data3, data4] = await Promise.all([
        loader.load<Effect[]>('effect_ability'),
        loader.load<Effect[]>('effect_emblem'),
        loader.load<Effect[]>('effect_mark'),
        loader.load<Effect[]>('effect_skill'),
      ])
      // 合并前检查ID冲突
      const allEffects = [...data1, ...data2, ...data3, ...data4]
      const ids = new Set<string>()
      allEffects.forEach(effect => {
        if (ids.has(effect.id)) {
          throw new Error(`发现重复的Effect ID: ${effect.id}`)
        }
        ids.add(effect.id)
      })
      return [...data1, ...data2, ...data3, ...data4]
    },
  },
})
