#!/bin/bash

service beanstalkd stop
service beanstalkd start

echo "flushdb" | redis-cli
