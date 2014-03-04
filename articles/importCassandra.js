var options = {
                hosts: [ 'localhost' ],
                keyspace: 'testreducedb',
                username: 'testreduce',
                password: '',
                poolSize: 1,
                consistencies: { read: 'one', write: 'one' }
              };

var cql = require('node-cassandra-cql'),
    client = new cql.Client(options);

var argv = require('optimist')
           .usage('Usage: node cassandraImport.js prefix where prefix = ar, sv... etc')
           .demand(1)
           .argv;

//RANDOM COMMIT I MADE UP DOESN'T DO ANYTHING FOR NOW
var DUMMYCOMMIT = '0b5db8b91bfdeb0a304b372dd8dda123b3fd1ab6';

var createTestBlob = function(prefix, title) {
    return new Buffer(JSON.stringify({prefix: prefix, title:title, oldid:42}));
};

var insertTestBlob = function(prefix, title) {
    console.log('insert called');
    var query = 'insert into tests (test) values (?);';
    client.execute(query, [createTestBlob(prefix, title)], 1, function(err, result) {
        if (err) {
            console.log(err);
        } else {
        }
    });
};

var insertTestByScore = function(prefix, title) {
    var query = "insert into test_by_score (commit, delta, test, score) values (?, ?, ?, ?);",
        commit = new Buffer(DUMMYCOMMIT),
        delta = 0,
        test = createTestBlob(prefix, title),
        score = Math.floor(Math.random() * (10000));
    client.execute(query, [commit, delta, test, score], 1, function(err, result) {
        if (err) {
            console.log(err);
        } else {
        }
    });
};

var loadJSON = function(prefix) {
    var i, titles = require(['./', prefix, 'wiki-10000.json'].join(''));
    console.log('importing ' + prefix + ' wiki articles from:');
    console.log(['./', prefix, 'wiki-10000.json'].join(''));
    for (i = 0; i < titles.length; i++) {
        console.log(prefix, titles[i]);
        insertTestBlob(prefix, titles[i]);
        insertTestByScore(prefix, titles[i]);
    }
    console.log('done importing ' + prefix + ' wiki articles');
};

loadJSON(argv['_'][0]);
