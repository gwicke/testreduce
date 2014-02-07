#!/bin/sh
echo "Importing titles to test from a bunch of messages"
for lang in ar de en es fr he hi it ja ko nl pl ru sv;do
	echo "Importing $lang.."
	node importJson.js -u testreduce -D testreduce --prefix "${lang}wiki" \
	"${lang}wiki-10000.json"
done
