var LogicalReplication = require('../index.js');
var PluginTestDecoding = LogicalReplication.LoadPlugin('output/test_decoding');

var lastLsn = null; // or initialize LSN

var stream = (new LogicalReplication({}))
	.on('data', function(msg) {
		lastLsn = msg.lsn || lastLsn;

		var log = (msg.log || '').toString('utf8');
		try {
			console.log(PluginTestDecoding.parse(log));
			//DO SOMETHING. eg) replicate to other dbms(pgsql, mysql, ...)
		} catch (e) {
			console.log(log, e);
		}
	}).on('error', function(err) {
		console.log('Error #2', err);
		setTimeout(proc, 1000);
	});

(function proc() {
	stream.getChanges('test_slot', lastLsn, {
		includeXids: false, //default: false
		includeTimestamp: false, //default: false
		skipEmptyXacts: true, //default: true
	}, function(err) {
		if (err) {
			console.log('Logical replication initialize error', err);
			setTimeout(proc, 1000);
		}
	});
})();
