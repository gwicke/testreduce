exports.parsePerfStats = function parsePerfStats(text) {
    var regexp = /<perfstat[\s]+type="([\w\:]+)"[\s]*>([\d]+)/g;
    var perfstats = [];
    for ( var match = regexp.exec( text ); match !== null; match = regexp.exec( text ) ) {
        perfstats.push( { type: match[ 1 ], value: match[ 2 ] } );
    }
    return perfstats;
}
