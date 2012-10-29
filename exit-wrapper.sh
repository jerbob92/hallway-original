#!/bin/bash

# The name is the first argument
NAME=$1

# The command to run is the rest
shift

WAITING=0

# Is the process running?
running() {
	# Redirect the output because it's ugly
	kill -0 $1 &>> /dev/null

	# 0 for yes, 1 for no (exit codes)
	echo $?
}

# Our trap that runs on SIGINT and SIGTERM
send_int_and_wait() {
	if [[ $WAITING -eq 1 ]]
	then
		return
	fi

	WAITING=1

	echo "[`date -u +%Y-%m-%dT%T.%3NZ`] (exit-wrapper) Got an INT or TERM, sending an INT to $NAME at $PID and waiting" >> /mnt/log/$NAME.log

	kill -INT $1

	TIMER=0

	while [[ $(running $1) -eq 0 && $TIMER -lt 120 ]]
	do
		echo "[`date -u +%Y-%m-%dT%T.%3NZ`] (exit-wrapper) Waiting..." >> /mnt/log/$NAME.log

		sleep 15; let TIMER+=15
	done

	if [[ $(running $1) -eq 0 ]]
	then
		echo "[`date -u +%Y-%m-%dT%T.%3NZ`] (exit-wrapper) Timeout for $NAME at PID $PID expired, killing it" >> /mnt/log/$NAME.log

		kill -9 $1
	else
		echo "[`date -u +%Y-%m-%dT%T.%3NZ`] (exit-wrapper) $NAME at PID $PID exited successfully" >> /mnt/log/$NAME.log
	fi
}

# Run it in the background
"$@" &

# Get its PID
PID=$!

# If we receive a SIGINT or SIGTERM, send the process a SIGINT
trap "send_int_and_wait $PID" SIGINT SIGTERM

# Wait until the process completes
wait $PID

# Get its exit code
EXIT_CODE=$?

# Set the result based on the exit code
# XXX: 130 is the exit code for SIGINT/Ctrl-C, we should
#      fix hallwayd.js's exit code to override that.
if [[ $EXIT_CODE -eq 0 || $EXIT_CODE -eq 130 ]]
then
	RESULT=ok
else
	RESULT=failed
fi

echo "[`date -u +%Y-%m-%dT%T.%3NZ`] (exit-wrapper) The exit code of PID $PID was $EXIT_CODE, RESULT: $RESULT" >> /mnt/log/$NAME.log

# Emit an event so we can use upstart to manage crashes
initctl emit --no-wait $NAME-exited RESULT=$RESULT
