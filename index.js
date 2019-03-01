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

function standbyStatusUpdate(client, upperWAL, lowerWAL, msg = 'nothing') {
	// Timestamp as microseconds since midnight 2000-01-01
	var now = (Date.now() - 946080000000);
	var upperTimestamp = Math.floor(now / 4294967.296);
	var lowerTimestamp = Math.floor((now - upperTimestamp * 4294967.296));

	if (lowerWAL === 4294967295) { // [0xff, 0xff, 0xff, 0xff]
		upperWAL = upperWAL + 1;
		lowerWAL = 0;
	} else {
		lowerWAL = lowerWAL + 1;
	}

	var response = Buffer.alloc(34);
	response.fill(0x72); // 'r'

	// Last WAL Byte + 1 received and written to disk locally
	response.writeUInt32BE(upperWAL, 1);
	response.writeUInt32BE(lowerWAL, 5);

	// Last WAL Byte + 1 flushed to disk in the standby
	response.writeUInt32BE(upperWAL, 9);
	response.writeUInt32BE(lowerWAL, 13);

	// Last WAL Byte + 1 applied in the standby
	response.writeUInt32BE(upperWAL, 17);
	response.writeUInt32BE(lowerWAL, 21);

	// Timestamp as microseconds since midnight 2000-01-01
	response.writeUInt32BE(upperTimestamp, 25);
	response.writeUInt32BE(lowerTimestamp, 29);

	// If 1, requests server to respond immediately - can be used to verify connectivity
	response.writeInt8(0, 33);

	client.connection.sendCopyFromChunk(response);
}

var LogicalReplication = function(config) {
	EventEmitter.call(this);
	var self = this;

	config = config || {};
	config.replication = 'database';

	var client;
	var stoped = false;
	var lastLsn;
	var lastStatus = 0;
	var feedbackCheckInterval;
	var standbyMessageTimeout;

	this.getChanges = function(slotName, uptoLsn, option, cb /*(start_err)*/) {
		if (client) {
			client.removeAllListeners();
			client.end();
			client = null;
		}
		option = option || {};

		standbyMessageTimeout = (typeof option.standbyMessageTimeout === 'undefined') ? 10 : option.standbyMessageTimeout;

		/*
		 * includeXids : include xid on BEGIN and COMMIT, default false
		 * includeTimestamp : include timestamp on COMMIT, default false
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

			if (option.queryOptions) {
				Object.keys(option.queryOptions).forEach(key => {
					var value = option.queryOptions[key];
					if (typeof value === 'boolean') {
						value = value === true ? 'on' : 'off';
					}
					opts.push(
						`"${key}" '${value}'`
					)
				})
			}

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

			self.removeListener('acknowledge', onAcknowledge);
			client.connection.once('replicationStart', function() {
				//start
				self.emit('start', self);
				client.connection.on('copyData', function(msg) {
					if (msg.chunk[0] == 0x77) { // XLogData
						var lsn = (msg.chunk.readUInt32BE(1).toString(16).toUpperCase()) + '/' + (msg.chunk.readUInt32BE(5).toString(16).toUpperCase());
						self.emit('data', {
							lsn,
							log: msg.chunk.slice(25),
						});
						self.emit('acknowledge', { lsn });
						lastLsn = lsn;
					} else if (msg.chunk[0] == 0x6b) { // Primary keepalive message
						var lsn = (msg.chunk.readUInt32BE(1).toString(16).toUpperCase()) + '/' + (msg.chunk.readUInt32BE(5).toString(16).toUpperCase());
						var timestamp = Math.floor(msg.chunk.readUInt32BE(9) * 4294967.296 + msg.chunk.readUInt32BE(13) / 1000 + 946080000000);
						var shouldRespond = msg.chunk.readInt8(17);
						self.emit('heartbeat', {
							lsn,
							timestamp,
							shouldRespond
						});
						lastLsn = lsn;
					} else {
						console.log('Unknown message', msg.chunk[0]);
					}
				});

				self.on('acknowledge', onAcknowledge);
				startStandbyTimeoutCheck();
			});
		});
		return self;
	};

	function onAcknowledge(msg) {
		var lsn = msg.lsn.split('/');
		standbyStatusUpdate(client, parseInt(lsn[0], 16), parseInt(lsn[1], 16), 'acknowledge');
		updateLastStatus();
	}

	function startStandbyTimeoutCheck() {
		if (standbyMessageTimeout <= 0) {
			return;
		}

		feedbackCheckInterval = setInterval(function () {
			if ((Date.now() - lastStatus) > standbyMessageTimeout * 1000) {
				sendFeedback();
			}
		}, 1000);
	}

	function stopStandbyTimeoutCheck() {
		clearInterval(feedbackCheckInterval);
	}

	function updateLastStatus() {
		lastStatus = Date.now();
	}

	function sendFeedback() {
		if (!lastLsn) {
			return;
		}

		var lsn = lastLsn.split('/');
		if (!stoped && client) {
			standbyStatusUpdate(client, parseInt(lsn[0], 16), parseInt(lsn[1], 16), 'feedback');
			updateLastStatus();
		}
	}

	this.stop = function() {
		stoped = true;
		stopStandbyTimeoutCheck();
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
