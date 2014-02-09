CREATE KEYSPACE IF NOT EXISTS "testreducedb"
    WITH REPLICATION = {'class': 'SimpleStrategy', 'replication_factor': 3};

use testreducedb;

-- Results of a particular test at a time.
CREATE TABLE IF NOT EXISTS results (
    test text,
    tid timeuuid,
    result text,
    PRIMARY KEY(test, tid)
);

-- Map commits to score and test.
CREATE TABLE IF NOT EXISTS test_by_score (
    commit blob,
    score int,
    test text,
    PRIMARY KEY(commit, score, test)
) WITH CLUSTERING ORDER BY (score DESC);

-- List of tests
CREATE TABLE IF NOT EXISTS tests (
    test text,
    PRIMARY KEY (test)
);

-- Store all of our commits with their associated timestamps.
CREATE TABLE IF NOT EXISTS commits (
    hash blob,
    tid timeuuid,
    keyframe boolean,
    PRIMARY KEY(hash)
);

-- An initial crack at the pages we have.
CREATE TABLE IF NOT EXISTS pages (
    title text,
    prefix text,
    claim_hash blob,
    claim_timestamp timeuuid,
    claim_num_tries int,
    PRIMARY KEY(title, prefix);
);