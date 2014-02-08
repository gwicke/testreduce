var util = require('util'),
  events = require('events'),
  cass = require('node-cassandra-cql'),
  consistencies = cass.types.consistencies,
  uuid = require('node-uuid'),
  async = require('async');

// Constructor
function CassandraBackend(name, config, callback) {
  events.EventEmitter.call(this);

  var self = this;

  this.name = name;
  this.config = config;
  // convert consistencies from string to the numeric constants
  var confConsistencies = config.backend.options.consistencies;
  this.consistencies = {
    read: consistencies[confConsistencies.read],
    write: consistencies[confConsistencies.write]
  };

  self.client = new cass.Client(config.backend.options);

  var reconnectCB = function(err) {
    if (err) {
      // keep trying each 500ms
      console.error('pool connection error, scheduling retry!');
      setTimeout(self.client.connect.bind(self.client, reconnectCB), 500);
    }
  };
  this.client.on('connection', reconnectCB);
  this.client.connect();

  var numFailures = config.numFailures;

  // Queues that we use for
  self.runningQueue = new Array();
  self.testQueue = new Array();

  // Load all the tests from Cassandra - do this when we see a new commit hash

  //this.client.on('log', function(level, message) {
  //  console.log('log event: %s -- %j', level, message);
  //});
  callback();
}

// CassandraBackend.prototype._loadCommits = function(cb) {
//     this.client.execute("SELECT * from tests", null, this.consistencies.read, queryCB);
// }

util.inherits(CassandraBackend, events.EventEmitter);

/**
 * Get the next title to test
 *
 * @param commit object {
 *	hash: <git hash string>
 *	timestamp: <git commit timestamp date object>
 * }
 * @param cb function (err, test) with test being an object that serializes to
 * JSON, for example [ 'enwiki', 'some title', 12345 ]
 */
CassandraBackend.prototype.getTest = function (commit, cb) {
	cb([ 'enwiki', 'some title', 12345 ]);
};

/**
 * Add a result to storage
 *
 * @param test string representing what test we're running
 * @param commit object {
 *	hash: <git hash string>
 *	timestamp: <git commit timestamp date object>
 * }
 * @param result string (JUnit XML typically)
 * @param cb callback (err) err or null
 */
CassandraBackend.prototype.addResult = function(test, commit, result, cb) {
}

// Node.js module exports. This defines what
// require('./CassandraBackend.js'); evaluates to.
module.exports = CassandraBackend;
