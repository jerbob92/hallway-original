#!/usr/bin/env/node

var async = require('async');
var program = require('commander');

program
  .usage('-p, --profile <profile@service>')
  .option('-p, --profile <profile@service>', 'the profile to clear data from')
  .option('-v, --verbose', 'lots of logging')
  .parse(process.argv);


var lconfig = require('lconfig');
lconfig.logging = {
  level: (program.verbose ? 'verbose' : 'info')
};
var logger = require('logger').logger('clearProfile');

var dMap = require('dmap');
var entries = require('entries');
var ijod = require('ijod');
var locksmith = require('locksmith');
var profileManager = require('profileManager');
var servezas = require('servezas');
var taskList = require('taskList');


if (!program.profile) program.help();

var service = program.profile.split('@')[1];

function initialize(callback) {
  ijod.initDB(function() {
    taskList.init(function() {
      locksmith.init('clearProfile', function() {
        servezas.load();
        dMap.load();
        callback();
      });
    });
  });
}


function clearBase(base, callback) {
  ijod.getBounds(base, entries.options({}), function(err, bounds) {
    if (err) return callback(err);

    logger.info('Clearing', bounds.total, 'entries from', base);

    var toDelete = [];

    ijod.getRange(base, {}, function(item) {
      toDelete.push(item.idr);
    }, function(err) {
      if (err) return callback(err);

      async.forEachLimit(toDelete, 10, ijod.delOne, function(err) {
        logger.info('Done clearing', base);
        callback(err);
      });
    });
  });
}

function resetConfig(callback) {
  logger.info('Clearing config data');
  profileManager.reset(program.profile, callback);
}

function deleteTasks(callback) {
  logger.info('Deleting all tasks');
  taskList.del(program.profile, callback);
}

function error(err) {
  logger.error(err);
  process.exit(1);
}

initialize(function() {
  var bases = dMap.bases([program.profile]);

  logger.info(bases);
  async.forEach(bases, clearBase, function(err) {
    if (err) error(err);

    async.parallel([
      async.apply(resetConfig),
      async.apply(deleteTasks)
    ], function(err) {
      if (err) error(err);

      logger.info('Done');
      process.exit(0);
    });
  });
});
