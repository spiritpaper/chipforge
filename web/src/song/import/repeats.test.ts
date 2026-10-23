import { describe, expect, it } from 'vitest'
import { playOrder } from './repeats'
import { parseXml, textOf, child } from './xml'

describe('playOrder', () => {
  it('plays a repeated section twice', () => {
    expect(playOrder([{ forward: true }, { backward: 2 }, {}])).toEqual([0, 1, 0, 1, 2])
  })

  it('repeats from the start when there is no start sign', () => {
    expect(playOrder([{}, { backward: 2 }])).toEqual([0, 1, 0, 1])
  })

  it('takes first and second endings', () => {
    const bars = [{ forward: true }, {}, { endings: [1], backward: 2 }, { endings: [2] }, {}]
    expect(playOrder(bars)).toEqual([0, 1, 2, 0, 1, 3, 4])
  })

  it('handles two repeats in a row and play counts', () => {
    expect(playOrder([{ backward: 2 }, { forward: true }, { backward: 3 }])).toEqual([0, 0, 1, 2, 1, 2, 1, 2])
  })
})

describe('parseXml', () => {
  it('reads elements, attributes, entities, comments and CDATA', () => {
    const doc = parseXml('<?xml version="1.0"?><!DOCTYPE x><a b="1 &amp; 2" c=\'>\'><!-- hi --><d>R&amp;B</d><e/><f><![CDATA[<raw>]]></f></a>')
    const a = child(doc, 'a')!
    expect(a.attrs).toEqual({ b: '1 & 2', c: '>' })
    expect(textOf(a, 'd')).toBe('R&B')
    expect(child(a, 'e')).toBeDefined()
    expect(textOf(a, 'f')).toBe('<raw>')
  })

  it('rejects broken markup', () => {
    expect(() => parseXml('<a><b></a>')).toThrow()
    expect(() => parseXml('<a>')).toThrow()
  })
})
