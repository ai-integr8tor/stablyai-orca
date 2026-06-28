import { describe, expect, it, expectTypeOf } from 'vitest'
import {
  BRIDGE_METHOD_CAPABILITY,
  BRIDGE_METHODS,
  isBridgeMethod,
  isHostCommand,
  isLifecycleEvent,
  type PluginContext,
  type WorkspaceSnapshot
} from './api-contract'
import { isPluginCapability } from './manifest'

describe('bridge method contract', () => {
  it('recognizes declared methods and rejects unknown ones', () => {
    expect(isBridgeMethod('workspace.getSnapshot')).toBe(true)
    expect(isBridgeMethod('workspace.nope')).toBe(false)
    expect(isBridgeMethod(123)).toBe(false)
  })

  it('maps every bridge method to a valid capability', () => {
    for (const method of BRIDGE_METHODS) {
      const cap = BRIDGE_METHOD_CAPABILITY[method]
      expect(isPluginCapability(cap)).toBe(true)
    }
  })
})

describe('host command + lifecycle guards', () => {
  it('recognizes allowlisted host commands', () => {
    expect(isHostCommand('open-external-url')).toBe(true)
    expect(isHostCommand('copy-to-clipboard')).toBe(true)
    expect(isHostCommand('rm-rf')).toBe(false)
  })

  it('recognizes lifecycle events', () => {
    expect(isLifecycleEvent('onWorkspaceChanged')).toBe(true)
    expect(isLifecycleEvent('onWhatever')).toBe(false)
  })
})

describe('context API is async for every host-backed accessor', () => {
  it('types host reads as Promise-returning (compile-time contract)', () => {
    expectTypeOf<PluginContext['workspace']['getSnapshot']>().returns.toEqualTypeOf<
      Promise<WorkspaceSnapshot>
    >()
    expectTypeOf<PluginContext['commands']['invokeHost']>().returns.toExtend<Promise<unknown>>()
    expectTypeOf<PluginContext['settings']['set']>().returns.toEqualTypeOf<Promise<void>>()
    expectTypeOf<PluginContext['settings']['get']>().returns.toExtend<Promise<unknown>>()
  })
})
