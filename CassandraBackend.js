var util = require('util'),
  events = require('events'),
  cass = require('node-cassandra-cql'),
  consistencies = cass.types.consistencies,
  uuid = require('node-uuid');

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


  //this.client.on('log', function(level, message) {
  //  console.log('log event: %s -- %j', level, message);
  //});
  callback();

  // Create queue - self.queue = <something>
}

util.inherits(CassandraBackend, events.EventEmitter);

/**
 * Get the next title to test
 *
 * commit is object {
 *	hash: <git hash string>
 *	timestamp: <git commit timestamp date object>
 * }
 * @returns object that serializes to JSON, for example
 * [ 'enwiki', 'some title', 12345 ]
 */
CassandraBackend.prototype.getNextTest(commit) {
	return [ 'enwiki', 'some title', 12345 ];
}

/**
 * Add a result to storage
 *
 * @param commit object {
 *	hash: <git hash string>
 *	timestamp: <git commit timestamp date object>
 * }
 * @param result string (JUnit XML typically)
 * @return void
 */
CassandraBackend.prototype.addResult(commit, result) {

}

module.exports = CassandraBackend;
