#
# Regular cron jobs for the testreduce package
#
0 4	* * *	root	[ -x /usr/bin/testreduce_maintenance ] && /usr/bin/testreduce_maintenance
