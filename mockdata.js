
 /* This is a sample configuration file.
 * Copy this file to server.settings.js and edit that file to fit your
 * Cassandra connection and other settings.
 *
 * You can also override these settings with command line options, run
 * $ node server.js --help
 * to view them.
 */
/*This will mimic the test table in cassandra, containing 4 tests
where 2 are regressions and 2 are fixes*/
var result = [{
    test: '{"prefix":"enwiki","title":"John rocks your sox","oldid":12345}', 
    errors: 2,
    fails: 3,
    skips: 2,
    old_errors: 0,
    old_fails: 0,
    old_skips: 1
}, {
    test:  '{"prefix":"enwiki","title":"Sox rocks John","oldid":54321}',
    errors: 0,
    fails: 0,
    skips: 100,
    old_errors: 0,
    old_fails: 0,
    old_skips: 0
}, {
    test: '{"prefix":"enwiki","title":"Javascript: All day Err day","oldid":911}',
    errors: 0,
    fails: 0,
    skips: 0,
    old_errors: 5,
    old_skips: 10,
    old_fails: 15
}, {
    test: '{"prefix":"enwiki","title":"Cassandra owns MySQL","oldid":119}',
    errors: 0,
    fails: 0,
    skips: 1,
    old_errors: 0,
    old_fails: 2,
    old_skips: 1
}];


module.exports = {
    numtests: 159637,
    noskips: 135388,
    nofails: 159158,
    noerrors: 159605,

    latestcommit: "2k3jdk3kedkc3dkdek3jjkdjc",
    beforelatestcommit: "7kdo3ko99kdo393kdk39d", //the commit before the latest one

    averages: {
        errors: 0,
        fails: 0,
        skips: 0.5,
        scores: 150
    },

    crashes: 1,

    testdata: result
};

