import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const rootFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

describe('release configuration', () => {
  it('keeps the application version synchronized across all build systems', () => {
    const packageVersion = (JSON.parse(rootFile('package.json')) as { version: string }).version
    const tauriVersion = (JSON.parse(rootFile('src-tauri/tauri.conf.json')) as { version: string }).version
    const cargoVersion = /^version = "([^"]+)"/m.exec(rootFile('src-tauri/Cargo.toml'))?.[1]

    expect(packageVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(tauriVersion).toBe(packageVersion)
    expect(cargoVersion).toBe(packageVersion)
    const lock = JSON.parse(rootFile('package-lock.json')) as { version: string, packages: Record<string, { version: string }> }
    expect(lock.version).toBe(packageVersion)
    expect(lock.packages['']?.version).toBe(packageVersion)
    const rustLockVersion = /name = "pocketledger"\nversion = "([^"]+)"/.exec(rootFile('src-tauri/Cargo.lock'))?.[1]
    expect(rustLockVersion).toBe(packageVersion)
  })

  it('keeps release signing external to Git and enabled through environment variables', () => {
    const gradle = rootFile('src-tauri/gen/android/app/build.gradle.kts')
    const gitignore = rootFile('.gitignore')

    expect(gradle).toContain('ANDROID_KEYSTORE_PATH')
    expect(gradle).toContain('signingConfig = signingConfigs.getByName("release")')
    expect(gitignore).toContain('.release/')
  })
})
