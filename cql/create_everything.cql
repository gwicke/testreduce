CREATE KEYSPACE IF NOT EXISTS "testreducedb"
    WITH REPLICATION = {'class': 'SimpleStrategy', 'replication_factor': 3};

use testreducedb;

-- Results of a particular test at a time.
CREATE TABLE IF NOT EXISTS results (
    tid timeuuid, -- commit time stamp
    test blob, -- blob representing the test we are running
    result text,
    PRIMARY KEY(test, tid)
);

-- Map commits to score and test.
CREATE TABLE IF NOT EXISTS test_by_score (
    commit blob, -- blob representing the commit hash
    delta int, -- how much the scores have changed
    score int, -- the test score, which is determined by the client
    test blob, -- blob for the test
    PRIMARY KEY(commit, delta, test)
);

-- List of tests
CREATE TABLE IF NOT EXISTS tests (
    test blob,
    PRIMARY KEY (test)
);

-- Store all of our commits with their associated timestamps.
CREATE TABLE IF NOT EXISTS commits (
    hash blob, -- commit hash as a blob
    tid timeuuid,
    keyframe boolean, -- is this a commit we'll use as a reference point?
    PRIMARY KEY(hash)
);

-- Store revision/commit summaries so we don't have to calculate everything every time
-- should i put this in the commits table instead?
CREATE TABLE IF NOT EXISTS revision_summary (
    revision blob,
    errors int,
    skips int,
    fails int,
    numtests int,
    PRIMARY KEY(revision)
);
