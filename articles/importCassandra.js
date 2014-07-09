var options = {
                hosts: [ 'localhost' ],
                keyspace: 'testreducedb'
              };

var cql = require('node-cassandra-cql'),
    client = new cql.Client(options);

var argv = require('optimist')
           .usage('Usage: node importCassandra.js prefix where prefix = ar, sv... etc')
           .demand(1)
           .argv;

//RANDOM COMMIT I MADE UP DOESN'T DO ANYTHING FOR NOW
var DUMMYCOMMIT = '0b5db8b91bfdeb0a304b372dd8dda123b3fd1ab6';

var createTestBlob = function(prefix, title) {
    return new Buffer(JSON.stringify({prefix: prefix, title:title, oldid:42}));
};

var insertTestBlobs = function(prefix, titles) {
    var query = 'insert into tests (test) values (?);';
    var queries = titles.map(function(title) {
        return {
            query: query,
            params: [createTestBlob(prefix, title)]
        };
    });
    client.executeBatch(queries, 1,
    function(err, result) {
        if (err) {
            console.error('Error during import', e, e.stack);
            process.exit(1);
        }
        console.log('All titles imported!');
        client.shutdown();
    });
};

var insertTestByScore = function(prefix, title) {
    console.log("insert called on testbyscore")
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
    insertTestBlobs(prefix + 'wiki', titles);
};

loadJSON(argv['_'][0]);
