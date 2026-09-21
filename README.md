# like-rocksdb

A small key-value store built on RocksDB, with compact encoding, range scans, transactions, and batch operations.

```sh
npm i like-rocksdb
```

https://rocksdb.org

## Usage

```js
import RocksDB from 'like-rocksdb'

const db = new RocksDB('./data')

await db.ready()

await db.put('/users/1', {
  name: 'Alice',
  active: true
})

const user = await db.get('/users/1')

console.log(user)
// { name: 'Alice', active: true }

const exists = await db.has('/users/1')

console.log(exists)
// true

const entries = await db.scan({
  sub: '/users',
  limit: 100
})

console.log(entries)
// [
//   {
//     key: '/users/1',
//     value: { name: 'Alice', active: true }
//   }
// ]

await db.close()
```

## API

### `new RocksDB(dir[, options])`

Creates a key-value database backed by RocksDB.

- `dir` — Folder where the data is saved.

```js
const db = new RocksDB('./data')
```

Options:

```js
{
  name: String // Column family name. Defaults to 'default'.
}
```

The database starts opening during construction. Use `await db.ready()` to wait until it is ready for operations.

### `await db.ready()`

Opens the database and resolves when it is ready for use.

### `await db.close()`

Closes the database.

### `db.status`

Returns the current database status.

Possible values are `'open'` and `'closed'`.

### `db.name`

Returns the database column family name.

### `db.columns`

Returns the database columns exposed by the underlying RocksDB implementation.

### `instance = db.use(name[, options])`

Returns a new database instance bound to another column family of the same underlying database.

- `name` — Column family name.

Options are passed to the underlying database.

```js
const users = db.use('users')

await users.put('/users/1', { name: 'Alice' })
```

### `await db.put(key, value[, options])`

Stores a value under a key.

- `key` — Database key accepted by the underlying RocksDB implementation.
- `value` — Value to store. Must not be `undefined`.

Values are serialized using `compact-encoding`.

Throws an error if `value` is `undefined`.

Options:

```js
{
  transaction, // Optional transaction associated with the write.
  sync: Boolean // Whether the write should be synchronized before resolving.
}
```

### `value = await db.get(key[, options])`

Retrieves and decodes a value.

- `key` — Database key.

Resolves to the decoded value, or `undefined` if the key does not exist.

Options:

```js
{
  transaction // Optional transaction to read within.
}
```

### `found = await db.has(key[, options])`

Checks whether a key exists.

- `key` — Database key.

Resolves to `true` or `false`.

Options:

```js
{
  transaction // Optional transaction to read within.
}
```

### `await db.remove(key[, options])`

Removes a key and its associated value.

- `key` — Database key.

Options:

```js
{
  transaction // Optional transaction to remove within.
}
```

### `await db.clear()`

Deletes all entries and keeps the current column family.

### `await db.drop()`

Deletes all entries and removes the current column family.

The database is closed after the column family is dropped.

### `await db.purge()`

Deletes the complete storage of the database, including the storage of all column families.

### `entries = await db.scan([options])`

Scans entries within an optional key range.

`sub` scans all keys below a prefix and builds the range internally.

```js
const entries = await db.scan({
  sub: '/users', // Equivalent to { gte: '/users/', lt: '/users0' }
  limit: 50
})
```

Use `gt`/`gte`/`lt`/`lte` for custom ranges only, for example to resume a scan after a given key.

```js
const entries = await db.scan({
  sub: '/users',
  gt: '/users/0a'
})
```

The scan reads keys in byte order. For this reason, plain integer ids sort as strings: `'/users/10'` and `'/users/100'` come before `'/users/2'`. Use [`lexicographic-integer`](https://github.com/hyperdivision/lexicographic-integer) to keep the numeric order.

```js
import lexint from 'lexicographic-integer'

await db.put('/users/' + lexint.pack(2, 'hex'), { name: 'Bob' })
await db.put('/users/' + lexint.pack(10, 'hex'), { name: 'Alice' })
await db.put('/users/' + lexint.pack(100, 'hex'), { name: 'Carol' })

const entries = await db.scan({ sub: '/users' })
// [
//   { key: '/users/02', value: { name: 'Bob' } },
//   { key: '/users/0a', value: { name: 'Alice' } },
//   { key: '/users/64', value: { name: 'Carol' } }
// ]
```

Options:

```js
{
  name: String, // Scans the column family with the given name.
  limit: Number, // Maximum number of entries to return. Defaults to 100.
  sub: String, // Scans keys below the given slash-separated prefix.
  gt, // Starts after this key.
  gte, // Starts at or after this key.
  lt, // Stops before this key.
  lte, // Stops at or before this key.
  reverse: Boolean, // Scans the range in reverse order.
  transaction // Scans within the given transaction.
}
```

The returned entries have the following structure:

```js
{
  key,
  value
}
```

Values are decoded using `compact-encoding`.

### `await db.compact([options])`

Compacts part or all of the database.

```js
await db.compact({
  start: '/users/1',
  end: '/users/9'
})
```

Options:

```js
{
  start, // Start key for compaction.
  end // End key for compaction.
}
```

### `await db.transaction(callback)`

Runs operations inside a database transaction.

- `callback` — Receives a transaction-scoped key-value API with `get`, `has`, `put`, `remove`, `scan` and `use`.

Resolves with the value returned by `callback`.

```js
await db.transaction(async txn => {
  const user = await txn.get('/users/1')

  if (user) {
    await txn.put('/users/1', {
      ...user,
      active: false
    })
  }

  await txn.remove('/users/old')
})
```

Transactions can span multiple column families with `txn.use(name)`. All writes commit together or not at all.

```js
await db.transaction(async txn => {
  const users = txn.use('users')
  const posts = txn.use('posts')

  await users.put('/users/1', { name: 'Alice' })
  await posts.put('/posts/1', { author: '/users/1' })
})
```

Transaction-scoped `put()` calls reject `undefined` values.

### `await db.batch(operations)`

Executes multiple `put` and `remove` operations in a single transaction.

- `operations` — Array of operations to execute.

```js
await db.batch([
  {
    type: 'put',
    key: '/users/1',
    value: {
      name: 'Alice'
    }
  },
  {
    type: 'remove',
    key: '/users/old'
  }
])
```

Each operation has the following shape:

```js
{
  type: String, // Either 'put' or 'remove'.
  key, // Database key.
  value, // Value for 'put' operations. Must not be undefined.
  name: String // Column family to run the operation against.
}
```

## License

MIT
