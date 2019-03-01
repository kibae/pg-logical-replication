# pg-logical-replication

- PostgreSQL Logical Replication client for node.js

## 1. Install
- **pg-logical-replication** depends on [pq (node-postgres)](https://github.com/brianc/node-postgres) >= 6.2.2

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
	- ```standbyMessageTimeout``` : maximum seconds between keepalive messages (default: 10) 
    - ```includeXids``` : bool (default: false)
    - ```includeTimestamp``` : bool (default: false)
	- ```queryOptions``` : object containing decoder specific options (optional)
		- ```'include-types': false```
		- ```'filter-tables': 'foo.bar'```

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

## 4. Plugin
### 4-1. test_decoding output
- If you are using ```test_decoding```, this plugin will be useful.
```javascript
var PluginTestDecoding = LogicalReplication.LoadPlugin('output/test_decoding');
PluginTestDecoding.parse(msg.log.toString('utf8'));
```


----

## Example
```javascript
/*
 * Test progress
 * 1. Create logical replication slot with test_decoding output plugin : SELECT * FROM pg_create_logical_replication_slot('test_slot', 'test_decoding');
 * 2. Launch nodejs with this file : node test.js
 * 3. Modify data of database
 */
var LogicalReplication = require('pg-logical-replication');
var PluginTestDecoding = LogicalReplication.LoadPlugin('output/test_decoding');

//Connection parameter : https://github.com/brianc/node-postgres/wiki/Client#parameters
var connInfo = {};

//Initialize with last LSN value
var lastLsn = null;

var stream = (new LogicalReplication(connInfo))
	.on('data', function(msg) {
		lastLsn = msg.lsn || lastLsn;

		var log = (msg.log || '').toString('utf8');
		try {
			console.log(PluginTestDecoding.parse(log));
			//TODO: DO SOMETHING. eg) replicate to other dbms(pgsql, mysql, ...)
		} catch (e) {
			console.trace(log, e);
		}
	}).on('error', function(err) {
		console.trace('Error #2', err);
		setTimeout(proc, 1000);
	});

(function proc() {
	stream.getChanges('test_slot', lastLsn, {
		includeXids: false, //default: false
		includeTimestamp: false, //default: false
	}, function(err) {
		if (err) {
			console.trace('Logical replication initialize error', err);
			setTimeout(proc, 1000);
		}
	});
})();
```

## PostgreSQL side
- postgresql.conf
```
wal_level = logical
max_wal_senders = [bigger than 1]
max_replication_slots = [bigger than 1]
```
- Create logical replication slot
```sql
SELECT * FROM pg_create_logical_replication_slot('test_slot', 'test_decoding');
```
- Delete logical replication slot
```sql
SELECT pg_drop_replication_slot('test_slot');
```
