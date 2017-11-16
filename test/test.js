/*
 * Test progress
 * 1. Create logical replication slot with test_decoding output plugin : SELECT * FROM pg_create_logical_replication_slot('test_slot', 'test_decoding');
 * 2. Launch nodejs with this file : node test.js
 * 3. Modify data of database
 */
var LogicalReplication = require('../index.js'); //TODO: replace to 'pg-logical-replication'
var PluginTestDecoding = LogicalReplication.LoadPlugin('output/test_decoding');

//Connection parameter : https://node-postgres.com/features/connecting
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

function proc() {
	stream.getChanges('test_slot', lastLsn, {
		includeXids: false, //default: false
		includeTimestamp: false, //default: false
	}, function(err) {
		if (err) {
			console.trace('Logical replication initialize error', err);
			setTimeout(proc, 1000);
		}
	});
};
proc();
