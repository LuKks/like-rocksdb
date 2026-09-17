# like-rocksdb

A small RocksDB-backed key-value store with compact-encoding serialization, range scans, transactions, and batch operations.

```sh
npm i like-rocksdb
```

https://rocksdb.org

## Usage

```js
const RocksDB = require('like-rocksdb')

main()

async function main () {
  const db = new RocksDB('./data', {
    name: 'users'
  })

  await db.ready()

  await db.put('user:1', {
    name: 'Alice',
    active: true
  })

  const user = await db.get('user:1')

  console.log(user)
  // { name: 'Alice', active: true }

  const exists = await db.has('user:1')

  console.log(exists)
  // true

  const entries = await db.scan({
    sub: 'user',
    limit: 100
  })

  console.log(entries)
  // [
  //   {
  //     key: 'user:1',
  //     value: { name: 'Alice', active: true }
  //   }
  // ]

  await db.close()
}
```

## API

### `new RocksDB(dir[, options])`

Creates a key-value database backed by RocksDB.

```js
const db = new RocksDB('./data', {
  name: 'users'
})
```

#### Parameters

- `dir` `string` — Directory used for the database.
- `options` `object` — Optional database settings.
- `options.name` `string` — Column family name. Defaults to `'default'`.

The database begins opening during construction. Use `await db.ready()` before performing database operations.

### `db.ready()`

Opens the database and returns a promise that resolves when the database is ready.

```js
await db.ready()
```

### `db.close()`

Closes the database.

```js
await db.close()
```

### `db.status`

Returns the current database status.

#### Returns

`string`

Possible values include:

- `'opened'`
- `'closed'`

### `db.name`

Returns the database column family name.

#### Returns

`string`

### `db.columns`

Returns the database columns exposed by the underlying RocksDB implementation.

#### Returns

`Array` or the value provided by the underlying database implementation.

### `db.put(key, value[, options])`

Stores a value under a key.

Values are serialized using `compact-encoding`. `undefined` cannot be stored.

```js
await db.put('user:1', {
  name: 'Alice'
}, {
  sync: true
})
```

#### Parameters

- `key` — Database key accepted by the underlying RocksDB implementation.
- `value` — Value to store. Must not be `undefined`.
- `options` `object` — Optional write settings.
- `options.transaction` — Optional transaction associated with the write.
- `options.sync` `boolean` — Whether the write should be synchronized before resolving.

#### Throws

An `Error` if `value` is `undefined`.

### `db.get(key)`

Retrieves and decodes a value.

```js
const value = await db.get('user:1')
```

#### Parameters

- `key` — Database key.

#### Returns

`Promise<any>`

Resolves to the decoded value, or `undefined` if the key does not exist.

### `db.has(key)`

Checks whether a key exists.

```js
const found = await db.has('user:1')
```

#### Parameters

- `key` — Database key.

#### Returns

`Promise<boolean>`

### `db.remove(key)`

Removes a key and its associated value.

```js
await db.remove('user:1')
```

### `db.clear()`

Deletes all entries while preserving the current column family.

```js
await db.clear()
```

### `db.drop()`

Deletes all entries and removes the current column family.

```js
await db.drop()
```

The database is closed after the column family is dropped.

### `db.purge()`

Destroys the entire database storage globally, including storage for all columns.

```js
await db.purge()
```

Use this method with care because it affects the complete database storage.

### `db.scan([options])`

Scans entries within an optional key range.

```js
const entries = await db.scan({
  gte: 'user:',
  lt: 'user; ',
  limit: 50
})
```

#### Parameters

- `options` `object` — Optional scan settings.
- `options.limit` `number` — Maximum number of entries to return. Defaults to `100`.
- `options.sub` `string` — Scans keys below the given slash-separated prefix.
- `options.gt` — Starts after this key.
- `options.gte` — Starts at or after this key.
- `options.lt` — Stops before this key.
- `options.lte` — Stops at or before this key.
- `options.reverse` `boolean` — Scans the range in reverse order.

The returned entries have the following structure:

```js
{
  key,
  value
}
```

Values are decoded using `compact-encoding`.

#### Returns

`Promise<Array<{ key, value }>>`

### `db.compact([options])`

Compacts part or all of the database.

```js
await db.compact({
  start: 'user:1',
  end: 'user:9'
})
```

#### Parameters

- `options` `object` — Optional compaction range.
- `options.start` — Start key for compaction.
- `options.end` — End key for compaction.

### `db.transaction(callback)`

Runs operations inside a database transaction.

```js
await db.transaction(async txn => {
  const user = await txn.get('user:1')

  if (user) {
    await txn.put('user:1', {
      ...user,
      active: false
    })
  }

  await txn.remove('user:old')
})
```

#### Parameters

- `callback` `Function` — Receives a transaction-scoped key-value API.

The callback receives an object with these methods:

- `txn.get(key)`
- `txn.has(key)`
- `txn.put(key, value)`
- `txn.remove(key)`

Transaction-scoped `put()` calls reject `undefined` values.

#### Returns

`Promise<any>`

Resolves with the value returned by `callback`.

### `db.batch(operations)`

Executes multiple `put` and `remove` operations in a single transaction.

```js
await db.batch([
  {
    type: 'put',
    key: 'user:1',
    value: {
      name: 'Alice'
    }
  },
  {
    type: 'remove',
    key: 'user:old'
  }
])
```

#### Parameters

- `operations` `Array<object>` — Operations to execute.
- `operation.type` `string` — Either `'put'` or `'remove'`.
- `operation.key` — Database key.
- `operation.value` — Value for `'put'` operations. Must not be `undefined`.

## License

MIT
