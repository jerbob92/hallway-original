#!/bin/bash

MOCHA="node_modules/.bin/mocha -R dot"
GLOBAL_EXIT_CODE=0

interrupt() {
   exit $GLOBAL_EXIT_CODE
}

# If we don't trap Ctrl-C then it's hard to exit the script since it's looping.
trap interrupt SIGINT

for FILE in `find test -name \*.test.js`; do
   echo "Running $FILE"

   env SUPPRESS_LOGS=true NODE_PATH=lib:test/lib $MOCHA $FILE

   EXIT_CODE=$?

   GLOBAL_EXIT_CODE=$(($GLOBAL_EXIT_CODE || $EXIT_CODE))
done

echo "Exiting $GLOBAL_EXIT_CODE"

exit $GLOBAL_EXIT_CODE
