#!/usr/bin/env python

import json
import requests
import glob
import re
from urllib import quote

# Regular expression telling us which files to parse
file_regex = re.compile("(\w+)wiki-\d+.json")
# Get only the files which match the pattern
files_to_parse = filter(lambda filename: file_regex.search(filename) is not None, glob.iglob("*.json"))
failed_objects = list()
api_string = 'http://{0}.wikipedia.org/w/api.php?action=query&prop=revisions&titles={1}&rvprop=ids&format=json'
successes = 0
failures = 0
for article_list in files_to_parse:
    output_objects = list()
    output_file_parts = article_list.split('.')
    output_file_parts[0] += '-modified'
    output_file_name = ".".join(output_file_parts)
    with open(article_list) as f:
        titles = json.loads(f.read())
        # The language is the first capturing group in the regex
        lang = file_regex.search(article_list).group(1)
        for title in titles:
            # url encode the title so that we don't get silly hits.
            url = api_string.format(lang, quote(title.encode('utf-8')))
            try:
                response = requests.get(url)
                resp_json = response.json()
                oldid = resp_json['query']['pages'].values()[0]['revisions'][0]['revid']
                output_objects.append({'prefix': lang + 'wiki', 'title': title, 'oldid': oldid})
                successes += 1
            except KeyError:
                print resp_json
                failed_objects.append(url)
                failures += 1
            except requests.ConnectionError:
                failed_objects.append(url)
        with open(output_file_name, 'w') as output_file:
            output_file.write(json.dumps(output_objects))
with open('failures.txt', 'w') as failure_file:
    for failure_url in failed_objects:
        failure_file.write(failure_url + "\n")
print "successes: %d, failures: %d" % (successes, failures)
