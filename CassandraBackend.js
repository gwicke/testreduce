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

    var reconnectCB = function (err) {
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

    self.testQueue = new PriorityQueue(function (a, b) {
        return a.score - b.score;
    });
    self.runningQueue = [];
    self.testsList = {};
    self.latestRevision = {};
    self.testScores = [];
    self.topFailsArray = [];

    // Load all the tests from Cassandra - do this when we see a new commit hash
    async.waterfall([getCommits.bind(this), getTests.bind(this), initTestPQ.bind(this), initTopFails.bind(this)], function (err) {
        if (err) {
            console.log('failure in setup', err);
        }
        console.log('in memory queue setup complete');
    });

    callback();
}

// cb is getTests

//I did :
// insert into commits (hash, tid, keyframe) values (textAsBlob('0b5db8b91bfdeb0a304b372dd8dda123b3fd1ab6'), 5b89fc70-ba95-11e3-a5e2-0800200c9a66, true);
// insert into commits (hash, tid, keyframe) values (textAsBlob('bdb14fbe076f6b94444c660e36a400151f26fc6f'), d0602570-b52b-11e3-a5e2-0800200c9a66, true);
function getCommits(cb) {
    var queryCB = function (err, results) {
        if (err) {
            cb(err);
        } else if (!results || !results.rows || results.rows.length === 0) {
            //console.log( 'no seen commits, error in database' );
            cb("no seen commits, error in database");
        } else {
            for (var i = 0; i < results.rows.length; i++) {
                var commit = results.rows[i];
                // commits are currently saved as blobs, we shouldn't call toString on them...
                // commit[0].toString()
                this.commits.push({
                    hash: commit[0],
                    timestamp: commit[1],
                    isKeyframe: commit[2]
                });
            }
            this.commits.sort(function (a, b) {
                return b > a
            });
            //console.log("commits: " + JSON.stringify(this.commits, null,'\t'));
            cb(null);
        }
    };

    // get commits to tids
    var cql = 'select hash, dateOf(tid), keyframe from commits';
    this.client.execute(cql, [], this.consistencies.write, queryCB.bind(this));
}

// cb is initTestPQ
function getTests(cb) {
    var queryCB = function (err, results) {
        if (err) {
            cb(err);
        } else if (!results || !results.rows) {
            console.log('no seen commits, error in database');
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
    this.client.execute(cql, [], this.consistencies.write, queryCB.bind(this));
}

//note to the person doing inittestpq, this function will call cb(null) twice
//the line after checking if we have no tests left 
function initTestPQ(commitIndex, numTestsLeft, cb) {
    var queryCB = function (err, results) {
        if (err) {
            console.log('in error init test PQ');
            cb(err);
        } else if (!results || !results.rows || results.rows.length === 0) {
            console.log("no tests");

            cb(null);
        } else {
            for (var i = 0; i < results.rows.length; i++) {
                var result = results.rows[i];
                this.testQueue.enq({
                    test: result[0],
                    score: result[1],
                    commit: result[2].toString(),
                    failCount: 0
                });
                this.testScores[result[0].toString()] = result[1];
            }
            if (numTestsLeft == 0 || this.commits[commitIndex].isSnapshot) {
                return cb(null);
            }

            if (numTestsLeft - results.rows.length > 0) {
                var redo = initTestPQ.bind(this);
                redo(commitIndex + 1, numTestsLeft - results.rows.length, cb);
            }
            cb(null);
        }
    };
    var lastCommit = this.commits[commitIndex].hash;
    lastHash = lastCommit && lastCommit.hash || '';
    this.latestRevision.commit = lastCommit;
    //console.log("lastcommit: " + lastCommit + " lasthash: " + lastHash );
    if (!lastCommit) {
        cb(null);
    }
    var cql = 'select test, score, commit from test_by_score where commit = ?';

    this.client.execute(cql, [lastCommit], this.consistencies.write, queryCB.bind(this));
}

function initTopFails(cb) {
    var queryCB = function (err, results) {
        if (err) {
            console.log('in error init top fails');
            cb(err);
        } else if (!results || !results.rows || results.rows.length === 0) {
            console.log("no results found in initTopFails")
            cb(null);
        } else {
            for (var i = 0; i < results.rows.length; i++) {
                var result = results.rows[i];
                var index = findWithAttr(this.topFailsArray, "test", result[0]);
                if (index === -1 || this.topFailsArray === undefined ) {
                    this.topFailsArray.push({ test: result[0], score: result[1], commit: result[2].toString()});
                } else if(this.topFailsArray[index].score <= result[1]) {
                    this.topFailsArray[index] ={ test: result[0], score: result[1], commit: result[2].toString()};
                }
            }

            this.commitFails++;
            if (this.commitFails < this.commits.length) {
                var redo = initTopFails.bind( this );
                redo(cb);
            } else { 
              //console.log("finished!: " + JSON.stringify(this.topFailsArray, null,'\t'));
              async.sortBy(this.topFailsArray, function(fail, callback) {
                callback(null, -1*fail.score);
              }, function(err, results) {
                //console.log("results: " + JSON.stringify(results, null,'\t'))
                cb(null);
              })
            }
        }
    };
    this.commitFails = (this.commitFails !== undefined) ? this.commitFails :  0;
    //console.log("this.commits[0]: " + this.commitFails + "is "  + JSON.stringify(this.commits[0]));
    
    if(!this.commits[this.commitFails]) {
        //console.log("finished!: " + this.commitFails + "stuff: " + JSON.stringify(this.topFailsArray, null,'\t'));
        return cb(null);
    }
    var lastCommit = this.commits[this.commitFails].hash;
        lastHash = lastCommit && lastCommit.hash || '';
    //console.log("commit table: " + JSON.stringify(this.commits, null,'\t'));
    if (!lastCommit) {
      var error = "no last commit";
      //console.log("no last commit");
      cb(error);
    }
    var cql = 'select test, score, commit from test_by_score where commit = ?';
    

    this.client.execute(cql, [lastCommit], this.consistencies.write, queryCB.bind( this ));
}

function findWithAttr(array, attr, value) {
    for(var i = 0; i < array.length; i++) {
        //console.log("finding: " + typeof(array[i].test) + " comparing: " + typeof(value));
        if(array[i][attr].toString() === value.toString()) {
            // console.log("found!")
            return i;
        }
    }
    return -1;
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

CassandraBackend.prototype.removePassedTest = function (testName) {
    for (var i = 0; i < this.runningQueue.length; i++) {
        var job = this.runningQueue[i];
        if (job.test === testName) {
            this.runningQueue.splice(i, 1);
            break;
        }
    }
};

CassandraBackend.prototype.getTestToRetry = function() {
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

CassandraBackend.prototype.updateCommits = function(lastCommitTimestamp, commit, date) {
    if (lastCommitTimestamp < date) {
        this.commits.unshift( { hash: commit, timestamp: date, isKeyframe: false } );
        cql = 'insert into commits (hash, tid, keyframe) values (?, ?, ?);';
        args = [new Buffer(commit), tidFromDate(date), false];
        this.client.execute(cql, args, this.consistencies.write, function(err, result) {
            if (err) {
                console.log(err);
            }
        });

        this.getStatistics(new Buffer(commit), function (err, result) {
            cql = 'insert into revision_summary (revision, errors, skips, fails, numtests) values (?, ? , ? , ?, ?);';
            args = [new Buffer(commit), result.averages.errors, result.averages.skips, result.averages.fails, result.averages.numtests];
            this.client.execute(cql, args, this.consistencies.write, function(err, result) {
                if (err) {
                    console.log(err);
                }
            });
        });
    }
}

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
CassandraBackend.prototype.getTest = function (clientCommit, clientDate, cb) {
    var retry = this.getTestToRetry(),
        lastCommitTimestamp = this.commits[0].timestamp,
        retVal = { error: { code: 'ResourceNotFoundError', messsage: 'No tests to run for this commit'} };

    this.updateCommits(lastCommitTimestamp, clientCommit, clientDate);
    if (lastCommitTimestamp > clientDate) {
        retVal = { error: { code: 'BadCommitError', message: 'Commit too old' } };
    } else if (retry) {
        retVal = { test: retry };
    } else if (this.testQueue.size()) {
        var test = this.testQueue.deq();
        //ID for identifying test, containing title, prefix and oldID.
        this.runningQueue.unshift({test: test, startTime: new Date()});
        retVal = { test : test.test };
    }
    cb(retVal);
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


    insert into test_by_score (commit, delta, test, score) values (textAsBlob('0b5db8b91bfdeb0a304b372dd8dda123b3fd1ab6'), 0, textAsBlob('{"prefix": "enwiki", "title": "\"Slonowice_railway_station\""}'), 28487);
    insert into test_by_score (commit, delta, test, score) values (textAsBlob('0b5db8b91bfdeb0a304b372dd8dda123b3fd1ab6'), 0, textAsBlob('{"prefix": "enwiki", "title": "\"Salfoeld\""}'), 192);
    insert into test_by_score (commit, delta, test, score) values (textAsBlob('0b5db8b91bfdeb0a304b372dd8dda123b3fd1ab6'), 0, textAsBlob('{"prefix": "enwiki", "title": "\"Aghnadarragh\""}'), 10739);

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
            //console.log("hooray we have data!: " + JSON.stringify(results, null,'\t'));
            var noerrors = 0, nofails = 0, noskips = 0;
            var errors = 0, fails = 0, skips = 0;
            var totalscore = 0;
            var numtests = results.rows.length;
            async.each(results.rows, function(item, callback) {
                //console.log("item: " + JSON.stringify(item, null,'\t'));
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
                var counts = countScore(data);
                errors += counts.errors;
                fails += counts.fails;
                skips += counts.skips;
                totalscore += data;
                callback();
            }, function(err) {
                var averages = {
                    errors: errors / numtests,
                    fails: fails / numtests,
                    skips: skips / numtests, 
                    score: totalscore / numtests,
                    numtests: numtests
                }
                results = {
                    numtests: numtests,
                    noerrors: noerrors,
                    noskips: noskips,
                    nofails: nofails,
                    latestcommit: commit.toString(),
                    averages: averages
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

    this.removePassedTest(test);
    cql = 'insert into results (test, tid, result) values (?, ?, ?);';
    args = [test, tidFromDate(new Date()), result];
    this.client.execute(cql, args, this.consistencies.write, function(err, result) {
        if (err) {
            console.log(err);
        } else {
        }
    });

    var skipCount = (result.match( /<skipped/g ) || []).length,
        failCount = (result.match( /<failure/g ) || []).length,
        errorCount = (result.match( /<error/g ) || []).length; 

    var score = statsScore(skipCount, failCount, errorCount);

    // Check if test score changed
    if (this.testScores[test.toString()] != score) {
        // If changed, update test_by_score
        cql = 'insert into test_by_score (commit, score, delta, test) values (?, ?, ?, ?);';
        // args = [commit, score, this.testScores[test] - score, test];
        args = [commit, score, 0, test];
        
        this.client.execute(cql, args, this.consistencies.write, function(err, result) {
            if (err) {
                console.log(err);
            } else {
            }
        });
        // Update scores in memory;
        this.testScores[test.toString()] = score;
    }

    // Update topFails
    var index = findWithAttr(this.topFailsArray, "test", test);
    if (index != -1 && this.topFailsArray[index].score <= score) {
        this.topFailsArray[index].score = score;
        this.topFailsArray[index].commit = commit;
       // console.log("updated score");
    }

    this.topFailsArray.sort(function(a, b) { return b.score - a.score;} );
}

var statsScore = function(skipCount, failCount, errorCount) {
    // treat <errors,fails,skips> as digits in a base 1000 system
    // and use the number as a score which can help sort in topfails.
    return errorCount*1000000+failCount*1000+skipCount;
};

var countScore = function(score) {
    var skipsCount = score % 1000;
    score = score - skipsCount;
    var failsCount = (score % 1000000) / 1000;
    score = score - failsCount * 1000;
    var errorsCount = score / 1000000;    
    
    return {skips: skipsCount, fails: failsCount, errors: errorsCount}
};

/**
 * Get results ordered by score
 *
 * @param offset (for pagination)
 * @param limit  (for pagination)
 * @param cb
 *
 */
CassandraBackend.prototype.getTopFails = function(offset, limit, cb) {
    /**
     * cb
     *
     * @param results array [
     *    object {
     *      commit: <commit hash>,
     *      test: <test blob>,
     *      skips:  <skip count>,
     *      fails:  <fails count>,
     *      errors: <errors count>
     *      }
     * ]
     */

    var results = [];
    for (var i = offset; i < limit + offset; i++) {
        var current = this.topFailsArray[i];
        var score = current.score;

        // console.log("score:" );
        // console.log(score);
        var counts = countScore(score);

        // console.log("errors: " + errorsCount);
        // console.log("fails: " + failsCount);
        // console.log("skips: " + skipsCount);

        var result = {
            commit: current.commit, test: current.test, skips: counts.skips,
            fails: counts.fails, errors: counts.errors
        }
        results.push(result);
    }  
    cb(results);
}

// Node.js module exports. This defines what
// require('./CassandraBackend.js'); evaluates to.
module.exports = CassandraBackend;
