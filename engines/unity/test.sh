#!/bin/sh
# Builds the native library and runs the C# wrapper tests against it (needs the .NET SDK;
# DOTNET=/path/to/dotnet if it isn't on PATH).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
dotnet=${DOTNET:-dotnet}
out="$root/target/unity-tests"
cargo build --quiet --manifest-path "$root/Cargo.toml" -p chipforge
cargo run --quiet --manifest-path "$root/Cargo.toml" -p chipforge --example write_test_song -- "$out/test.chipsong"
"$dotnet" build --nologo -v quiet -o "$out/bin" "$here/tests/ChipForge.Tests.csproj"
cp "$root/target/debug/libchipforge.so" "$out/bin/" 2>/dev/null || cp "$root/target/debug/libchipforge.dylib" "$out/bin/"
"$dotnet" "$out/bin/ChipForge.Tests.dll" "$out/test.chipsong"
