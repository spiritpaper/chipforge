#!/bin/sh
# Gathers the docs website's source into one folder, for Jekyll to build:
#
#   site/build.sh _site_src      (from the repository root; the Pages workflow runs it)
#
# The Markdown files stay exactly as they are on GitHub, at the same paths, so their
# relative links work on both. Each page gets its title and its place in the menu added
# on top here, and links to repository files that aren't pages point at GitHub instead.
set -eu

out="$1"
repo="https://github.com/spiritpaper/chipforge"
rm -rf "$out"
mkdir -p "$out"
cp site/_config.yml "$out/"
cp -R site/_sass site/_includes site/images "$out/"

# page <source> <destination> <title> <menu position> [parent] [permalink]
page() {
  mkdir -p "$out/$(dirname "$2")"
  {
    printf -- '---\ntitle: "%s"\nnav_order: %s\n' "$3" "$4"
    [ -n "${5:-}" ] && printf 'parent: "%s"\n' "$5"
    [ -n "${6:-}" ] && printf 'permalink: %s\n' "$6"
    printf -- '---\n'
    printf '{%% raw %%}\n' # docs show {braces} in code; Liquid must leave them alone
    # Links to code, licenses and other non-page files go to GitHub. A link is
    # relative to the page's own folder, so resolve it from there.
    dir=$(dirname "$1")
    awk -v dir="$dir" -v repo="$repo" '
      function resolve(path,   n, parts, i, outp, k) {
        if (dir != ".") path = dir "/" path
        n = split(path, parts, "/"); k = 0
        for (i = 1; i <= n; i++) {
          if (parts[i] == "." || parts[i] == "") continue
          if (parts[i] == "..") { if (k > 0) k--; continue }
          outp[++k] = parts[i]
        }
        path = ""
        for (i = 1; i <= k; i++) path = path (i > 1 ? "/" : "") outp[i]
        return path
      }
      {
        line = $0; result = ""
        while (match(line, /\]\([^)#]+[)#]/)) {
          target = substr(line, RSTART + 2, RLENGTH - 3)
          tail = substr(line, RSTART + RLENGTH - 1, 1)
          # Only paths that exist in the repository: site links such as app/ stay.
          if (target !~ /^[a-z]+:/ && target !~ /\.md$/ && target !~ /^images\//) {
            path = resolve(target)
            if (system("test -e \"" path "\"") == 0) {
              kind = system("test -d \"" path "\"") == 0 ? "tree" : "blob"
              target = repo "/" kind "/main/" path
            }
          }
          result = result substr(line, 1, RSTART + 1) target tail
          line = substr(line, RSTART + RLENGTH)
        }
        print result line
      }' "$1"
    printf '\n{%% endraw %%}\n'
  } >"$out/$2"
}

page site/index.md                  index.md                        "Home"                1
page docs/guide/getting-started.md  docs/guide/getting-started.md   "Getting started"     2
page docs/guide/sound-effects.md    docs/guide/sound-effects.md     "Sound effects"       3
page docs/guide/compose.md          docs/guide/compose.md           "Composing"           4
page docs/guide/convert.md          docs/guide/convert.md           "Converting music"    5
page docs/guide/export.md           docs/guide/export.md            "Exporting"           6
page docs/guide/game-engines.md     docs/guide/game-engines.md      "Game engines"        7
page engines/godot/README.md        engines/godot/README.md         "Godot plugin"        1 "Game engines"
page engines/unity/README.md        engines/unity/README.md         "Unity package"       2 "Game engines"
page docs/guide/video-creators.md   docs/guide/video-creators.md    "For video creators"  8
page docs/guide/faq.md              docs/guide/faq.md               "FAQ"                 9
page desktop/README.md              desktop/README.md               "Desktop app"         10
page deploy/README.md               deploy/README.md                "Self-hosting"        11
page README.md                      README.md                       "For developers"      12 "" /developers/
page CONTRIBUTING.md                CONTRIBUTING.md                 "Contributing"        13
page LICENSING.md                   LICENSING.md                    "Licensing"           14
page THIRD_PARTY_NOTICES.md         THIRD_PARTY_NOTICES.md          "Third-party notices" 1 "Licensing"
page CODE_OF_CONDUCT.md             CODE_OF_CONDUCT.md              "Code of conduct"     15
page SECURITY.md                    SECURITY.md                     "Security"            16
page docs/CODE_SIGNING.md           docs/CODE_SIGNING.md            "Code signing policy" 1 "Security"
page docs/PLAN.md                   docs/PLAN.md                    "Roadmap"             17
page docs/DESIGN.md                 docs/DESIGN.md                  "Design system"       18

echo "site source in $out"
