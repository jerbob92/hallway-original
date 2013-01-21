#!/bin/bash

MOCHA="node_modules/.bin/_mocha -- -R dot"
COVER="node_modules/.bin/cover"

interrupt() {
  exit 0
}

# If we don't trap Ctrl-C then it's hard to exit the script since it's looping.
trap interrupt SIGINT

rm -rf .coverage_data
rm -rf cover_html

for FILE in `find test -name \*.test.js`; do
  env SUPPRESS_LOGS=true NODE_PATH=lib:test/lib $COVER run $MOCHA $FILE
done

$COVER combine
$COVER report html
