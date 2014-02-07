all:
	npm install

.PHONY: articles
articles:
	(cd articles && ./initAll.sh)


.PHONY: clean
clean:
	rm -rf node_modules
