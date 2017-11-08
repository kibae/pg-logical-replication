/**
 * Copyright (c) 2017- Kibae Shin (nonunnet@gmail.com)
 * All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * README.md file in the root directory of this source tree.
 */
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var pg = require('pg');

var LogicalReplication = function(config) {
	EventEmitter.call(this);
	var self = this;

	config = config || {};
	config.replication = 'database';

	var client;
	var stoped = false;

	this.getChanges = function(slotName, uptoLsn, option, cb /*(start_err)*/) {
		if (client) {
			client.removeAllListeners();
			client.end();
			client = null;
		}
		option = option || {};
		/*
		 * includeXids : include xid on BEGIN and COMMIT, default false
		 * includeTimestamp : include timestamp on COMMIT, default false
		 * skipEmptyXacts : skip empty transaction like DDL, default true
		 */
		stoped = false;
		client = new pg.Client(config);

		client.on('error', function(err) {
			self.emit('error', err);
		});

		client.connect(function(err) {
			//error handling
			if (err) {
				self.emit('error', err);
				return;
			}

			var sql = 'START_REPLICATION SLOT ' + slotName + ' LOGICAL ' + (uptoLsn ? uptoLsn : '0/00000000');
			var opts = [
				'"include-xids" \'' + (option.includeXids === true ? 'on' : 'off') + '\'',
				'"include-timestamp" \'' + (option.includeTimestamp === true ? 'on' : 'off') + '\'',
			];
			sql += ' (' + (opts.join(' , ')) + ')';

			client.query(sql, function(err) {
				if (err) {
					if (!stoped && cb) {
						cb(err);
						cb = null;
					}
				}
				cb = null;
			});

			client.connection.once('replicationStart', function() {
				//start
				self.emit('start', self);
				client.connection.on('copyData', function(msg) {
					if (msg.chunk[0] == 0x77) { // XLogData
						var lsn = (msg.chunk.readUInt32BE(1).toString(16).toUpperCase()) + '/' + (msg.chunk.readUInt32BE(5).toString(16).toUpperCase());
						self.emit('data', {
							lsn: lsn,
							log: msg.chunk.slice(25),
						});
					} else if (msg.chunk[0] == 0x6b) { // Heartbeat
						let upper = msg.chunk.readUInt32BE(1)
						let lower = msg.chunk.readUInt32BE(5)
						let timestamp = Math.floor(msg.chunk.readUInt32BE(9) * 4294967.296 + msg.chunk.readUInt32BE(13) / 1000 + 946080000000)

						if (lower === 4294967295) { // [0xff, 0xff, 0xff, 0xff]
							upper = upper + 1
						} else {
							lower = lower + 1
						}

						let response = Buffer.alloc(34)
						response.fill(0x72) // 'r'

						response.writeUInt32BE(upper, 1)
						response.writeUInt32BE(lower, 5)

						response.writeUInt32BE(upper, 9)
						response.writeUInt32BE(lower, 13)

						response.writeUInt32BE(upper, 17)
						response.writeUInt32BE(lower, 21)

						response.writeUInt32BE(upper, 25)
						response.writeUInt32BE(lower, 29)
						response.writeInt8(0, 33)

						console.log('Response', response, msg.chunk.readUInt32BE(1))
						client.connection.sendCopyFromChunk(response)
					}
				});
			});
		});
		return self;
	};

	this.stop = function() {
		stoped = true;
		if (client) {
			client.removeAllListeners();
			client.end();
			client = null;
		}
	};
};
util.inherits(LogicalReplication, EventEmitter);

LogicalReplication.LoadPlugin = function(module) {
	return require('./plugins/' + module);
};

module.exports = LogicalReplication;
