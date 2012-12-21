#!/bin/bash

IGNORES=(
  "firebase-token-generator-node"
  "dal-mysqlclient"
)

contains() {
  local e
  for e in "${@:2}"; do [[ "$e" == "$1" ]] && return 0; done
  return 1
}

MISSING=0

ESC="\x1B"

RED="$ESC[1;31m"
GREEN="$ESC[1;32m"
YELLOW="$ESC[1;33m"
NOTHING="$ESC[0m"

X="$RED\xE2\x9C\x98$NOTHING"
CHECK="$GREEN\xE2\x9C\x94$NOTHING"
DASH="$YELLOW-$NOTHING"

echo "Missing files and files missing tests:"
echo

while read -r FILE
do
  BASE=`basename ${FILE} .js`

  TEST="test/lib/${BASE}.test.js"
  UNIT_TEST="test/lib/${BASE}.unit.test.js"

  if contains $BASE "${IGNORES[@]}"
  then
    continue
  fi

  if [ ! -e "$TEST" ] && [ ! -e "$UNIT_TEST" ]
  then
    echo -e " $X $UNIT_TEST"
    MISSING=1
  else
    HAS_TESTS=0

    grep "\bit(" $TEST 2> /dev/null | grep -v ");" > /dev/null

    HAS_TESTS=$(($HAS_TESTS || $? == 0))

    grep "\bit(" $UNIT_TEST 2> /dev/null | grep -v ");" > /dev/null

    HAS_TESTS=$(($HAS_TESTS || $? == 0))

    if [[ $HAS_TESTS -eq 0 ]]
    then
      echo -e " $DASH $UNIT_TEST"
    fi
  fi
done < <(find lib -maxdepth 1 -type f | sort)

if [[ ! $MISSING -gt 0 ]]
then
  echo -e " $CHECK None!"
fi
