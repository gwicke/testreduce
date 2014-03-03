var util = require('util'),
  mock = require('./mockdata');


// Constructor
function MockBackend(name, config, callback) {
  var self = this;

  this.name = name;
  this.config = config;

  var numFailures = config.numFailures;

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
MockBackend.prototype.getNumRegFix = function (commit, cb) {
  calcRegressionFixes(function(err, reg, fix) {
    cb(null, reg.length, fix.length);
  });
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
    calcRegressionFixes(function(err, reg, fix) {
      results.numFixes= fix.length;
      results.numReg = reg.length;
      cb(null, results);
    });
}

/**
 * getRegressionRows mock method returns the mock data of the fake regressions
 */

var regressionsHeaderData = ['Title', 'New Commit', 'Errors|Fails|Skips', 'Old Commit', 'Errors|Fails|Skips'];

var statsScore = function(skip, fail, error) {
    return error*1000000+fail*1000+skip;
}
/**
This method calculates all the scores data from the tests table
**/
function calcRegressionFixes(cb) {
  var data = mock.testdata;

  var regData = [];
  var fixData = [];
  for(var y in data) {
    var x = data[y];
    var newtest = statsScore(x.skips, x.fails, x.errors);
    var oldtest = statsScore(x.old_skips, x.old_fails, x.old_errors);

    /*if they differ then we're going to push it in either the regression or fixes*/
    if(newtest !== oldtest)  {
      /*if the new is better than the old then it's a fix, otherwise regress*/
      (newtest < oldtest) ?fixData.push(x) : regData.push(x);
    }
  }

  //console.log("data: " + JSON.stringify(regData, null, '\t') + "\n" + JSON.stringify(fixData,null,'\t'));
  cb (null, regData, fixData);


}

MockBackend.prototype.getRegressions = function(r1, r2, prefix, page, cb) {
  calcRegressionFixes(function(err, regressions, fix) {
    var mydata = {
      page: page,
      urlPrefix: prefix,
      urlSuffix: '',
      heading: "Total regressions between selected revisions: " + regressions.length, /*change this with mock's num regresssions*/
      headingLink: {url: "/topfixes/between/" + r1 + "/" + r2, name: 'topfixes'},
      header: regressionsHeaderData
    };

    for (var i = 0; i < regressions.length; i++) {
      regressions[i].old_commit= r2;
      regressions[i].new_commit= r1;
    }

    //console.log("json: " + JSON.stringify(regressions, null, '\t'));

    cb(null, regressions, mydata);
  });
}

/**
 * getRegressionRows mock method returns the mock data of the fake regressions
 */
MockBackend.prototype.getFixes = function(r1, r2, prefix, page, cb) {
  calcRegressionFixes(function(err, regressions, fixes) {
    var mydata = {
      page: page,
      urlPrefix: prefix,
      urlSuffix: '',
      heading: "Total fixes between selected revisions: " + fixes.length, /*change this with mock's num regresssions*/
      headingLink: {url: '/regressions/between/' + r1 + '/' + r2, name: 'regressions'},
      header: regressionsHeaderData
    };

    for (var i = 0; i < fixes.length; i++) {
          fixes[i].old_commit= r2;
          fixes[i].new_commit= r1;
    }
    cb(null, fixes, mydata);
  });
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
