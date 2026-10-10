#!/bin/sh
# Builds the shared library, compiles smoke.c against include/chipforge.h and runs it
# on a song exported by the Rust tests' song builder.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
out="$root/target/c-smoke"
mkdir -p "$out"
cargo build --quiet --manifest-path "$root/Cargo.toml" -p chipforge
cargo run --quiet --manifest-path "$root/Cargo.toml" -p chipforge --example write_test_song -- "$out/test.chipsong"
${CC:-cc} -std=c99 -Wall -Wextra -Werror -o "$out/smoke" "$here/smoke.c" -I"$here/../../include" -L"$root/target/debug" -lchipforge -lm
LD_LIBRARY_PATH="$root/target/debug" DYLD_LIBRARY_PATH="$root/target/debug" "$out/smoke" "$out/test.chipsong"
