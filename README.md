# pg-logical-replication

- PostgreSQL Logical Replication client for node.js

## 1. Install
- **pg-logical-replication** depends on [pq (node-postgres)](https://github.com/brianc/node-postgres).

```sh
$ npm install pg-logical-replication
```

## 2. LogicalReplication
```javascript
new LogicalReplication( object config ) : Stream
```
- Creates a new, unconnected instance of a logical replication stream configured via supplied configuration object.
- https://github.com/brianc/node-postgres/wiki/Client#parameters

```javascript
var LogicalReplication = require('pg-logical-replication');
var stream = new LogicalReplication({/*config*/});
```

## 3. Stream
### 3-1. Method - Stream.getChanges
- Start WAL streaming of changes.
```javascript
stream.getChanges( /*string*/ slotName, /*string*/ uptoLsn, /*object*/ option, /*function(err)*/ initialErrorCallback );
```
- ```uptoLsn``` can be null, the minimum value is "0/00000000".
- ```option``` can contain any of the following optional properties
    - ```includeXids``` : bool (default: false)
    - ```includeTimestamp``` : bool (default: false)
    - ```skipEmptyXacts``` : bool (default: true)

### 3-2. Method - Stream.stop
- Stop WAL streaming.
```javascript
stream.stop();
```

### 3-3. Event - Stream.on('data')
- Raised when new data streamed from PostgreSQL server.
```javascript
stream.on('data', (/*object*/ msg)=>{/*...*/});
```
- ```msg``` contains ```lsn (string)```, ```log (buffer)``` 

### 3-4. Event - Stream.on('error')
- Raised when error or disconnected.
```javascript
stream.on('error', (/*object*/ err)=>{/*...*/});
```

----

## Example
### PostgreSQL
- Create logical replication slot
```sql
SELECT * FROM pg_create_logical_replication_slot('test_slot', 'test_decoding');
```
- Delete logical replication slot
```sql
SELECT pg_drop_replication_slot('test_slot');
```