testreduce
==========

Distributed testing server originally developed for Parsoid round-trip testing
on a large corpus of Wikipedia pages. More information in the
[Parsoid round-trip testing](https://www.mediawiki.org/wiki/Parsoid/Round-trip_testing)
page.

Installation with Cassandra:

```bash
npm install
cp server.settings.js.example server.settings.js
cqlsh < cql/create_everything.cql
```

Running the server
------------------

Now start the server, it will be accessible at
[http://localhost:8001/](http://localhost:8001/):

```bash
node server
```

Using the Parsoid round-trip testing client
-------------------------------------------

You can now run some round-trip tests by installing Parsoid:

    git clone https://gerrit.wikimedia.org/r/p/mediawiki/services/parsoid
    cd parsoid
    npm install
    cd tests/client
    cp config.example.js config.js
    node client
