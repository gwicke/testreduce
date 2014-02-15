/*
 * This is a sample configuration file.
 * Copy this file to server.settings.js and edit that file to fit your
 * Cassandra connection and other settings.
 *
 * You can also override these settings with command line options, run
 * $ node server.js --help
 * to view them.
 */

module.exports = {
    tests: 159637,
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
    regressions: 1,
    fixes: 50
};


