#!/usr/bin/env node
( function () {
"use strict";

var express = require( 'express' ),
	hbs = require( 'handlebars' ),
	MockBackend      = require('./MockBackend'),
	CassandraBackend = require('./CassandraBackend'),
    optimist = require( 'optimist' ),
    hbs = require( 'handlebars' );

// Default options
var defaults = {
    'host': 'localhost',
    'port': 3306,
    'database': 'parsoid',
    'user': 'parsoid',
    'password': 'parsoidpw',
    'debug': false,
    'fetches': 6,
    'tries': 6,
    'cutofftime': 600,
    'batch': 50
};

// Command line options
// These will have to be modified to reflect new cassandra backend
var argv = optimist.usage( 'Usage: $0 [connection parameters]' )
    .options( 'help', {
        'boolean': true,
        'default': false,
        describe: "Show usage information."
    } )
    .options( 'h', {
        alias: 'host',
        describe: 'Hostname of the database server.'
    } )
    .options( 'P', {
        alias: 'port',
        describe: 'Port number to use for connection.'
    } )
    .options( 'D', {
        alias: 'database',
        describe: 'Database to use.'
    } )
    .options( 'u', {
        alias: 'user',
        describe: 'User for MySQL login.'
    } )
    .options( 'p', {
        alias: 'password',
        describe: 'Password.'
    } )
    .options( 'd', {
        alias: 'debug',
        'boolean': true,
        describe: "Output MySQL debug data."
    } )
    .options( 'f', {
        alias: 'fetches',
        describe: "Number of times to try fetching a page."
    } )
    .options( 't', {
        alias: 'tries',
        describe: "Number of times an article will be sent for testing " +
            "before it's considered an error."
    } )
    .options( 'c', {
        alias: 'cutofftime',
        describe: "Time in seconds to wait for a test result."
    } )
    .options( 'config', {
        describe: "Config file path"
    } )
    .options( 'b', {
        alias: 'batch',
        describe: "Number of titles to fetch from database in one batch."
    } )
    .argv;

if ( argv.help ) {
    optimist.showHelp();
    process.exit( 0 );
}

// Settings file
var settings;
try {
    var settingsPath = argv.config || './server.settings.js';
    settings = require( settingsPath );
} catch ( e ) {
    settings = {};
}

var getOption = function( opt ) {
    var value;

    // Check possible options in this order: command line, settings file, defaults.
    if ( argv.hasOwnProperty( opt ) ) {
        value = argv[ opt ];
    } else if ( settings.hasOwnProperty( opt ) ) {
        value = settings[ opt ];
    } else if ( defaults.hasOwnProperty( opt ) ) {
        value = defaults[ opt ];
    } else {
        return undefined;
    }

    // Check the boolean options, 'false' and 'no' should be treated as false.
    // Copied from mediawiki.Util.js.
    if ( opt === 'debug' ) {
        if ( ( typeof value ) === 'string' &&
             /^(no|false)$/i.test( value ) ) {
            return false;
        }
    }
    return value;
};

var // The maximum number of tries per article
    maxTries = getOption( 'tries' ),
    // The maximum number of fetch retries per article
    maxFetchRetries = getOption( 'fetches' ),
    // The time to wait before considering a test has failed
    cutOffTime = getOption( 'cutofftime' ),
    // The number of pages to fetch at once
    batchSize = getOption( 'batch' ),
    debug = getOption( 'debug' );

/**
 * Does cassandra have to be shutdown on exit as well?
 * process.on( 'exit', function() {
 *   db.end();
 * } );
 */
var knownCommits;
var fetchedPages = [];
var lastFetchedCommit = null;
var lastFetchedDate = new Date(0);


var backend = null;

if(settings.backend.type ==="cassandra") {
  backend = new CassandraBackend("", settings, function(err) {
     if(err) {
        console.error("CassandraBackend not working??");
        process.exit(1);
     } else {
        console.log("CassandraBackend Works");
     }
  });
} else if(settings.backend.type ==="mock") {
  backend = new MockBackend("", settings, function(err) {
    if(err) {
        console.error("MockBackend not working??");
        process.exit(1);
    }
    else {
        console.log("MockBackend Works");
    }
  });
}

/*BEGIN: COORD APP*/

// // backend store needed to populate commit table?
// function populateKnownCommits( store, commitTable ) {
//     store.getCommits(null);
//     //Logic to populate knownCommits table goes here
// }

/**
 * Needs to be hooked up to backend.
 */
var getTitle = function ( req, res ) {
    var commitHash = req.query.commit;
    var commitDate = new Date( req.query.ctime );
    var knownCommit = knownCommits && knownCommits[ commitHash ];
    // init backend store reference here?
    var store = backend;

    res.setHeader( 'Content-Type', 'text/plain; charset=UTF-8' );

    // if ( !knownCommit ) {
    //     console.log( 'Unknown commit requested' );
    //     // Maybe populate known commit table at startup?
    //     // Empty commit table case handled by getTitle in current implementation
    //     if ( !knownCommits ) {
    //         populateKnownCommits( store, knownCommits );
    //     }
    //     // Backend logic for handling unseen commits and lastFetchedCommit goes here
    // }

    var fetchCb = function(err, page) {
        // 404 and 426 handling will need to be handled based upon backend return value
        if ( !err ) {
            console.log( ' ->', page );
            res.send( page, 200 );
        }
    };

    store.getTest(commitHash, fetchCb);
};

var receiveResults = function ( req, res ) {
    res.end( 'receive results not implemented yet' );
};
/*END: COORD APP*/

var indexLinkList = function () {
	return '<p>More details:</p>\n<ul>' +
		'<li><a href="/topfails">Results by title</a></li>\n' +
		'<li><a href="/failedFetches">Non-existing test pages</a></li>\n' +
		'<li><a href="/failsDistr">Histogram of failures</a></li>\n' +
		'<li><a href="/skipsDistr">Histogram of skips</a></li>\n' +
		'<li><a href="/commits">List of all tested commits</a></li>\n' +
		'<li><a href="/perfstats">Performance stats of last commit</a></li>\n' +
		'</ul>';
};

var statsWebInterface = function ( req, res ) {
	var displayRow = function( res, label, val ) {
	  // round numeric data, but ignore others
	  if( !isNaN( Math.round( val * 100 ) / 100 ) ) {
	    val = Math.round( val * 100 ) / 100;
	  }
	  res.write( '<tr style="font-weight:bold"><td style="padding-left:20px;">' + label );
	  res.write( '</td><td style="padding-left:20px; text-align:right">' + val + '</td></tr>' );
	};
	backend.getStatistics(function(err, result) {
	  var tests = result.numtests;
	  var errorLess = result.noerrors;
	  var skipLess = result.noskips;
	  var failLess  = result.nofails;

	  var noErrors = Math.round( 100 * 100 * errorLess / ( tests || 1 ) ) / 100,
		  perfects = Math.round( 100* 100 * skipLess / ( tests || 1 ) ) / 100,
		  syntacticDiffs = Math.round( 100 * 100 *
				( failLess / ( tests || 1 ) ) ) / 100;
	  res.write('<html><body>\n');
	  res.write('<p>We have run roundtrip-tests on ' + tests + ' articles, of which' + ' </p>')
	  res.write('<ul>');

      res.write('<li>' + noErrors + '% parsed without errors</li>');
      res.write('<li>' + syntacticDiffs + '% round-tripped without semantic differenes, and</li>' );
      res.write('<li>' + perfects + '% round-tripped with no character differences at all </li>')

	  res.write('</ul>');

	  var width = 800;

	  res.write( '<table><tr height=60px>');
	  res.write( '<td width=' + ( width * perfects / 100 || 0 ) +
				 'px style="background:green" title="Perfect / no diffs"></td>' );
	  res.write( '<td width=' + ( width * ( syntacticDiffs - perfects ) / 100 || 0 ) +
				 'px style="background:yellow" title="Syntactic diffs"></td>' );
	  res.write( '<td width=' + ( width * ( 100 - syntacticDiffs ) / 100 || 0 ) +
				 'px style="background:red" title="Semantic diffs"></td>' );
	  res.write( '</tr></table>' );

	  res.write( '<p>Latest revision:' );
	  res.write( '<table><tbody>');

	  displayRow(res, "Git SHA1", result.latestcommit);
	  displayRow(res, "Test Results", tests);
	  displayRow( res, "Crashers",
	           '<a href="/crashers">' + result.crashes + '</a>' );
	  displayRow(res, "Regressions",
	           '<a href="/regressions/between/' + result.latestcommit + '/' +
	           result.beforelatestcommit + '">' +
	           result.numFixes + '</a>');
	  displayRow(res, "Fixes",
	           '<a href="/topfixes/between/' + result.latestcommit + '/' +
	           result.beforelatestcommit + '">' +
	           result.numReg + '</a>');
	  res.write( '</tbody></table></p>' );

	  res.write( '<p>Averages (over the latest results):' );
	  res.write( '<table><tbody>');
	  // displayRow(res, "Errors", result.averages.errors);
	  // displayRow(res, "Fails", result.averages.fails);
	  // displayRow(res, "Skips", result.averages.skips);
	  // displayRow(res, "Score", result.averages.scores);
	  res.write( '</tbody></table></p>' );
	  res.write( indexLinkList() );
	  res.end('</body></html>');
    });
};

var failsWebInterface = function ( req, res ) {
    var page = ( req.params[0] || 0 ) - 0,
        offset = page * 40;

    backend.getFails(offset, 40, function(results) {
        //   object {
        //     commit: <commit hash>,
        //     prefix: <prefix>,
        //     title:  <title>
        //     status: <status> // 'perfect', 'skip', 'fail', or null
        //     skips:  <skip count>,
        //     fails:  <fails count>,
        //     errors: <errors count>
        //     }
        //]
        for (var i = 0; i < results.length; i++) {
            results[i].pageTitleData = {
                // foobar
            };
            results[i].commitLinkData = {
                url: 'foo',
                name: results[i].commit.substr(0,7)
            };
        }

        var data = {
            page: page,
            urlPrefix: '/topfails',
            uslSuffix: '',
            headind: 'Results by title',
            header: ['Title', 'Commit', 'Syntatic diffs', 'Semantic diffs', 'Errors'],
            paginate: true,
            row: results,
            prev: page > 0,
            next: results.length === 40
        }

        res.render('table.html', data);
    });
};

var resultsWebInterface = function ( req, res ) {
    res.write('<html><body>\n');
    res.write('Results page goes here');
    res.end('</body></html>');
};

var resultWebInterface = function( req, res ) {
    res.write('<html><body>\n');
    res.write('Result diff page goes here');
    res.end('</body></html>');
};

var GET_failedFetches = function( req, res ) {
    res.write('<html><body>\n');
    res.write('Failed fetches page go here');
    res.end('</body></html>');
};

var GET_crashers = function( req, res ) {
    res.write('<html><body>\n');
    res.write('Crashed titles go here');
    res.end('</body></html>');
};

var GET_failsDistr = function( req, res ) {
    res.write('<html><body>\n');
    res.write('Distribution of semantic errors go here');
    res.end('</body></html>');
};

var GET_skipsDistr = function( req, res ) {
    res.write('<html><body>\n');
    res.write('Distribution of syntactic errors go here');
    res.end('</body></html>');
};


var GET_regressions = function( req, res ) {
    var r1 = req.params[0];
    var r2 = req.params[1];

	var urlPrefix = "/regressions/between/" + r1 + "/" + r2;
	var page = (req.params[2] || 0) - 0;
	var offset = page * 40;

    /*put this in mock later */

    backend.getRegressions(r1, r2, urlPrefix, page, function(err, data, info) {
      var rows = data;

      // console.log("passing: " + JSON.stringify(rows, null ,'\t'));
      displayPageList(res, info, makeRegressionRow, null, rows  );

    });
};

var GET_topfixes = function( req, res ) {
    var r1 = req.params[0];
    var r2 = req.params[1];

    var urlPrefix = "/topfixes/between/" + r1 + "/" + r2;
    var page = (req.params[2] || 0) - 0;
    var offset = page * 40;

    /*put this in mock later */

    backend.getFixes(r1, r2, urlPrefix, page, function(err, data, info) {
      var rows = data;

      // console.log("passing: " + JSON.stringify(rows, null ,'\t'));
      displayPageList(res, info, makeRegressionRow, null, rows  );

    });
};

var GET_commits = function( req, res ) {
    res.write('<html><body>\n');
    res.write('Commits go here');
    res.end('</body></html>');
};
var GET_perfStats = function( req, res ) {
    res.write('<html><body>\n');
    res.write('Performance stats go here');
    res.end('</body></html>');
};

var GET_pagePerfStats = function( req, res ) {
    res.write('<html><body>\n');
    res.write('Performance results go here');
    res.end('</body></html>');
};

/* BEGIN- Helper functions for GET_regressions*/
var displayPageList = function(res, data, makeRow, err, rows){
    console.log( "GET " + data.urlPrefix + "/" + data.page + data.urlSuffix );
    if ( err ) {
        res.send( err.toString(), 500 );
    } else if ( !rows || rows.length <= 0 ) {
        res.send( "No entries found", 404 );
    } else {
        var tableRows = [];
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var tableRow = {status: pageStatus(row), tableData: makeRow(row)};
            // console.log("table: " + JSON.stringify(tableRow, null, '\t'));
            tableRows.push(tableRow);
        }

        var tableData = data;
        tableData.paginate = true;
        tableData.row = tableRows;
        tableData.prev = data.page > 0;
        tableData.next = rows.length === 40;

        hbs.registerHelper('prevUrl', function (urlPrefix, urlSuffix, page) {
            return urlPrefix + "/" + ( page - 1 ) + urlSuffix;
        });
        hbs.registerHelper('nextUrl', function (urlPrefix, urlSuffix, page) {
            return urlPrefix + "/" + ( page + 1 ) + urlSuffix;
        });

        // console.log("JSON: " + JSON.stringify(tableData, null, '\t'));
        res.render('table.html', tableData);
    }
};

var makeRegressionRow = function(row) {
    return [
        pageTitleData(row),
        commitLinkData(row.new_commit, row.title, row.prefix),
        row.errors + "|" + row.fails + "|" + row.skips,
        commitLinkData(row.old_commit, row.title, row.prefix),
        row.old_errors + "|" + row.old_fails + "|" + row.old_skips
    ];
};

var pageTitleData = function(row){
    var parsed = JSON.parse(row.test);
    var prefix = encodeURIComponent( parsed.prefix ),
    title = encodeURIComponent( parsed.title );
    return {
        title: parsed.prefix + ':' + parsed.title,
        titleUrl: 'http://parsoid.wmflabs.org/_rt/' + prefix + '/' + title,
        lh: 'http://localhost:8000/_rt/' + prefix + '/' + title,
        latest: '/latestresult/' + prefix + '/' + title,
        perf: '/pageperfstats/' + prefix + '/' + title
    };
};

var pageStatus = function(row) {
    var hasStatus = row.hasOwnProperty( 'skips' ) &&
        row.hasOwnProperty( 'fails' ) &&
        row.hasOwnProperty( 'errors' );

    if (hasStatus) {
        if ( row.skips === 0 && row.fails === 0 && row.errors === 0 ) {
            return 'perfect';
        } else if ( row.errors > 0 || row.fails > 0 ) {
            return 'fail';
        } else {
            return 'skip';
        }
    }
    return null;
};

var commitLinkData = function(commit, title, prefix) {
    return {
        url: '/result/' + commit + '/' + prefix + '/' + title,
        name: commit.substr( 0, 7 )
    };
};
/* End- Helper functions for GET_regressions*/


// Make an app
var app = express.createServer();

// Configure for Handlebars
app.configure(function(){
    app.set('view engine', 'handlebars');
    app.register('.html', require('handlebars'));
});

// Declare static directory
app.use("/static", express.static(__dirname + "/static"));

// Make the coordinator app
var coordApp = express.createServer();

// Add in the bodyParser middleware (because it's pretty standard)
app.use( express.bodyParser() );
coordApp.use( express.bodyParser() );

// robots.txt: no indexing.
app.get(/^\/robots.txt$/, function ( req, res ) {
    res.end( "User-agent: *\nDisallow: /\n" );
});

// Main interface
app.get( /^\/results(\/([^\/]+))?$/, resultsWebInterface );

// Results for a title (on latest commit)
app.get( /^\/latestresult\/([^\/]+)\/(.*)$/, resultWebInterface );

// Results for a title on any commit
app.get( /^\/result\/([a-f0-9]*)\/([^\/]+)\/(.*)$/, resultWebInterface );

// List of failures sorted by severity
app.get( /^\/topfails\/(\d+)$/, failsWebInterface );
// 0th page
app.get( /^\/topfails$/, failsWebInterface );

// Overview of stats
app.get( /^\/$/, statsWebInterface );
app.get( /^\/stats(\/([^\/]+))?$/, statsWebInterface );

// Failed fetches
app.get( /^\/failedFetches$/, GET_failedFetches );

// Crashers
app.get( /^\/crashers$/, GET_crashers );

// Regressions between two revisions.
app.get( /^\/regressions\/between\/([^\/]+)\/([^\/]+)(?:\/(\d+))?$/, GET_regressions );

// Topfixes between two revisions.
app.get( /^\/topfixes\/between\/([^\/]+)\/([^\/]+)(?:\/(\d+))?$/, GET_topfixes );

// Distribution of fails
app.get( /^\/failsDistr$/, GET_failsDistr );

// Distribution of fails
app.get( /^\/skipsDistr$/, GET_skipsDistr );
// Performance stats
app.get( /^\/perfstats\/(\d+)$/, GET_perfStats );
app.get( /^\/perfstats$/, GET_perfStats );
app.get( /^\/pageperfstats\/([^\/]+)\/(.*)$/, GET_pagePerfStats );

// List of all commits
app.use( '/commits', GET_commits );

app.use( '/static', express.static( __dirname + '/static' ) );

// Clients will GET this path if they want to run a test
//
coordApp.get( /^\/title$/, getTitle );

// Receive results from clients
coordApp.post( /^\/result\/([^\/]+)\/([^\/]+)/, receiveResults );

// Start the app
app.listen( 8001 );
coordApp.listen( 8002 );
}() );
