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

  it('uses a valid Debian package name while retaining the Chinese launcher label', () => {
    const linux = JSON.parse(rootFile('src-tauri/tauri.linux.conf.json')) as {
      productName: string
      bundle: { linux: { deb: { desktopTemplate: string } } }
    }
    expect(linux.productName).toMatch(/^[a-z0-9][a-z0-9+.-]+$/)
    expect(rootFile(`src-tauri/${linux.bundle.linux.deb.desktopTemplate}`)).toContain('Name=口袋账本')
  })

  it('keeps release signing external to Git and enabled through environment variables', () => {
    const gradle = rootFile('src-tauri/gen/android/app/build.gradle.kts')
    const gitignore = rootFile('.gitignore')

    expect(gradle).toContain('ANDROID_KEYSTORE_PATH')
    expect(gradle).toContain('signingConfig = signingConfigs.getByName("release")')
    expect(gitignore).toContain('.release/')
  })
})
