const { RocksDatabase } = require('@harperfast/rocksdb-js')
const compact = require('compact-encoding')

// TODO: enableStats/getStats, aftercommit, useLog/addEntry/transactionLogRetention

module.exports = class RocksKV {
  constructor (dir, opts = {}) {
    this.db = new RocksDatabase(dir, {
      name: opts.name || 'default'
    })

    this.opened = false
    this.opening = this.ready()
    this.opening.then(() => {
      this.opened = true
    }).catch(() => {})
  }

  async ready () {
    if (this.opening) return this.opening

    this.db.open()
  }

  async close () {
    this.db.close()
  }

  get status () {
    return this.db.status // 'opened' | 'closed'
  }

  get name () {
    return this.db.name
  }

  get columns () {
    return this.db.columns
  }

  async put (key, value, opts = {}) {
    if (value === undefined) {
      throw new Error('Can not store undefined')
    }

    await this.db.put(key, compact.encode(compact.any, value), {
      transaction: opts.transaction,
      sync: opts.sync
    })
  }

  async get (key) {
    const buffer = await this.db.get(key)

    if (buffer === undefined) {
      return undefined
    }

    return compact.decode(compact.any, buffer)
  }

  async has (key) {
    const buffer = await this.db.get(key)

    if (buffer === undefined) {
      return false
    }

    return true
  }

  async remove (key) {
    await this.db.remove(key)
  }

  async clear () {
    // Deletes all entries but preserves the column family
    await this.db.clear()
  }

  async drop () {
    // Deletes all entries and its column family also
    await this.db.drop()
    this.db.close()
  }

  async purge () {
    // Deletes the entire storage globally for all columns
    this.db.destroy()
  }

  // TODO: Edge case with scan({ limit: 1 }) and pagination due inclusiveEnd defaulting true?
  async scan (opts = {}) {
    const limit = opts.limit || 100
    const range = { exclusiveStart: false, inclusiveEnd: true }

    if (opts.sub) {
      range.start = opts.sub + '/'
      range.end = opts.sub + '0'
      range.exclusiveStart = true
      range.inclusiveEnd = false
    }

    if (opts.gt && (!range.start || opts.gt > range.start)) {
      range.start = opts.gt
      range.exclusiveStart = true
    } else if (opts.gte && (!range.start || opts.gte >= range.start)) {
      range.start = opts.gte
      range.exclusiveStart = false
    }

    if (opts.lt && (!range.end || opts.lt < range.end)) {
      range.end = opts.lt
      range.inclusiveEnd = false
    } else if (opts.lte && (!range.end || opts.lte <= range.end)) {
      range.end = opts.lte
      range.inclusiveEnd = true
    }

    if (opts.reverse) {
      const start = range.start
      range.start = range.end
      range.end = start
      range.reverse = true
    }

    const entries = []

    for (const { key, value } of this.db.getRange(range)) {
      // TODO: Rename "key" to "id" and slice range.start from it
      // TODO: But probably needs option for custom key/value encoding e.g. to make "id" be an int
      // TODO: Mainly to avoid duplicating the key inside the value
      entries.push({ key, value: compact.decode(compact.any, value) })

      if (entries.length >= limit) {
        break
      }
    }

    return entries
  }

  async compact (opts = {}) {
    await this.db.compact({ start: opts.start, end: opts.end })
  }

  async transaction (callback) {
    return this.db.transaction(async txn => {
      const wrap = {
        async get (key) {
          let buffer
          try {
            buffer = await txn.get(key)
          } catch (error) {
            if (error?.message !== 'Result incomplete: no blocking io') throw error
          }

          if (buffer === undefined) {
            return undefined
          }

          return compact.decode(compact.any, buffer)
        },
        async has (key) {
          let buffer
          try {
            buffer = await txn.get(key)
          } catch (error) {
            if (error?.message !== 'Result incomplete: no blocking io') throw error
          }

          if (buffer === undefined) {
            return false
          }

          return true
        },
        async put (key, value) {
          if (value === undefined) {
            throw new Error('Can not store undefined')
          }

          await txn.put(key, compact.encode(compact.any, value))
        },
        async remove (key) {
          await txn.remove(key)
        }
      }

      return callback(wrap)
    })
  }

  async batch (operations) {
    await this.db.transaction(async txn => {
      for (const op of operations) {
        if (op.type === 'put') {
          if (op.value === undefined) {
            throw new Error('Can not store undefined')
          }

          await txn.put(op.key, compact.encode(compact.any, op.value))
        }

        if (op.type === 'remove') {
          await txn.remove(op.key)
        }
      }
    })
  }
}
