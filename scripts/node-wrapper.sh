#!/bin/sh

SCRIPT=${0%.sh}

exec env NODE_PATH=lib node "$SCRIPT.js" $@
