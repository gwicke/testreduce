// Constructor
function CassandraBackend(config) {
	this.config = config;
}

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
CassandraBackend.prototype.getTest = function (commit) {
	return [ 'enwiki', 'some title', 12345 ];
};

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
CassandraBackend.prototype.addResult = function(commit, result) {
};

// Node.js module exports. This defines what
// require('./CassandraBackend.js'); evaluates to.
module.exports = CassandraBackend;
