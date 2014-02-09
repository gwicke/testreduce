#!/usr/bin/env node
( function () {
"use strict";

var express = require( 'express' ),
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

/*BEGIN: COORD APP*/
var getTitle = function ( req, res ) {
	res.end( 'get title not implemented yet');
};

var receiveResults = function ( req, res ) {
	res.end( 'receive results not implemented yet' );
};
/*END: COORD APP*/

var statsWebInterface = function ( req, res ) {
	res.write('<html><body>\n');
	res.write('Stats web interface goes here');
	res.end('</body></html>');
};

var failsWebInterface = function ( req, res ) {
	res.write('<html><body>\n');
	res.write('Fails page goes here');
	res.end('</body></html>');
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
	res.write('<html><body>\n');
	res.write('Regressions page goes here');
	res.end('</body></html>');
};

var GET_topfixes = function( req, res ) {
	res.write('<html><body>\n');
	res.write('Top fixes goes here');
	res.end('</body></html>');
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
