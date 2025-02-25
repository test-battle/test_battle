import { defineStore } from 'pinia'
import { battleClient } from '../utils/battleClient'
import { type BattleState, type BattleMessage, BattleMessageType, type petId, type playerId } from '@test-battle/const'
import type { Player, PlayerSelection } from '@test-battle/schema'
import type { ErrorResponse, SuccessResponse } from '@test-battle/protocol'

export const useBattleStore = defineStore('battle', {
  state: () => ({
    battleSessionId: null as string | null,
    state: null as BattleState | null,
    log: [] as BattleMessage[],
    availableActions: [] as PlayerSelection[],
    isMatching: false,
    errorMessage: null as string | null,
    isBattleEnd: false,
    victor: '' as string | null,
    playerId: '',
    reconnectAttempts: 0, // 新增重连尝试次数
    lastRoomId: localStorage.getItem('lastBattleRoom') || null, // 持久化存储
  }),

  actions: {
    async joinMatchmaking(playerData: Player) {
      try {
        this.resetBattle()
        this.isMatching = true
        this.errorMessage = null
        this.playerId = playerData.id

        // 先注册匹配成功监听
        const matchPromise = new Promise<string>((resolve, reject) => {
          const successHandler = (res: SuccessResponse<{ roomId: string; opponent: { id: string; name: string } }>) => {
            if (res.status === 'SUCCESS') {
              resolve(res.data.roomId)
              this.handleMatchFound(res.data.roomId)
            }
          }

          const errorHandler = (err: ErrorResponse) => {
            reject(new Error(err.details || '匹配失败'))
          }

          // 使用once避免重复监听
          battleClient.once('matchSuccess', successHandler)
          battleClient.once('matchmakingError', errorHandler)

          // 设置超时
          setTimeout(() => {
            battleClient.off('matchSuccess', successHandler)
            battleClient.off('matchmakingError', errorHandler)
            reject(new Error('匹配超时'))
          }, 30000)
        })

        // 发起匹配请求（不等待立即返回的ACK）
        await battleClient.joinMatchmaking(playerData)
        const roomId = await matchPromise
        return this.initSession(roomId) // 返回 roomId
      } catch (err) {
        this.errorMessage = (err as Error).message || '匹配失败'
        this.isMatching = false
        throw err // 抛出错误供上层处理
      }
    },

    async cancelMatchmaking() {
      if (!this.battleSessionId) {
        await battleClient.cancelMatchmaking()
        this.isMatching = false
        this.resetBattle()
      }
    },

    async initSession(roomId: string) {
      this.battleSessionId = roomId
      this.state = null
      battleClient.on('battleEvent', (msg: BattleMessage) => {
        if (msg.type === 'BATTLE_STATE') this.state = msg.data
        this.handleBattleMessage(msg)
      })
      return roomId
    },

    handleMatchFound(roomId: string) {
      this.battleSessionId = roomId
      this.isMatching = false
    },

    resetBattle() {
      if (this.battleSessionId) {
        this.sendPlayerAction({
          source: this.playerId,
          type: 'surrender',
        })
      }

      this.battleSessionId = null
      this.state = null
      this.log = []
      this.availableActions = []
      this.isMatching = false
      this.isBattleEnd = false
      this.victor = ''
      this.clearPersistedSession()
    },

    async sendPlayerAction(selection: PlayerSelection) {
      try {
        await battleClient.sendPlayerAction(selection)
        this.availableActions = []
      } catch (err) {
        this.errorMessage = (err as Error).message
      }
    },

    // 新增战斗事件处理器
    async handleBattleMessage(msg: BattleMessage) {
      this.log.push(msg)

      switch (msg.type) {
        case BattleMessageType.BattleState:
          this.state = msg.data
          break

        case BattleMessageType.TurnAction:
          this.availableActions = await this.fetchAvailableSelection()
          break

        case BattleMessageType.ForcedSwitch:
          if (msg.data.player.includes(this.playerId as playerId)) {
            this.availableActions = await this.fetchAvailableSelection()
          }
        case BattleMessageType.FaintSwitch:
          if (msg.data.player === (this.playerId as playerId)) {
            this.availableActions = await this.fetchAvailableSelection()
          }
          break

        case BattleMessageType.BattleEnd:
          this.isBattleEnd = true
          this.victor = msg.data.winner
          break
      }
    },

    // 新增持久化方法
    persistSession() {
      if (this.battleSessionId && this.playerId) {
        localStorage.setItem('lastBattleRoom', this.battleSessionId)
        localStorage.setItem('lastPlayerId', this.playerId)
      }
    },

    clearPersistedSession() {
      localStorage.removeItem('lastBattleRoom')
      localStorage.removeItem('lastPlayerId')
      this.lastRoomId = null
      this.reconnectAttempts = 0
    },

    getPetById(petId: petId) {
      return this.state?.players
        .map(p => p.team)
        .flat()
        .find(p => p?.id === petId)
    },

    getPlayerById(playerId: playerId) {
      return this.state?.players.find(p => p.id === playerId)
    },

    getSkillInfo(skillId: string) {
      return (
        this.state?.players
          .flatMap(p => p.team)
          .flatMap(
            p =>
              p?.skills?.map(s => ({
                id: s?.id,
                name: s?.name || '未知技能',
                cost: s?.rage || 0,
              })) || [],
          )
          .find(s => s?.id === skillId) || { name: skillId, cost: 0 }
      )
    },

    async fetchAvailableSelection() {
      const res = await battleClient.getAvailableSelection()
      return res
    },
  },

  getters: {
    currentPlayer: state => state.state?.players.find(p => p.id === state.playerId),
    opponent: state => state.state?.players.find(p => p.id !== state.playerId),
  },
})
