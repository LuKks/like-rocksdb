const { RocksDatabase } = require('@harperfast/rocksdb-js')
const compact = require('compact-encoding')

// TODO: enableStats/getStats, aftercommit, useLog/addEntry/transactionLogRetention

module.exports = class RocksKV {
  constructor (dir, opts = {}) {
    if (dir instanceof RocksDatabase) {
      this.db = dir
    } else {
      this.db = new RocksDatabase(dir, {
        name: opts.name || 'default'
      })
    }

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

  use (name, opts = {}) {
    return new this.constructor(this.db.use(name, opts))
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

  async get (key, opts = {}) {
    const buffer = await this.db.get(key, opts)

    if (buffer === undefined) {
      return undefined
    }

    return compact.decode(compact.any, buffer)
  }

  async has (key, opts = {}) {
    const buffer = await this.db.get(key, opts)

    return buffer !== undefined
  }

  async remove (key, opts = {}) {
    await this.db.remove(key, opts)
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
    if (opts.name !== undefined) {
      const { name, ...scanOptions } = opts

      return this.use(name).scan(scanOptions)
    }

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

    if (opts.transaction) {
      range.transaction = opts.transaction
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
      return callback(transactionView(this, txn))
    })
  }

  async batch (operations) {
    await this.transaction(async txn => {
      for (const op of operations) {
        const db = op.name ? txn.use(op.name) : txn

        if (op.type === 'put') {
          await db.put(op.key, op.value)
        }

        if (op.type === 'remove') {
          await db.remove(op.key)
        }
      }
    })
  }
}

function transactionView (db, txn) {
  return {
    async get (key) {
      let buffer

      try {
        buffer = await db.db.get(key, { transaction: txn })
      } catch (error) {
        if (error?.message !== 'Result incomplete: no blocking io') throw error
      }

      if (buffer === undefined) {
        return undefined
      }

      return compact.decode(compact.any, buffer)
    },

    async has (key) {
      const value = await this.get(key)
      return value !== undefined
    },

    async put (key, value) {
      await db.put(key, value, { transaction: txn })
    },

    async remove (key) {
      await db.remove(key, { transaction: txn })
    },

    async scan (opts = {}) {
      return db.scan({ ...opts, transaction: txn })
    },

    use (name, opts = {}) {
      return transactionView(db.use(name, opts), txn)
    }
  }
}
