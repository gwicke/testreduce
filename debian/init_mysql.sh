#!/bin/sh
MYSQL="mysql --defaults-file=/etc/mysql/debian.cnf"
$MYSQL -e "create user  testreduce;" 
$MYSQL -e "create database testreduce;"
$MYSQL testreduce < /usr/lib/testreduce/sql/create_everything.mysql
$MYSQL -e "GRANT ALL ON testreduce.* TO 'testreduce'@'localhost';"
$MYSQL -e "flush privileges;"
