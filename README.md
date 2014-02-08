testreduce
==========

Distributed testing server originally developed for Parsoid round-trip testing
on a large corpus of Wikipedia pages. More information in the
[Parsoid round-trip testing](https://www.mediawiki.org/wiki/Parsoid/Round-trip_testing)
page.

Installation:

    npm install

MySQL database
--------------

To try the MySQL version of the server, you also need to install MySQL,
[create a db and user](http://www.debian-administration.org/articles/39).

In mysql:

    create user testreduce;
    create database testreduce;
    GRANT ALL ON testreduce.* TO 'testreduce'@'localhost';
    flush privileges;

Create the db structure:

    mysql -u testreduce testreduce < sql/create_everything.mysql

Now copy server.settings.js.example to server.settings.js and change the
following settings:

    user testreduce
    database testreduce
    password "" (empty string)

The Debian package does create a database and imports an initial page list.

Running the server
------------------

Now start the server, it will be accessible at
[http://localhost:8001/](http://localhost:8001/):

    node server

Importing articles
------------------

There is a sample of testing articles for different languages in articles/. To
import them into the database:

    cd articles
    ./initAll.sh

If you want to manually import a language, or use a smaller set of test pages,
you can use the importJson script, which takes the same connection parameters
as the main server.js script:

    node importJson --prefix=enwiki articles/titles.example.en.json
    node importJson --prefix=eswiki articles/titles.example.es.json
    # This are bogus pages to test 404 errors
    node importJson --prefix=enwiki titles.example.bogus.json

The server should be restarted after this.

Using the Parsoid round-trip testing client
-------------------------------------------

You can now run some round-trip tests by installing Parsoid:

    git clone https://gerrit.wikimedia.org/r/p/mediawiki/services/parsoid
    cd parsoid
    npm install
    cd tests/client
    cp config.example.js config.js
    node client
