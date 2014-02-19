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
    regressions: {
        num: 1,
        results: [ {
          prefix: "enwiki",
          title: "John rocks your sox",
          errors: 2,
          fails: 3,
          skips: 2,
          old_errors: 0,
          old_fails: 0,
          old_skips: 1
        }, {
          prefix: "enwiki",
          title: "Sox rocks John",
          errors: 0,
          fails: 0,
          skips: 100,
          old_errors: 0,
          old_fails: 0,
          old_skips: 0
        }]
    },
    fixes: {
        num: 1,
        results: [{
          prefix: "enwiki",
          title: "Javascript: All day Err day",
          errors: 0,
          fails: 0,
          skips: 0,
          old_errors: 5,
          old_skips: 10,
          old_fails: 15
        }, {
          prefix: "enwiki",
          title: "Cassandra owns MySQL",
          errors: 0,
          fails: 0,
          skips: 1,
          old_errors: 0,
          old_fails: 2,
          old_skips: 1 
        }]
    }
};


