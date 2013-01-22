var async = require('async');
var lconfig = require('lconfig');
var logger = require('logger').logger('taskmaster');
var ijod = require('ijod');
var instruments = require('instruments');
var servezas = require('servezas');
var partition = require('partition');
var queenBee = require('queenBee');
var _ = require("underscore");
var redis;

// how often do we ask the db for aged tasks
var DEFAULT_SCAN_TIME = lconfig.taskmaster.defaultScanTime || 10000;
// how many tasks do we grab per scan
var SCAN_CHUNK = lconfig.taskmaster.scanChunk || 500;

var ENABLED_SERVICES = {};
var TIMERS = {};
var STATS = {};

exports.init = function(callback) {
  if (!lconfig.taskman.redis) {
    logger.error('lconfig.taskman.redis is required, exiting');
    process.exit(1);
  }
  redis = require('redis').createClient(
    lconfig.taskman.redis.port,
    lconfig.taskman.redis.host
  );
  redis.on("error", function (err) { logger.error("Redis Error", err); });

  logger.info('DEFAULT_SCAN_TIME', DEFAULT_SCAN_TIME);
  logger.info('SCAN_CHUNK', SCAN_CHUNK);

  servezas.load();

  // Load list of enabled services from config and convert into a set
  // for efficient validation
  lconfig.taskmaster.services = lconfig.taskmaster.services || servezas.serviceList();
  ENABLED_SERVICES = _.reduce(lconfig.taskmaster.services,
                              function (acc, s) { acc[s] = true; return acc; },
                              {});

  // we're init'd once we've selected our redis db
  redis.select(1, function() {
    queenBee.init(function() {
      fillNext(); // GO!
      entryCleanup();
      callback();
    });
  });
};

exports.stop = function(callback) {
  clearInterval(TIMERS.fill);
  if (STATS.shutdown) return callback();
  STATS.shutdown = true;
  return callback();
};

exports.stats = function() {
  return STATS;
};

// scan due or soon-to-be-due tasks for profiles to get busy with
function fillNext() {
  if (STATS.shutdown) return;
  logger.debug("fillNext looking");
  queenBee.serviceCounts(function(err, serviceCounts) {
    if (err) throw err;
    fillNextScan(serviceCounts);
  });
}

// actually scan ijod for pids that have tasks that are behind
function fillNextScan(serviceCounts) {
  var start = Date.now();
  var totals = { all: 0 };
  async.forEachSeries(servezas.serviceList(), function(service, cbSvcLoop) {
    // Noop if the service is not in ENABLED_SERVICES list
    if (!ENABLED_SERVICES[service]) {
      logger.debug("Skipping disabled service " + service);
      return cbSvcLoop();
    }

    // if this service is already active don't scan for more
    totals[service] = 0;
    if (serviceCounts[service] && serviceCounts[service] > SCAN_CHUNK) {
      logger.info('already have %d pids queued for %s, skipping',
        serviceCounts[service], service);
      return process.nextTick(cbSvcLoop);
    }

    async.forEach(servezas.syncletList(service), function(synclet, cbSyncLoop) {
      // just get the X oldest... maybe use special db-only to get list of idrs
      // and getOne each would be faster?
      ijod.getRange('task:' + service + '/' + synclet, {
        until: Date.now(),
        reverse: true,
        limit: SCAN_CHUNK
      }, function(task) {
        logger.debug('nexting', task.pid, task.at, task.idr);
        totals[service]++;
        totals.all++;
        var count = queenBee.enqueue(task.pid);
        if (count > 0) instruments.increment("taskmaster.enqueue").send();
      }, cbSyncLoop);
    }, cbSvcLoop);
  }, function() {
    logger.info("fillNext took", parseInt((Date.now() - start) / 1000, 10),
      "added", JSON.stringify(totals));
    setTimeout(fillNext, DEFAULT_SCAN_TIME);
  });
}

// nice way to just do no more than one at a time across everything
function entryCleanup() {
  if (STATS.shutdown) return;
  redis.spop("dirty", function(err, id) {
    if (!id) return setTimeout(entryCleanup, DEFAULT_SCAN_TIME);
    partition.cleanUp(id, entryCleanup);
  });
}
