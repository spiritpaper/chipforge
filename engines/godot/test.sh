#!/bin/sh
# Builds the extension and runs the headless checks in Godot.
#   GODOT=/path/to/godot ./test.sh
set -eu
here=$(cd "$(dirname "$0")" && pwd)
godot=${GODOT:-godot}
"$here/build.sh"
# The first run registers the extension and scans the project.
"$godot" --headless --path "$here/project" --import >/dev/null 2>&1 || true
"$godot" --headless --path "$here/project" --script res://tests/run_tests.gd
