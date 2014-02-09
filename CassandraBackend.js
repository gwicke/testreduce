var util = require('util'),
  events = require('events'),
  cass = require('node-cassandra-cql'),
  consistencies = cass.types.consistencies,
  uuid = require('node-uuid'),
  async = require('async');
  testPQ = require('priorityqueuejs');


// Constructor
function CassandraBackend(name, config, callback) {
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
	async.waterfall([getCommits, getTests, initTestPQ]);

  //this.client.on('log', function(level, message) {
  //  console.log('log event: %s -- %j', level, message);
  //});
  callback();
}

// cb is getTests
function getCommits(cb) {
	var queryCB = function (err, results) {
			if (err) {
				cb(err);
			} else if (!results || !results.rows || results.rows.length === 0) {
				cb(null, []);
			} else {
				cb(null, results.rows); // Second argument becomes first for getTests
			}
		};

	var args = [];

	// get commits to tids
	var cql = 'select * from commits_to_tid;\n';

	this.client.execute(cql, args, this.consistencies.write, queryCB);
}

// cb is initTestPQ
function getTests(commits, cb) {
	var queryCB = function (err, results) {
			if (err) {
				cb(err);
			} else if (!results || !results.rows || results.rows.length === 0) {
				cb(null, commits, 0, [], 0);
			} else {
				cb(null, commits, 0, results.rows, results.rows.length);
			}
		};

	var args = [];

	// get tests
	var cql = 'select * from tests;\n';

	// And finish it off
	this.client.execute(cql, args, this.consistencies.write, queryCB);
}

function initTestPQ(commits, commitIndex, testsList, numTestsLeft, cb) {
	var queryCB = function (err, results) {
			if (err) {
				cb(err);
			} else if (!results || !results.rows || results.rows.length === 0) {
				cb(null, commits, []);
			} else {
				for (result in results) {
					if (something) {
						// construct result
						testPQ.enq(result);
						numTestsLeft--;
					}
				}

				if (numTestsLeft == 0 || currentCommit.isSnapshot) {
					cb(null, commits);
				}
				initTestPQ(commits, commitIndex+1, testsList, numTestsLeft, cb);
			}
		};

	// find latest snapshot commit
	var args = [];

	var lastCommit = commits[commitIndex].hash;

	var cql = 'select (test, score, commit) from test_by_score where commit = ' + lastCommit;

	this.client.execute(cql, args, this.consistencies.write, queryCB);


	// for each commit from closest snapshot to newest commit,  
		// select (test, score) from test_by_score where commit = commit;
		// testQueue[test] = score
	// for all tests in testsList:
		// if there is no testQueue[tests], init to high score 
}

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
	// check running queue for any timed out tests.
	// if any timed out, 
		//if tries < threshold: 
			// increment tries, return it;
		// else:
			// pop it;
	// pop test from test queue
	// push test into running queue
	// increment tries, return test;

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
	var tid = commit.timestamp; // fix 

	var skipCount = result.match( /<skipped/g ),
			failCount = result.match( /<failure/g ),
			errorCount = result.match( /<error/g );

	// Build up the CQL
	// Simple revison table insertion only for now
	var cql = 'BEGIN BATCH ',
		args = [],

	var score = statsScore(skipCount, failCount, errorCount);

	// Insert into results
	cql += 'insert into results (test, tid, result)' +
				'values(?, ?, ?);\n';
	args = args.concat([
			test,
			tid,
			result
		]);

	// Check if test score changed
	if (testScores[test] == score) {
		// If changed, update test_by_score
		cq += 'insert into test_by_score (commit, score, test)' +
					'values(?, ?, ?);\n';
		args = args.concat([
				commit,
				score,
				test;
			]);

		// Update scores in memory;
		testScores[test] = score;
	}
	// And finish it off
	cql += 'APPLY BATCH;';

	this.client.execute(cql, args, this.consistencies.write, cb);

}

var statsScore = function(skipCount, failCount, errorCount) {
	// treat <errors,fails,skips> as digits in a base 1000 system
	// and use the number as a score which can help sort in topfails.
	return errorCount*1000000+failCount*1000+skipCount;
};

/**
 * Get results ordered by score
 *
 * @param offset (for pagination)
 * @param limit  (for pagination)
 * @param cb
 *
 */
CassandraBackend.prototype.getFails = function(offset, limit, cb) {

    /**
     * cb
     *
     * @param results array [
     *    object {
     *      commit: <commit hash>,
     *      prefix: <prefix>,
     *      title:  <title>
     *      status: <status> // 'perfect', 'skip', 'fail', or null
     *      skips:  <skip count>,
     *      fails:  <fails count>,
     *      errors: <errors count>
     *      }
     * ]
     */
    cb([]);
}

// Node.js module exports. This defines what
// require('./CassandraBackend.js'); evaluates to.
module.exports = CassandraBackend;
