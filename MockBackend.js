var util = require('util'),
  events = require('events'),
  cass = require('node-cassandra-cql'),
  consistencies = cass.types.consistencies,
  uuid = require('node-uuid'),
  mock = require('./mockdata'),
  async = require('async');


// Constructor
function MockBackend(name, config, callback) {
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

  self.testArr = [];
  self.testHash = {};

  // Load all the tests from Cassandra - do this when we see a new commit hash
  getCommits = getCommits.bind(this);
  getTests = getTests.bind(this);
  initTestPQ = initTestPQ.bind(this);
  async.waterfall([getCommits, getTests, initTestPQ], function(err) {
      for (test in self.testsList) {
          if (!(test in self.testHash)) {
              // construct resultObj
              var resultObj = {test: test, score: Infinity, commitIndex: -1};
              self.testArr.push(resultObj);
              self.testHash.push(test)
          }
      }
      
      // sort testArr by score
      self.testArr.sort(function(a,b) {
          return b.score - a.score;
      });
  });

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
			} else if (!results || !results.rows) {
				this.commits = [];
				cb(null);
			} else {
                this.commits = results.rows;
				cb(null); 
			}
		};

  queryCB.bind(this);
	var args = [];

	// get commits to tids
	var cql = 'select * from commits_to_tid;\n';
  
	this.client.execute(cql, args, this.consistencies.write, queryCB);
}

// cb is initTestPQ
function getTests(cb) {
	var queryCB = function (err, results) {
			if (err) {
				cb(err);
			} else if (!results || !results.rows) {
                this.testsList = [];
				cb(null, 0, 0);
			} else {
                this.testsList = testsList;
				cb(null, 0, results.rows.length);
			}
		};

    queryCB.bind(this);
	var args = [];

	// get tests
	var cql = 'select * from tests;\n';

	// And finish it off
	this.client.execute(cql, args, this.consistencies.write, queryCB);
}

function initTestPQ(commitIndex, numTestsLeft, cb) {
	var queryCB = function (err, results) {
			if (err) {
				cb(err);
			} else if (!results || !results.rows || results.rows.length === 0) {
				cb(null);
			} else {
				for (result in results) {
					if (!(result.test in this.testHash)) {
						// construct resultObj
            var resultObj = {test: test, score: score, commitIndex: commitIndex};
						this.testArr.push(resultObj);
            this.testHash.push(result.test)
						numTestsLeft--;
					}
				}

				if (numTestsLeft == 0 || this.commits[commitIndex].isSnapshot) {
					cb(null);
				}
				initTestPQ(commitIndex+1, numTestsLeft, cb);
			}
		};

    queryCB.bind(this);

	  var lastCommit = this.commits[commitIndex].hash;
    var args = [lastCommit];

	var cql = 'select (test, score, commit) from test_by_score where commit = ?';

	this.client.execute(cql, args, this.consistencies.write, queryCB);

}

/**
 * Get the number of regressions based on the previous commit
 *
 * @param commit1 object {
 *  hash: <git hash string>
 *  timestamp: <git commit timestamp date object>
 * }
 * @param cb function (err, num) - num is the number of regressions for the last commit
 */
MockBackend.prototype.getNumRegressions = function (commit, cb) {
  var fakeNum = 3;
  cb(null, fakeNum);
};



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
MockBackend.prototype.getTest = function (commit, cb) {

    /*
	// check running queue for any timed out tests.
    for (testObj in runningQueue) {
        // if any timed out, 
        if (testObj timed out)  {
            if (testObj.tries < threshold) { 
                // increment tries, return it;
                testObj.tries++;
                cb(null, testObj.test);
            } else {
                // pop it; (discard the result)
                runningQueue.pop();
            }
        }
    }
	
	// pop test from test queue
	// push test into running queue
	// increment tries, return test;
    */
	cb([ 'enwiki', 'some title', 12345 ]);
};

/**
 * Get results ordered by score
 *
 * @param cb- (err, result), result is defined below
 *
 */
MockBackend.prototype.getStatistics = function(cb) {

    /**
     * @param results 
     *    object {
     *       tests: <test count>,
     *       noskips: <tests without skips>,
     *       nofails: <tests without fails>,
     *       noerrors: <tests without error>,
     *
     *       latestcommit: <latest commit hash>,
     *       beforelatestcommit: <commit before latest commit>,
     *
     *       averages: {
     *           errors: <average num errors>,
     *           fails: <average num fails>,
     *           skips: <average num skips>,
     *           scores: <average num scores>
     *       },
     *       
     *       crashes: <num crashes>,
     *       regressions: <num regressions>,
     *       fixes: <num fixes>
     *   }
     * 
     */
    var results = mock;
    cb(null, results);
}

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
MockBackend.prototype.addResult = function(test, commit, result, cb) {
	var tid = commit.timestamp; // fix 

	var skipCount = result.match( /<skipped/g ),
			failCount = result.match( /<failure/g ),
			errorCount = result.match( /<error/g );

	// Build up the CQL
	// Simple revison table insertion only for now
	var cql = 'BEGIN BATCH ',
		args = [],
    score = statsScore(skipCount, failCount, errorCount);

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
				test
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
MockBackend.prototype.getFails = function(offset, limit, cb) {

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
// require('./MockBackend.js'); evaluates to.
module.exports = MockBackend;
