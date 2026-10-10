#!/bin/sh
# Builds the extension and installs it into project/addons/chipforge/bin.
#   ./build.sh            debug build for this machine
#   ./build.sh --release
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
profile=debug
[ "${1:-}" = "--release" ] && profile=release
cargo build --manifest-path "$root/Cargo.toml" -p chipforge-godot $([ "$profile" = release ] && echo --release)
bin="$here/project/addons/chipforge/bin"
case "$(uname -s)" in
  Linux) cp "$root/target/$profile/libchipforge_godot.so" "$bin/" ;;
  Darwin) cp "$root/target/$profile/libchipforge_godot.dylib" "$bin/" ;;
  *) cp "$root/target/$profile/chipforge_godot.dll" "$bin/" ;;
esac
echo "installed into $bin"
