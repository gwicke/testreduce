var util = require('util'),
  events = require('events'),
  cass = require('node-cassandra-cql'),
  consistencies = cass.types.consistencies,
  uuid = require('node-uuid'),
  PriorityQueue = require('priorityqueuejs'),
  async = require('async');

function tidFromDate(date) {
    // Create a new, deterministic timestamp
    return uuid.v1({
        node: [0x01, 0x23, 0x45, 0x67, 0x89, 0xab],
        clockseq: 0x1234,
        msecs: date.getTime(),
        nsecs: 0
    });
}

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

    self.commits = [];

    self.testQueue = new PriorityQueue( function(a, b) { return a.score - b.score; } );
    self.runningQueue = [];
    self.testsList = {};

    // Load all the tests from Cassandra - do this when we see a new commit hash
    async.waterfall([getCommits.bind( this ), getTests.bind( this ), initTestPQ.bind( this )], function(err) {
        if (err) {
            console.log( 'failure in setup', err );
        }
        console.log( 'in memory queue setup complete' );
    });

    callback();
}

// cb is getTests
function getCommits(cb) {
    var queryCB = function (err, results) {
        if (err) {
            cb(err);
        } else if (!results || !results.rows) {
            console.log( 'no seen commits, error in database' );
            cb(null);
        } else {
            for (var i = 0; i < results.rows.length; i++) {
                var commit = results.rows[i];
                // commits are currently saved as blobs, we shouldn't call toString on them...
                // commit[0].toString()
                this.commits.push( { hash: commit[0], timestamp: commit[1], isKeyframe: commit[2] } );
            }
            cb(null);
        }
    };

    // get commits to tids
    var cql = 'select hash, tid, keyframe from commits';
    this.client.execute(cql, [], this.consistencies.write, queryCB.bind(this));
}

// cb is initTestPQ
function getTests(cb) {
    var queryCB = function (err, results) {
        if (err) {
            cb(err);
        } else if (!results || !results.rows) {
            console.log( 'no seen commits, error in database' );
            cb(null, 0, 0);
        } else {

            // I'm not sure we need to have this, but it exists for now till we decide not to have it.
            for (var i = 0; i < results.rows.length; i++) {
                this.testsList[results.rows[i]] = true;
            }
            cb(null, 0, results.rows.length);
        }
    };

    // get tests
    var cql = 'select test from tests;';

    // And finish it off
    this.client.execute(cql, [], this.consistencies.write, queryCB.bind( this ));
}

function initTestPQ(commitIndex, numTestsLeft, cb) {
    var queryCB = function (err, results) {
        if (err) {
            console.log('in error init test PQ');
            cb(err);
        } else if (!results || !results.rows || results.rows.length === 0) {
            cb(null);
        } else {
            for (var i = 0; i < results.rows.length; i++) {
                var result = results.rows[i];
                this.testQueue.enq( { test: result[0], score: result[1], commit: result[2].toString(), failCount: 0 } );
            }

            if (numTestsLeft == 0 || this.commits[commitIndex].isSnapshot) {
                cb(null);
            }

            if (numTestsLeft - results.rows.length > 0) {
                var redo = initTestPQ.bind( this );
                redo( commitIndex + 1, numTestsLeft - results.rows.length, cb);
            }
            cb(null);
        }
    };

    var lastCommit = this.commits[commitIndex].hash;
         lastHash = lastCommit && lastCommit.hash || '';
    if (!lastHash) {
      cb(null);
    }
    var cql = 'select test, score, commit from test_by_score where commit = ?';
    

    //note to those who are working on the direct backend, I added this because now that the cql
    //schema is changed, you can only do a range query on a blob 
    myfake = new Buffer("0b5db8b91bfdeb0a304b372dd8dda123b3fd1ab6");
    this.client.execute(cql, [myfake], this.consistencies.write, queryCB.bind( this ));
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
CassandraBackend.prototype.getNumRegressions = function (commit, cb) {
  var fakeNum = 3;
  cb(null, fakeNum);
};

function removePassedTest(testName) {
    for (var i = 0; i < this.runningQueue.length; i++) {
        var job = this.runningQueue[i];
        if (job.test === testName) {
            this.runningQueue.splice(i, 1);
            break;
        }
    }
};

function getTestToRetry() {
    for (var i = 0, len = this.runningQueue.length, currTime = new Date(); i < len; i++) {
        var job = this.runningQueue[this.runningQueue.length - 1];
        if ((currTime.getMinutes() - job.startTime.getMinutes()) > 10) {
            this.runningQueue.pop();
            if (job.test.failCount < this.numFailures) {
                job.test.failCount ++;
                return job;
            } else {
                // write failed test into cassandra data store
            }
        } else {
            break;
        }
    }
    return undefined;
};

/**
 * Get the next test to run
 *
 * @param commit object {
 * hash: <git hash string>
 * timestamp: <git commit timestamp date object>
 * }
 * @param cb function (err, test) with test being an object that serializes to
 * JSON, for example [ 'enwiki', 'some title', 12345 ]
 */
CassandraBackend.prototype.getTest = function (commit, cb) {
    var retry = (getTestToRetry.bind(this))();
    if (retry) {
        return retry;
    } else if (this.testQueue.size()) {
        var test = this.testQueue.deq();
        //ID for identifying test, containing title, prefix and oldID.
        this.runningQueue.unshift({test: test, startTime: new Date()});

        cb(test.test);
    }

//    cb([ 'enwiki', 'some title', 12345 ]);
};

/**
 * Get results ordered by score
 *
 * @param cb- (err, result), result is defined below
 *
    


 */
CassandraBackend.prototype.getStatistics = function(commit, cb) {

    /**
     * @param result
     *  Required results:
        numtests-  
        noerrors- numtests - ()
        noskips- ()
        nofails
        latestcommit
        crashes
        beforelatestcommit
        numfixes
        numreg
     *

    how to compute a commit summary just by test_by_scores
    1) use a commit and search through all test_by_scores
    2) compute the amount of errors, skips, and fails 
    num tests = num quered
        - Go through each, and for every tests
          If(score == 0) then noerrors++ ; nofails++; noskips++;
          else IF(score > 1000000) -> do nothing
          else If(score > 1000) (it's a fail = noerrors++) 
          else If(score > 0 ) (it's a skip = noerrors++; no fails++) 
    3) We have latest commit, num tests and For now, 
    just mock the data for numreg, numfixes, and crashes and latest commit

     */

 
    var args = [], 
    results = {};

    var cql = "select score from test_by_score where commit = ?"
    args = args.concat([commit]);
    this.client.execute(cql, args, this.consistencies.write, function(err, results) {
        if (err) {
            console.log("err: " + err);
            cb(err);
        } else if (!results || !results.rows) {
            console.log( 'no seen commits, error in database' );
            cb(null);
        } else {
            console.log("hooray we have data!: " + JSON.stringify(results, null,'\t'));
            var noerrors = 0, nofails = 0, noskips = 0;
            var numtests = results.rows.length;
            async.each(results.rows, function(item, callback) {
                console.log("item: " + JSON.stringify(item, null,'\t'));
                var data = item[0];
                if(data < 1000000) {
                  if(data == 0) {
                    noerrors++;
                    noskips++;
                    nofails++;
                  } else if(data > 1000) {
                    noerrors++;
                  } else if(data > 0) {
                    noerrors++;
                    nofails++;
                  }
                }
                callback();
            }, function(err) {
                results = {
                    numtests: numtests,
                    noerrors: noerrors,
                    noskips: noskips,
                    nofails: nofails
                };
                console.log("result: " + JSON.stringify(results, null,'\t'));
              cb(null, results);

            })
        }
    })
    //var results = {};
    
}

/**
 * Add a result to storage
 *
 * @param test string representing what test we're running
 * @param commit object {
 *    hash: <git hash string>
 *    timestamp: <git commit timestamp date object>
 * }
 * @param result string (JUnit XML typically)
 * @param cb callback (err) err or null
 */
CassandraBackend.prototype.addResult = function(test, commit, result, cb) {
    (removePassedTest.bind(this))(test);
    cql = 'insert into results (test, tid, result) values (?, ?, ?);';
    args = [test, tidFromDate(new Date()), result];
    this.client.execute(cql, args, this.consistencies.write, function(err, result) {
        if (err) {
            console.log(err);
        } else {
        }
    });
    // logic to clear timeouts needs to go here
    // clearTimeout(this.runningTokens[test]);
    // var tid = commit.timestamp; // fix

    // var skipCount = result.match( /<skipped/g ),
    //         failCount = result.match( /<failure/g ),
    //         errorCount = result.match( /<error/g );

    // // Build up the CQL
    // // Simple revison table insertion only for now
    // var cql = 'BEGIN BATCH ',
    //     args = [],
    // score = statsScore(skipCount, failCount, errorCount);

    // // Insert into results
    // cql += 'insert into results (test, tid, result)' +
    //             'values(?, ?, ?);\n';
    // args = args.concat([
    //         test,
    //         tid,
    //         result
    //     ]);

    // // Check if test score changed
    // if (testScores[test] == score) {
    //     // If changed, update test_by_score
    //     cq += 'insert into test_by_score (commit, score, test)' +
    //                 'values(?, ?, ?);\n';
    //     args = args.concat([
    //             commit,
    //             score,
    //             test
    //         ]);

    //     // Update scores in memory;
    //     testScores[test] = score;
    // }
    // // And finish it off
    // cql += 'APPLY BATCH;';

    // this.client.execute(cql, args, this.consistencies.write, cb);

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
