exports.parsePerfStats = function parsePerfStats(text) {
    var regexp = /<perfstat[\s]+type="([\w\:]+)"[\s]*>([\d]+)/g;
    var perfstats = [];
    for ( var match = regexp.exec( text ); match !== null; match = regexp.exec( text ) ) {
        perfstats.push( { type: match[ 1 ], value: match[ 2 ] } );
    }
    return perfstats;
}

exports.getResults = function getResults(test) {
    // This assumes that the test will still be in raw request form,
    // If not we can just skip the test.body and pass the results in straight.
    result = test.body.results,
    skipCount = result.match( /<skipped/g ),
    failCount = result.match( /<failure/g ),
    errorCount = result.match( /<error/g );
    return {result: result, skipCount: skipCount, failCount: failCount, errorCount: errorCount}
}
