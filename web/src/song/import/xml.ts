// A small XML reader: elements, attributes and text, enough for MusicXML. (Browsers
// have DOMParser, but the importers also run in tests, and this keeps them plain code.)

export interface XmlElement {
  name: string
  attrs: Record<string, string>
  children: XmlElement[]
  text: string
}

export class XmlError extends Error {}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    return ENTITIES[e] ?? m
  })
}

export function parseXml(text: string): XmlElement {
  const root: XmlElement = { name: '#document', attrs: {}, children: [], text: '' }
  const stack = [root]
  let i = 0
  while (i < text.length) {
    const lt = text.indexOf('<', i)
    if (lt < 0) break
    if (lt > i) stack[stack.length - 1].text += decode(text.slice(i, lt))
    if (text.startsWith('<!--', lt)) {
      i = text.indexOf('-->', lt) + 3
    } else if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt)
      stack[stack.length - 1].text += text.slice(lt + 9, end)
      i = end + 3
    } else if (text[lt + 1] === '?' || text[lt + 1] === '!') {
      // <?xml …?> and <!DOCTYPE …> (MusicXML's doctype has no internal subset).
      i = text.indexOf('>', lt) + 1
    } else if (text[lt + 1] === '/') {
      const end = text.indexOf('>', lt)
      const name = text.slice(lt + 2, end).trim()
      if (stack.length < 2 || stack[stack.length - 1].name !== name) throw new XmlError(`Unexpected </${name}>`)
      stack.pop()
      i = end + 1
    } else {
      const end = findTagEnd(text, lt)
      const body = text.slice(lt + 1, end)
      const selfClosing = body.endsWith('/')
      const inner = selfClosing ? body.slice(0, -1) : body
      const name = /^[^\s/>]+/.exec(inner)?.[0] ?? ''
      const attrs: Record<string, string> = {}
      for (const m of inner.slice(name.length).matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
        attrs[m[1]] = decode(m[3] ?? m[4] ?? '')
      }
      const el: XmlElement = { name, attrs, children: [], text: '' }
      stack[stack.length - 1].children.push(el)
      if (!selfClosing) stack.push(el)
      i = end + 1
    }
    if (i <= 0) throw new XmlError('Unterminated markup')
  }
  if (stack.length > 1) throw new XmlError(`<${stack[stack.length - 1].name}> is never closed`)
  return root
}

/** Where a tag ends, skipping ">" inside quoted attribute values. */
function findTagEnd(text: string, from: number): number {
  let quote: string | null = null
  for (let i = from + 1; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '>') return i
  }
  throw new XmlError('Unterminated tag')
}

/** The first child called `name` (searching deeper with "a/b/c"). */
export function child(el: XmlElement | undefined, path: string): XmlElement | undefined {
  let at = el
  for (const name of path.split('/')) at = at?.children.find((c) => c.name === name)
  return at
}

export function children(el: XmlElement | undefined, name: string): XmlElement[] {
  return el?.children.filter((c) => c.name === name) ?? []
}

/** The trimmed text of a child, or undefined. */
export function textOf(el: XmlElement | undefined, path: string): string | undefined {
  const c = child(el, path)
  return c ? c.text.trim() : undefined
}
