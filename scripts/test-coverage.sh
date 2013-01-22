#!/bin/bash

MOCHA="node_modules/.bin/_mocha -R json-cov"
COVERSHOT="node_modules/covershot/bin/covershot"

interrupt() {
  exit 0
}

# If we don't trap Ctrl-C then it's hard to exit the script since it's looping.
trap interrupt SIGINT

# Clear out any covershot data
rm -rf covershot
mkdir -p covershot/data

# Generate the jscoverage-instrumented version of lib/
rm -rf lib-cov
jscoverage lib lib-cov

for FILE in `find test -name \*.test.js`; do
  echo "- $FILE"

  env SUPPRESS_LOGS=true NODE_PATH=lib-cov:test/lib $MOCHA $FILE | \
    perl -0777 -pe "s/(?s).*?{/{/" > covershot/data/$(uuid).json
done

echo
echo "Generating report..."

$COVERSHOT covershot/data -w covershot

echo "Report is available at covershot/index.html"
