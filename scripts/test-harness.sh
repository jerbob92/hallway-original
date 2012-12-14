#!/bin/bash

GLOBAL_EXIT_CODE=0

for FILE in `find test -name \*.test.js`; do
   echo "Running $FILE"

   env SUPPRESS_LOGS=true NODE_PATH=lib:test/lib mocha -R dot $FILE

   EXIT_CODE=$?

   GLOBAL_EXIT_CODE=$(($GLOBAL_EXIT_CODE || $EXIT_CODE))
done

echo "Exiting $GLOBAL_EXIT_CODE"

exit $GLOBAL_EXIT_CODE
