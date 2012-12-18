#!/bin/bash

RETURN=0
COUNT=0

while [ $RETURN == 0 ]; do
	COUNT=$(($COUNT + 1))

	echo "Test run $COUNT"

	make ltest >> /dev/null

	RETURN=$?
done

echo "Test failed on run $COUNT"
