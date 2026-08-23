#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
TAURI_DIR="$PROJECT_DIR/src-tauri"
SOURCE_SYSROOT="${TAURI_ARCH_RUST_SOURCE_SYSROOT:-/usr}"
SOURCE_LIBRARY="$SOURCE_SYSROOT/lib/rustlib/src/rust/library"

if [[ ! -f "$SOURCE_LIBRARY/Cargo.toml" ]]; then
  printf '%s\n' \
    '未找到与系统 Rust 匹配的标准库源码。' \
    'Manjaro/Arch 请先安装 rust-src：sudo pacman -S rust-src' \
    '此流程不安装或调用 rustup。' >&2
  exit 1
fi

ANDROID_SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-${HOME}/Android/Sdk}}"
if [[ ! -d "$ANDROID_SDK_DIR" ]]; then
  printf 'Android SDK 不存在：%s\n' "$ANDROID_SDK_DIR" >&2
  exit 1
fi

ANDROID_NDK_DIR="${NDK_HOME:-}"
if [[ -z "$ANDROID_NDK_DIR" ]]; then
  ANDROID_NDK_DIR="$(find "$ANDROID_SDK_DIR/ndk" -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null | sort -V | tail -n 1)"
fi
if [[ -z "$ANDROID_NDK_DIR" || ! -d "$ANDROID_NDK_DIR" ]]; then
  printf '没有在 Android SDK 中找到 NDK。\n' >&2
  exit 1
fi

JDK_DIR="${JAVA_HOME:-}"
if [[ -z "$JDK_DIR" ]]; then
  JAVA_BIN="$(readlink -f "$(command -v java)")"
  JDK_DIR="$(dirname "$(dirname "$JAVA_BIN")")"
fi
JAVA_MAJOR="$("$JDK_DIR/bin/java" -version 2>&1 | sed -n '1s/.*version "\([0-9]*\).*/\1/p')"
if [[ -z "$JAVA_MAJOR" || "$JAVA_MAJOR" -gt 21 ]]; then
  if [[ -x /usr/lib/jvm/java-21-openjdk/bin/java ]]; then
    JDK_DIR=/usr/lib/jvm/java-21-openjdk
  else
    printf '当前 Gradle 构建需要 JDK 17 或 21，检测到：%s\n' "${JAVA_MAJOR:-未知}" >&2
    exit 1
  fi
fi

HOST_TARGET="$(/usr/bin/rustc -vV | sed -n 's/^host: //p')"
SYSTEM_SYSROOT="$(/usr/bin/rustc --print sysroot)"
BUILD_SYSROOT="$TAURI_DIR/target/arch-android-sysroot"
mkdir -p "$BUILD_SYSROOT/lib/rustlib/aarch64-linux-android/lib"

if [[ ! -e "$BUILD_SYSROOT/lib/rustlib/$HOST_TARGET" ]]; then
  ln -s "$SYSTEM_SYSROOT/lib/rustlib/$HOST_TARGET" "$BUILD_SYSROOT/lib/rustlib/$HOST_TARGET"
fi
if [[ ! -e "$BUILD_SYSROOT/lib/rustlib/src" ]]; then
  ln -s "$SOURCE_SYSROOT/lib/rustlib/src" "$BUILD_SYSROOT/lib/rustlib/src"
fi

export ANDROID_HOME="$ANDROID_SDK_DIR"
export ANDROID_SDK_ROOT="$ANDROID_SDK_DIR"
export NDK_HOME="$ANDROID_NDK_DIR"
export JAVA_HOME="$JDK_DIR"
export TAURI_ARCH_SYSROOT="$BUILD_SYSROOT"
export PATH="$SCRIPT_DIR/arch-android-bin:$PATH"
export RUSTC="$SCRIPT_DIR/arch-android-bin/rustc"
export RUSTC_BOOTSTRAP=1
export CARGO_UNSTABLE_BUILD_STD='std,panic_abort'
export CARGO_PROFILE_DEV_DEBUG=0
export CARGO_PROFILE_DEV_STRIP='symbols'
export CC_aarch64_linux_android="$ANDROID_NDK_DIR/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android24-clang"
export AR_aarch64_linux_android="$ANDROID_NDK_DIR/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-ar"

if [[ ! -d "$TAURI_DIR/gen/android" ]]; then
  npm run tauri -- android init --ci --skip-targets-install
fi

npm run tauri -- android build --debug --apk --target aarch64 --ci "$@"
