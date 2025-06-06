import {
  type BattleState,
  type playerId,
  type PlayerTimerState,
  type TimerConfig,
  type Events,
} from '@arcadia-eternity/const'
import {
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SuccessResponse,
  type ErrorResponse,
} from '@arcadia-eternity/protocol'
import { type PlayerSchemaType, type PlayerSelectionSchemaType } from '@arcadia-eternity/schema'
import { io, type Socket } from 'socket.io-client'

type BattleClientOptions = {
  serverUrl: string
  autoReconnect?: boolean
  reconnectAttempts?: number
  actionTimeout?: number
}

type ClientState = {
  status: 'disconnected' | 'connecting' | 'connected'
  matchmaking: 'idle' | 'searching' | 'matched'
  battle: 'idle' | 'active' | 'ended'
  roomId?: string
  opponent?: { id: string; name: string }
}

export class BattleClient {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents>
  private eventHandlers = new Map<string, Set<(...args: any[]) => void>>()
  private timerEventHandlers = new Map<string, Set<(data: any) => void>>()
  private state: ClientState = {
    status: 'disconnected',
    matchmaking: 'idle',
    battle: 'idle',
  }
  private options: Required<BattleClientOptions>

  constructor(options: BattleClientOptions) {
    this.options = {
      autoReconnect: true,
      reconnectAttempts: 5,
      actionTimeout: 30000,
      ...options,
    }

    this.socket = io(this.options.serverUrl, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: this.options.autoReconnect,
      reconnectionAttempts: this.options.reconnectAttempts,
      reconnectionDelay: 1000,
    })

    this.setupEventListeners()
  }

  // 公开的状态获取方法
  get currentState() {
    return { ...this.state }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket.connected) return resolve()

      const connectTimeout = setTimeout(() => {
        reject(new Error('Connection timeout'))
      }, this.options.actionTimeout)

      this.socket.once('connect', () => {
        clearTimeout(connectTimeout)
        this.updateState({ status: 'connected' })
        // 连接成功后立即获取服务器状态
        this.socket.emit('getServerState', response => {
          if (response.status === 'SUCCESS') {
            this.eventHandlers.get('updateState')?.forEach(handler => handler(response.data))
          }
        })
        resolve()
      })

      this.socket.once('connect_error', error => {
        clearTimeout(connectTimeout)
        reject(error)
      })

      this.updateState({ status: 'connecting' })
      this.socket.connect()
    })
  }

  disconnect() {
    this.socket.disconnect()
    this.updateState({
      status: 'disconnected',
      matchmaking: 'idle',
      battle: 'idle',
    })
  }

  async joinMatchmaking(playerData: PlayerSchemaType): Promise<void> {
    this.verifyConnection()
    this.updateState({ matchmaking: 'searching' })

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Matchmaking timeout'))
      }, this.options.actionTimeout)

      this.socket.emit('joinMatchmaking', playerData, response => {
        clearTimeout(timeout)
        this.handleMatchmakingResponse(response, resolve, reject)
      })
    })
  }

  async cancelMatchmaking(): Promise<void> {
    if (this.state.matchmaking !== 'searching') {
      throw new Error('当前没有在匹配队列中')
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('取消匹配超时'))
      }, this.options.actionTimeout)

      this.socket.emit('cancelMatchmaking', response => {
        clearTimeout(timeout)
        if (response.status === 'SUCCESS') {
          this.updateState({
            matchmaking: 'idle',
            roomId: undefined,
            opponent: undefined,
          })
          resolve()
        } else {
          reject(this.parseError(response))
        }
      })
    })
  }

  async sendplayerSelection(selection: PlayerSelectionSchemaType): Promise<void> {
    this.verifyBattleActive()

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Action timeout'))
      }, this.options.actionTimeout)

      this.socket.emit('submitPlayerSelection', selection, response => {
        clearTimeout(timeout)
        if (response.status === 'SUCCESS') {
          resolve()
        } else {
          reject(this.parseError(response))
        }
      })
    })
  }

  async getBattleState(): Promise<BattleState> {
    this.verifyBattleActive()

    return new Promise((resolve, reject) => {
      this.socket.emit('getState', response => {
        if (response.status === 'SUCCESS') {
          // 添加类型断言和空值检查
          if (!response.data) {
            reject(new Error('Invalid battle state response'))
            return
          }
          resolve(response.data as BattleState)
        } else {
          reject(this.parseError(response))
        }
      })
    })
  }

  async getAvailableSelection(): Promise<PlayerSelectionSchemaType[]> {
    this.verifyBattleActive()

    return new Promise((resolve, reject) => {
      this.socket.emit('getAvailableSelection', response => {
        if (response.status === 'SUCCESS') {
          // 添加类型断言和空值检查
          const data = response.data as PlayerSelectionSchemaType[] | undefined
          resolve(data || [])
        } else {
          reject(this.parseError(response))
        }
      })
    })
  }

  async ready(): Promise<void> {
    return new Promise(resolve => {
      this.socket.emit('ready')
      resolve()
    })
  }

  // 计时器相关方法
  async isTimerEnabled(): Promise<boolean> {
    this.verifyBattleActive()

    return new Promise((resolve, reject) => {
      this.socket.emit('isTimerEnabled', response => {
        if (response.status === 'SUCCESS') {
          resolve(response.data)
        } else {
          reject(this.parseError(response))
        }
      })
    })
  }

  async getPlayerTimerState(playerId: playerId): Promise<PlayerTimerState | null> {
    this.verifyBattleActive()

    return new Promise((resolve, reject) => {
      this.socket.emit('getPlayerTimerState', { playerId }, response => {
        if (response.status === 'SUCCESS') {
          resolve(response.data)
        } else {
          reject(this.parseError(response))
        }
      })
    })
  }

  async getAllPlayerTimerStates(): Promise<PlayerTimerState[]> {
    this.verifyBattleActive()

    return new Promise((resolve, reject) => {
      this.socket.emit('getAllPlayerTimerStates', response => {
        if (response.status === 'SUCCESS') {
          resolve(response.data)
        } else {
          reject(this.parseError(response))
        }
      })
    })
  }

  async getTimerConfig(): Promise<TimerConfig> {
    this.verifyBattleActive()

    return new Promise((resolve, reject) => {
      this.socket.emit('getTimerConfig', response => {
        if (response.status === 'SUCCESS') {
          resolve(response.data)
        } else {
          reject(this.parseError(response))
        }
      })
    })
  }

  async startAnimation(source: string, expectedDuration: number, ownerId: playerId): Promise<string> {
    this.verifyBattleActive()

    return new Promise((resolve, reject) => {
      this.socket.emit('startAnimation', { source, expectedDuration, ownerId }, response => {
        if (response.status === 'SUCCESS') {
          resolve(response.data)
        } else {
          reject(this.parseError(response))
        }
      })
    })
  }

  async endAnimation(animationId: string, actualDuration?: number): Promise<void> {
    this.verifyBattleActive()

    return new Promise(resolve => {
      this.socket.emit('endAnimation', { animationId, actualDuration })
      resolve()
    })
  }

  once<T extends keyof ServerToClientEvents>(event: T, listener: ServerToClientEvents[T]): this {
    this.socket.once(event, listener as any)
    return this
  }

  on<T extends keyof ServerToClientEvents>(
    event: T,
    handler: (...args: Parameters<ServerToClientEvents[T]>) => void,
  ): () => void {
    // 使用类型安全的包装函数
    const wrapper = (...args: Parameters<ServerToClientEvents[T]>) => handler(...args)

    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
      this.socket.on(event, wrapper as any) // 使用安全类型断言
    }

    this.eventHandlers.get(event)?.add(wrapper)
    return () => this.off(event, wrapper)
  }

  off<T extends keyof ServerToClientEvents>(
    event: T,
    handler: (...args: Parameters<ServerToClientEvents[T]>) => void,
  ): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      handlers.forEach(h => {
        if (h === handler) {
          this.socket.off(event, h as any) // 使用安全类型断言
          handlers.delete(h)
        }
      })
    }
  }

  // 计时器事件订阅方法
  onTimerEvent<K extends keyof Events>(eventType: K, handler: (data: Events[K]) => void): () => void {
    if (!this.timerEventHandlers.has(eventType)) {
      this.timerEventHandlers.set(eventType, new Set())
    }

    this.timerEventHandlers.get(eventType)?.add(handler)

    return () => this.offTimerEvent(eventType, handler)
  }

  offTimerEvent<K extends keyof Events>(eventType: K, handler: (data: Events[K]) => void): void {
    const handlers = this.timerEventHandlers.get(eventType)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.timerEventHandlers.delete(eventType)
      }
    }
  }

  private setupEventListeners() {
    // 连接状态事件
    this.socket.on('connect', () => {
      this.updateState({ status: 'connected' })
    })

    this.socket.on('disconnect', reason => {
      this.updateState({
        status: 'disconnected',
        matchmaking: 'idle',
        battle: 'idle',
      })
    })

    // 游戏事件
    this.socket.on('matchSuccess', response => {
      if (response.status === 'SUCCESS') {
        this.updateState({
          matchmaking: 'matched',
          battle: 'active',
          roomId: response.data.roomId,
          opponent: response.data.opponent,
        })
      }
    })

    this.socket.on('battleEvent', message => {
      if (message.type === 'BATTLE_END') {
        this.updateState({ battle: 'ended' })
      }
    })

    // 计时器事件处理
    this.socket.on('timerEvent', event => {
      const handlers = this.timerEventHandlers.get(event.type)
      if (handlers) {
        handlers.forEach(handler => handler(event.data))
      }
    })

    // 心跳处理
    this.socket.on('ping', () => this.socket.emit('pong'))
  }

  private updateState(partialState: Partial<ClientState>) {
    this.state = { ...this.state, ...partialState }
  }

  private verifyConnection() {
    if (!this.socket.connected) {
      throw new Error('Not connected to server')
    }
  }

  private verifyBattleActive() {
    this.verifyConnection()
    if (this.state.battle !== 'active') {
      throw new Error('Battle is not active')
    }
  }

  private handleMatchmakingResponse(
    response: SuccessResponse<{ status: 'QUEUED' }> | ErrorResponse,
    resolve: () => void,
    reject: (error: Error) => void,
  ) {
    if (response.status === 'SUCCESS') {
      // 确认协议中返回的数据结构
      if (!response.data) {
        reject(new Error('Invalid matchmaking response'))
        return
      }
      resolve()
    } else {
      this.updateState({ matchmaking: 'idle' })
      reject(this.parseError(response))
    }
  }

  private parseError(response: ErrorResponse): Error {
    return new Error(response.details ? `${response.code}: ${response.details}` : response.code)
  }
}
