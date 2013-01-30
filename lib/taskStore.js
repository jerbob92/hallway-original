var async = require('async');
var lconfig = require('lconfig');
var redis = require('redis').createClient(
              lconfig.taskman.redis.port,
              lconfig.taskman.redis.host);

var acl = require('acl');
var ijod = require('ijod');
var servezas = require('servezas');
var logger = require('logger').logger('taskStore');
var locksmith = require('locksmith');
var profileManager = require('profileManager');

// enough has changed with tasks, this file is due for a refactor/rethink/reorg - jer 1/25

// The exponential factor for our tolerance backoff
var BACKOFF_FACTOR = 1.8;

// Broken down so you can visualize it, it's 86,400,000ms
var ONE_DAY = 24 * 60 * 60 * 1000;

// only used to set the task store for now
var kstore;
exports.init = function(options, cbDone)
{
  kstore = options.store;
  cbDone();
}

// reconciles synclets.json with currently scheduled tasks
// saves existing tasks, creates new ones needed, deletes ones no longer needed
exports.reconcileTasks = function(auth, force, callback) {
  if (!auth || !auth.pid) {
    return process.nextTick(callback.bind(null, 'invalid auth object'));
  }
  if (!auth.apps) {
    logger.warn('auth object missing apps, detasking', auth.pid);
    return process.nextTick(exports.detask.bind(null, auth.pid, callback));
  }
  exports.getTasks(auth.pid, true, function(err, curtasks) {
    if (err) logger.error('error getting tasks:', err);
    // go through all tasks that should exist, make them if they don't!
    upsertTasks(curtasks, force, auth, function(err, toDelete, added) {
      if (err) return callback(err);
      // done adding, any leftovers need to be deleted
      exports.deleteTasks(toDelete, function() {
        callback(null, added);
      });
    });
  });
};

function upsertTasks(curtasks, force, auth, callback) {
  var apps = (typeof auth.apps === 'object' && Object.keys(auth.apps)) || [];
  acl.areFixedFreq(apps, function(err, fixedfreq) {
    var service = auth.pid.split('@')[1];
    getLiveSynclets(service, auth.apps, function(err, synclets) {
      if (err) return callback(err, synclets);
      var added = false;
      async.forEach(synclets, function(synclet, cbLoop) {
        var task;
        var taskid = getTaskID(service, synclet, auth.pid);
        if (curtasks && curtasks[taskid]) {
          task = curtasks[taskid];
          delete curtasks[taskid]; // so only deleteable ones are left
          // when force rewriting tasks, unblock them so they can try again
          if (force) {
            delete task.attempted;
            delete task.err;
          }
          if (applyTask(task, fixedfreq) || force) {
            return exports.saveTask(task, cbLoop);
          }
          return cbLoop();
        }
        // create a new blank one
        logger.debug("creating new task",taskid);
        added = true;
        task = createTask(auth.pid, service, synclet, fixedfreq);
        exports.saveTask(task, cbLoop);
      }, function(err) {
        callback(err, curtasks, added);
      });
    });
  });
}

// returns the current set of synclets (as specd by synclets.json) for a serivce
function getLiveSynclets(service, apps, callback) {
  if (!apps || typeof apps !== 'object') {
    return process.nextTick(callback.bind(null, 'no apps'));
  }
  acl.getAppsClasses(Object.keys(apps), function(err, classes) {
    if (err) return callback(err, classes);
    callback(null, servezas.syncletList(service, classes));
  });
}

exports.deleteTasks = function (tasks, callback) {
  if (!tasks || typeof tasks !== 'object') {
    return process.nextTick(callback);
  }
  async.forEach(Object.keys(tasks), function(taskid, cbLoop) {
    logger.info('deleting task', taskid);
    kstore.del(taskid, function() {
      // XXXXXXXXXXXXX
      // TODO how do I delete it from pcron? what if it's running?? it'll just get resaved :( 
      cbLoop();
    });
  }, callback);
}

// apply any mods from apps (fixed frequencies)
// return true if it was
function applyTask(task, fixedfreq) {
  if (fixedfreq && task.data.max !== task.data.frequency) {
    logger.info("fixing frequency ",task.idr,task.data.frequency);
    task.data.max = task.data.frequency;
    return true;
  }
  return false;
}

function createTask(pid, service, synclet, fixedfreq, callback) {
  var task = {
    idr     : getTaskID(service, synclet, pid),
    at      : Date.now(),
    pid     : pid,
    created : Date.now(),
    firstRun: true,
    service : service,
    synclet : synclet
  };
  task.data = servezas.syncletData(service, synclet);
  task.tolerance = {
    averages: [], // count of the most recent runs to maintain an average
    current: 0 // The current backoff factor
  };
  task.nextRun = -1; // run immediately
  applyTask(task, fixedfreq);
  return task;
}

// just save it out, setting next time appropriately
exports.saveTask = function(task, callback) {
  // check for any task deleted flag in redis and bail if so
  redis.get(task.idr, function(err, deleted) {
    if (deleted) return callback(new Error("task was deleted "+deleted));

    calcNextRun(task, function(err, nextRun) {
      if (err) return callback(err, nextRun);
      writeTask(task, nextRun, callback);
    });
  });
};

function calcNextRun(task, callback) {
  // determine new at based on nextRun and tolerance math
  var nextRun = task.nextRun;
  delete task.nextRun;

  if (nextRun < 0) nextRun = lconfig.taskman.pagingTiming;

  if (nextRun) return process.nextTick(callback.bind(null, null, nextRun));

  acl.customFreq(task.apps, task.service, task.synclet, function(err, customFreq) {
    if (err) {
      logger.warn('error getting customFreq %s, %j, using defaults',
        task.idr, err);
    } else if (customFreq) {
      logger.info('using custom frequency for %s %ds', task.idr, customFreq);
      if(task.apps && task.apps.length > 1) {
        logger.info('custom frequency multiple apps: %s', task.idr);
      }
      // if it's the same as the default, we'll just use the regular tolerance
      if (customFreq === task.data.frequency) {
        logger.info('customFreq using default + tolerance: %s', task.idr);
      } else {
        return callback(null, customFreq * 1000);
      }
    }
    // no custom frequency, just use synclets.json
    var factor = Math.pow(BACKOFF_FACTOR, task.tolerance.current) + 1;
    var backoff = (1/(factor + 1)) * (factor * (factor + 1) / 2);
    nextRun = backoff * (parseInt(task.data.frequency, 10) * 1000);
    if (nextRun > ONE_DAY) nextRun = ONE_DAY; // We max at one day
    if (task.data.max && nextRun > (task.data.max * 1000)) {
      nextRun = (task.data.max * 1000); // allow synclet override max
    }
    logger.info("Applied a tolerance backoff to %s with a level of %d",
      task.idr, task.tolerance.current);
    callback(null, nextRun);
  });
}

function writeTask(task, nextRun, callback) {
  logger.info("saving task %s nextRun:%ds tolerance(%j)",
      task.idr, Math.round(nextRun/1000), task.tolerance);

  task.at = parseInt(Date.now() + nextRun, 10);
  task.saved = Date.now(); // this forces it to be re-saved!
  kstore.set(task.idr, task, callback, {bucket:task.service});
}

// get all possible task objects
// includeRogue means "check for all possible tasks for this pid, not just
// ones we expect to be scheduled"
exports.getTasks = function(pid, includeRogue, callback) {
  if (!callback && typeof includeRogue === 'function') {
    callback = includeRogue;
    includeRogue = false;
  }
  if (!pid) return callback(new Error('invalid pid:' + pid), {});
  var service = pid.split('@')[1];
  if (!service || !servezas.synclets(service)) {
    return callback('invalid service: ' + service, {});
  }

  profileManager.authGet(pid, null,  function(err, auth) {
    if (err) return callback(err);
    if (!auth) return callback('no auth for ' + pid);
    // attach the list of apps to the task, used later for scheduling
    function insertApps(err, tasks) {
      if (err || !tasks) return callback(err, tasks);
      Object.keys(tasks).forEach(function(taskid) {
        var task = tasks[taskid];
        task.apps = auth && auth.apps && Object.keys(auth.apps);
        if (!task.apps) logger.warn('no apps for %s', task.idr);
      });
      return callback(null, tasks);
    }
    if (includeRogue) {
      return getTasksFromIJOD(service, servezas.syncletList(service),
                              pid, true, insertApps);
    }
    getLiveSynclets(service, auth.apps, function(err, synclets) {
      if (err) return callback(err);
      getTasksFromIJOD(service, synclets, pid, false, insertApps);
    });
  });
};

function getTasksFromIJOD(service, synclets, pid, ignoreErrors, callback) {
  var tasks = {};
  async.forEach(synclets, function(synclet, cbLoop) {
    var taskid = getTaskID(service, synclet, pid);
    kstore.get(taskid, function(err, task) {
      if ((err || !task) && !ignoreErrors) {
        return cbLoop('error getting tasks for ' + taskid);
      }
      if (task) tasks[task.idr] = task;
      cbLoop();
    });
  }, function(err) {
    callback(err, tasks);
  });
}

exports.detask = function(pid, callback) {
  exports.getTasks(pid, true, function(err, tasks) {
    if (err) return callback(err, tasks);
    exports.deleteTasks(tasks, callback);
  });
};

function getTaskID(service, synclet, pid) {
  return 'task:' + service + '/' + synclet + '#' + pid;
}

// removed
// exports.taskCount = function(since, until, callback) {
// exports.taskRange = function(service, synclet, range, callback) {
