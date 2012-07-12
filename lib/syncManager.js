var fs = require('fs');
var path = require('path');
var async = require('async');
var lconfig = require('lconfig');
var util = require('util');
var logger = require("logger.js").logger("syncManager");
var profileManager = require('profileManager');
var dal = require("dal");
var instruments = require("instruments");

var NUM_WORKERS = lconfig.syncManager.numWorkers || 4;
var PAGING_TIMING = lconfig.syncManager.pagingTiming || 2000;
var DEFAULT_SCAN_TIME = lconfig.syncManager.defaultScanTime || 5000;

var syncletManager;

exports.debug = false;

/**
* The database has a state field for the SyncSchedule table.  This field represents
* where the task is in the process of being ran.  The states are:
*
* 0 - Pending a run, normal waiting
* 1 - The task has been added to the local async work queue
* 2 - The task is currently executing in the synclet
* 3 - The task has finished and is awaiting processing and reschedule
*/
function SyncletManager()
{
  this.scheduled = {};
  this.offlineMode = false;
  this.completed = undefined;
}
// Async init
SyncletManager.prototype.init = function(liveWorker, callback) {
  var self = this;

  self.liveWorker = liveWorker;

  dal.query("CREATE TABLE IF NOT EXISTS SyncSchedule (`key` VARCHAR(255) PRIMARY KEY, worker VARCHAR(255), nextRun BIGINT UNSIGNED, state INT, task TEXT, errorCount INT NOT NULL, lastError VARCHAR(255))", [], function(error) {
    if(error) logger.error("Create error: %s", error);
    self.loadSynclets();
    if (self.offlineMode) {
      return callback();
    }
    // If we're not a worker and just talking to workers, we can bail early
    if (!self.liveWorker) return callback();

    self.workerName = process.env.WORKER || require("os").hostname();

    self.scanTimeout = undefined;
    self.active = {};
    self.last = [];
    self.total = 0;
    self.workQueue = async.queue(function(task, callback) {
      var key = Math.random().toString(16).substr(2);
      self.active[key] = task;
      self.runTask(task, function(){
        delete self.active[key];
        task.tdone = Date.now();
        // keep the last 100 tasks around for admin
        self.last.unshift(task);
        self.last = self.last.slice(0,100);
        callback();
      });
    }, NUM_WORKERS);
    self.workQueue.drain = function() {
      if (self.stopping) return self.stopping();
      self.scanAndRun();
    };

    // any jobs that were running when shutdown, clean up on start
    dal.query("UPDATE SyncSchedule SET worker=NULL, state=0 WHERE worker=?", [self.workerName], function(err){
      self.scanAndRun(true);
      logger.info("SyncManager is up and running for",self.workerName);
      callback();
    });
  });
};

SyncletManager.prototype.stop = function(stopCB) {
  if (this.workQueue.length() == 0) return stopCB();
  logger.info("Waiting for current work to finish.");
  this.stopping = stopCB;
};
// admin things used by worker web service
SyncletManager.prototype.backlog = function() {
  return this.workQueue.length();
}
SyncletManager.prototype.actives = function() {
  var ret = [];
  var self = this;
  Object.keys(self.active).forEach(function(key){ret.push(self.active[key])});
  return ret;
}
SyncletManager.prototype.lasts = function() {
  return this.last;
}
SyncletManager.prototype.totals = function() {
  return this.total;
}

SyncletManager.prototype.loadSynclets = function() {
  // not defensively coded! load synclets
  var self = this;

  function synclets(service) {
    logger.info("Loading the " + service + " service");
    if (!self.synclets[service]) self.synclets[service] = {};
    var sjs = self.services[service] = JSON.parse(fs.readFileSync(path.join(__dirname, 'services', service, 'synclets.json')));
    for (var i = 0; i < sjs.synclets.length; i++) {
      var sname = sjs.synclets[i].name;
      var spath = path.join("services", service, sname);
      delete require.cache[spath]; // remove any old one
      self.synclets[service][sname] = {
        frequency:sjs.synclets[i].frequency,
        sync:require(spath).sync
      };
      logger.info("\t* " + sname);
    }
  }
  // TODO from config
  this.synclets = {};
  this.services = {};
  synclets('twitter');
  synclets('facebook');
  synclets('instagram');
  synclets('foursquare');
  synclets('tumblr');
  synclets('linkedin');
  synclets('fitbit');
  synclets('gcontacts');
  synclets('github');
  synclets('wordpress');
  synclets('runkeeper');
  synclets('dropbox');
  synclets('google');
//  synclets('meetup');
  synclets('gmail');
  synclets('yammer');
};

// just return the list of services as loaded from disk
SyncletManager.prototype.getServices = function(callback) {
  callback(null, this.services);
};

/// Schedule a synclet to run
/**
* timeToRun is optional.  In this case the next run time is calculated
* based on normal frequency and tolerance methods.
* Task: {
*   synclet:{connector:"", name:""},
*   auth: {...},
*   config: {...},
*   user: "...opaque identifier..."
* }
*
* timeToRun:  milliseconds from epoch to run the task
*/
SyncletManager.prototype.schedule = function(task, timeToRun, cbDone) {
  if (!cbDone) cbDone = function() {};
  if (exports.debug) logger.debug("scheduling "+JSON.stringify(task)+" at "+timeToRun);
  if (!this.synclets[task.synclet.connector] || !this.synclets[task.synclet.connector][task.synclet.name]) {
    var E = new Error("Attempted to schedule an unregistered synclet: " + task.synclet.connector + "-" + task.synclet.name);
    logger.error(E);
    return cbDone(E);
  }
  var syncletInfo = this.synclets[task.synclet.connector][task.synclet.name];

  if (!syncletInfo.frequency) {
    var E = new Error("Attempted to schedule a run only synclet");
    logger.error(E);
    return cbDone(E);
  }

  // In offline mode things may only be ran directly with runTask
  if (this.offlineMode) return cbDone();

  var self = this;
  var key = this.getKey(task);
  var sql = "SELECT * FROM SyncSchedule WHERE `key`=? AND state > 0 AND worker != NULL";

  dal.query(sql, [self.getKey(task)], function(error, rows) {
    if (error) {
      var E = new Error("Error trying to find a key in the schdule: " + error);
      logger.error(E);
      return cbDone(E);
    }

    if (rows && rows.length == 1 && rows[0].state !== 0 && rows[0].state !== 3) {
      var E = new Error("Attempted to reschedule a synclet while it is running");
      logger.error(E);
      return cbDone(E);
    }

    if (timeToRun === undefined || timeToRun === null || timeToRun <= 0) {
      // We'll default to frequency unless paging
      var nextRun = (timeToRun < 0) ? PAGING_TIMING : parseInt(syncletInfo.frequency, 10) * 1000;
      // if not scheduled yet, schedule it to run in the future
      if (exports.debug) logger.debug("Making a fresh timetoRun from now");
      timeToRun = Date.now() + nextRun;
    }

    logger.info("scheduling " + key + " (freq " + syncletInfo.frequency + "s) to run in " + ((timeToRun - Date.now()) / 1000) + "s");
    dal.query("INSERT INTO SyncSchedule (`key`, worker, nextRun, state, task) VALUES(?, NULL, ?, 0, ?) ON DUPLICATE KEY UPDATE nextRun=VALUES(nextRun),task=VALUES(task),state=0,worker=NULL", [key, timeToRun, JSON.stringify(task)], function(error) {
      if (error) {
        logger.error("Failed to schedule " + key);
        // TODO
        return cbDone("Failed to schedule " + key);
      }
      if (self.liveWorker) self.scanAndRun();
      cbDone();
    });
  });
};
SyncletManager.prototype.updateState = function(key, state, cb) {
  var sql = "UPDATE SyncSchedule SET state=? WHERE `key`=?";
  var binds = [state, key];
  dal.query(sql, binds, cb);
};
SyncletManager.prototype.scanAndRun = function(forceStart) {
  if (!this.liveWorker) {
    logger.error("scanAndRun was called when not in live worker mode.");
    return;
  }

  if (this.scanTimeout) {
    clearTimeout(this.scanTimeout);
    this.scanTimeout = undefined;
  } else if (!forceStart) {
    // We bail here so that we can't double up
    return;
  }

  var self = this;
  function setNextScan(timeout) {
    if (timeout < 0) timeout = DEFAULT_SCAN_TIME;
    self.scanTimeout = setTimeout(function() { self.scanAndRun(); }, timeout || DEFAULT_SCAN_TIME);
  }
  var ranRows = 0;
  var limit = (NUM_WORKERS * 2) - self.workQueue.length();
  if (limit <= 0) return setNextScan();
  var sql = "UPDATE SyncSchedule SET worker=? WHERE nextRun <= UNIX_TIMESTAMP()*1000 AND worker IS NULL ORDER BY nextRun LIMIT " + limit;
  dal.query(sql, [self.workerName], function(error, rows) {
    if (error) logger.error(error);
    sql = "SELECT * FROM SyncSchedule WHERE worker=? AND state=0";
    dal.query(sql, [self.workerName], function(error, rows) {
      if (error) {
        logger.error("There was an error trying to scanAndRun",error);
        return setNextScan();
      }
      async.forEach(rows, function(row, cb) {
        ++ranRows;
        self.updateState(row.key, 1, function(error) {
          if (error) {
            logger.error("There was an error updating the state on " + row.key);
          }
          var task = JSON.parse(row.task);
          task.state = 1;
          self.workQueue.push(task);
          cb();
        });
      }, function(error) {
        // If we ran some rows, drain will reschedule us
        if (ranRows > 0) return setNextScan();
        dal.query("SELECT MIN(nextRun) AS nextRun FROM SyncSchedule WHERE worker=? AND state=0", [self.workerName], function(error, rows) {
          if (error) {
            logger.error("Error getting a nextRun time: " + error);
            return setNextScan();
          }
          var scanTimeout;
          if (rows.length === 1 && rows[0].nextRun) scanTimeout = rows[0].nextRun - Date.now();
          if (exports.debug) logger.debug("Setting next run timeout to %d - %j", scanTimeout, rows[0]);
          setNextScan(scanTimeout);
        });
      });
    });
  });
};
/// force an already scheduled task to run asap
SyncletManager.prototype.syncNow = function(key, cb) {
  if (cb === undefined) cb = function() {};
  // Unless we're a worker we never do this
  if (!this.liveWorker) return cb();
  var sql = "UPDATE SyncSchedule SET nextRun = 0 WHERE `key`=? AND worker IS NULL";
  var binds = [key];
  dal.query(sql, binds, function(err) {
    syncletManager.scanAndRun();
    cb(err ? err : null);
  });
};
/// Run the synclet and then attempt to reschedule it
SyncletManager.prototype.runTask = function(task, callback) {
  var self = this;
  var runInfo = {};

  if (!this.liveWorker) return callback("Not in a livemode");
  if (this.stopping) {
    // Reset the db entry to state 0 so it will get picked up ASAP
    dal.query("UPDATE SyncSchedule SET worker=NULL,state=0 WHERE `key`=?", [self.getKey(task)], function(error) {
      callback();
    });
    return;
  }

  function cbDone(err, response)
  {
    if (err) logger.warn(self.getKey(task) + " sync error: " + util.inspect(err).replace(/\s+/g," "));
    var elapsed = Date.now() - tstart;
    logger.verbose("Synclet finished " + self.getKey(task) + " in " + elapsed + "ms");
    // flag it's done, then send it out and be done
    task.state = 3;
    task.tpipe = Date.now();
    task.count = 0;
    // ugly but counts the total items being processed for admin/debug
    if(response && typeof response.data == 'object') Object.keys(response.data).forEach(function(key){if(Array.isArray(response.data[key])) task.count += response.data[key].length});
    self.total += task.count;
    self.updateState(self.getKey(task), 3, function(error) {
      if (task.count > 0 || !err) {
        var stats = {};
        stats["snyclet.items.services.rollup"] = task.count;
        stats["synclet.items.services." + task.synclet.connector + ".rollup"] = task.count;
        stats["synclet.items.services." + task.synclet.connector + "." + task.synclet.name] = task.count;
        instruments.modify(stats).send();
        instruments.increment("synclet.successful").send();
        dal.query("UPDATE SyncSchedule SET errorCount=0,lastError=NULL WHERE `key`=?", [self.getKey(task)], function(error) {
          if (self.completed) self.completed(response, task, runInfo, callback); // runinfo will always be populated by here
        });
      } else {
        instruments.increment("synclet.error."+task.synclet.connector+"."+task.synclet.name).send();
        var estr = (typeof err == 'string') ? err : util.inspect(err).replace(/\s+/g," ");
        dal.query("UPDATE SyncSchedule SET worker=NULL,errorCount=errorCount+1, lastError=? WHERE `key`=?", [estr.substr(0, 255), self.getKey(task)], function(error) {
          self.schedule(task);
          callback(err);
        });
      }
    });
  }
  // Don't reschdule, it's never going to work, drop it and assume they will reschedule
  if (!this.synclets[task.synclet.connector] || !this.synclets[task.synclet.connector][task.synclet.name]) {
    var E = new Error("Attempted to run an unregistered synclet: " + task.synclet.connector + "-" + task.synclet.name);
    logger.error(E);
    return callback(E);
  }

  logger.verbose("Synclet starting " + this.getKey(task));
  var tstart = task.tstart = Date.now();
  delete task.tpipe;
  delete task.tdone;
  delete task.count;
  var syncletInfo = this.synclets[task.synclet.connector][task.synclet.name];
  // load up the current auth/config data and prep to run a task
  async.series([
    function(cb) { profileManager.allGet(task.profile, function(err, ret){ runInfo = ret; cb(); }); },
    function(cb) { task.state = 2; self.updateState(self.getKey(task), 2, cb); }
  ], function() {
    if(!runInfo.auth) {
      logger.error("no auth found, skipping "+JSON.stringify(task));
      return callback(new Error("no auth found, skipping"));
    }
    if(!runInfo.config) runInfo.config = {};
    // in case something in the synclet barfs...
    instruments.increment("synclet.run").send();
    try {
      syncletInfo.sync(runInfo, cbDone);
    } catch(E) {
      cbDone(E); // this should never be a double-callback!
    }
  });
};
// This trivial helper function just makes sure we're consistent and we can change it easly
SyncletManager.prototype.getKey = function(task) {
  return task.profile + "/" + task.synclet.name;
};

syncletManager = new SyncletManager();
exports.manager = syncletManager;

// create the synclet tasks for a given service and auth
exports.initService = function (service, auth, callback, syncletId) {
  var synclets = syncletManager.synclets[service];
  if (!synclets) return callback("no synclets like that installed");
  async.forEachSeries(Object.keys(synclets), function (name, cb) {
    var synclet = synclets[name];
    // If they requested a specific synclet we'll skip everything but that one
    if(syncletId && name != syncletId) return cb();
    // TODO, should we merge with any existing matching task's config?
    // may need multiple auth's someday (different keys/permissions)
    var task = {
      synclet: {
        connector:service,
        name:name
      },
      profile:auth.pid
    };
    // this will save it async, and ask it to run immediately
    syncletManager.schedule(task, Date.now());
    cb();
  }, callback);
};

// Have a service run all of its synclets now
exports.flushService = function (service, pid, callback) {
  var synclets = syncletManager.synclets[service];
  if (!synclets) return callback("no synclets like that installed");
  async.forEachSeries(Object.keys(synclets), function (name, cb) {
    logger.debug("Resetting synclet %s/%s", service, name);
    var task = {
      synclet: {
        connector:service,
        name:name
      },
      profile:pid
    };
    syncletManager.syncNow(syncletManager.getKey(task), cb);
  }, callback);
};
