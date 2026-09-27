const compact = require('compact-encoding')

// Same type table as compact.any with a native bigint type appended (index 10),
// so values with u64/i64 amounts store without conversion.
// Indexes 0 to 9 match compact.any, so data encoded by it stays readable.
module.exports = createAny()

function createAny () {
  const anyArray = {
    preencode (state, arr) {
      compact.uint.preencode(state, arr.length)
      for (let i = 0; i < arr.length; i++) any.preencode(state, arr[i])
    },
    encode (state, arr) {
      compact.uint.encode(state, arr.length)
      for (let i = 0; i < arr.length; i++) any.encode(state, arr[i])
    },
    decode (state) {
      const arr = []
      let len = compact.uint.decode(state)
      while (len-- > 0) arr.push(any.decode(state))
      return arr
    }
  }

  const anyObject = {
    preencode (state, o) {
      const keys = Object.keys(o)
      compact.uint.preencode(state, keys.length)
      for (const key of keys) {
        compact.utf8.preencode(state, key)
        any.preencode(state, o[key])
      }
    },
    encode (state, o) {
      const keys = Object.keys(o)
      compact.uint.encode(state, keys.length)
      for (const key of keys) {
        compact.utf8.encode(state, key)
        any.encode(state, o[key])
      }
    },
    decode (state) {
      const o = {}
      let len = compact.uint.decode(state)
      while (len-- > 0) {
        const key = compact.utf8.decode(state)
        o[key] = any.decode(state)
      }
      return o
    }
  }

  const anyTypes = [
    compact.none,
    compact.bool,
    compact.string,
    compact.buffer,
    compact.uint,
    compact.int,
    compact.float64,
    anyArray,
    anyObject,
    compact.date,
    compact.bigint
  ]

  const any = {
    preencode (state, o) {
      const t = anyTypeOf(o)
      compact.uint.preencode(state, t)
      anyTypes[t].preencode(state, o)
    },
    encode (state, o) {
      const t = anyTypeOf(o)
      compact.uint.encode(state, t)
      anyTypes[t].encode(state, o)
    },
    decode (state) {
      const t = compact.uint.decode(state)
      if (t >= anyTypes.length) throw new Error('Unknown type: ' + t)
      return anyTypes[t].decode(state)
    }
  }

  return any
}

function anyTypeOf (o) {
  if (o === null || o === undefined) return 0
  if (typeof o === 'bigint') return 10
  if (typeof o === 'boolean') return 1
  if (typeof o === 'string') return 2
  if (Buffer.isBuffer(o) || o instanceof Uint8Array) return 3
  if (typeof o === 'number') {
    if (Number.isInteger(o)) return o >= 0 ? 4 : 5
    return 6
  }
  if (Array.isArray(o)) return 7
  if (o instanceof Date) return 9
  if (typeof o === 'object') return 8

  throw new Error('Unsupported type for ' + o)
}
