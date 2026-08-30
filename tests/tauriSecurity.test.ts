import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface TauriSecurityConfig {
  app: {
    security: {
      csp: Record<string, string[]>
      devCsp: Record<string, string[]>
      dangerousDisableAssetCspModification: boolean
    }
  }
}

const config = JSON.parse(readFileSync(
  new URL('../src-tauri/tauri.conf.json', import.meta.url),
  'utf8',
)) as TauriSecurityConfig

describe('Tauri content security policy', () => {
  it('blocks remote production content while preserving local IPC and app resources', () => {
    const { csp, dangerousDisableAssetCspModification } = config.app.security

    expect(csp['default-src']).toEqual(["'self'"])
    expect(csp['connect-src']).toEqual(["'self'", 'ipc:', 'http://ipc.localhost'])
    expect(csp['object-src']).toEqual(["'none'"])
    expect(csp['frame-ancestors']).toEqual(["'none'"])
    expect(csp['script-src']).toBeUndefined()
    expect(dangerousDisableAssetCspModification).toBe(false)
  })

  it('limits development network access to the local Vite server', () => {
    const { devCsp } = config.app.security

    expect(devCsp['connect-src']).toContain('http://localhost:1420')
    expect(devCsp['connect-src']).toContain('ws://localhost:1420')
    expect(devCsp['connect-src']).not.toContain('https:')
  })
})
