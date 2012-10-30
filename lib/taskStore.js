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

// The exponential factor for our tolerance backoff
var BACKOFF_FACTOR = 1.8;

// Broken down so you can visualize it, it's 86,400,000ms
var ONE_DAY = 24 * 60 * 60 * 1000;

// reconciles synclets.json with currently scheduled tasks
// saves existing tasks, creates new ones needed, deletes ones no longer needed
exports.reconcileTasks = function(curtasks, fixedfreq, service, force, auth, callback) {
  // go through all tasks that should exist, make them if they don't!
  upsertTasks(curtasks, fixedfreq, service, force, auth, function(err, toDelete, added) {
    if (err) return callback(err);

    // done adding, any leftovers need to be deleted
    deleteTasks(toDelete, function() {
      callback(null, added);
    });
  });
}

function upsertTasks(curtasks, fixedfreq, service, force, auth, callback) {
  var synclets = getLiveSynclets(service, auth.apps);
  var added = false;
  async.forEach(synclets, function(synclet, cbLoop) {
    var taskid = 'task:'+service+'/'+synclet+'#'+auth.pid;
    if (curtasks[taskid]) {
      var task = curtasks[taskid];
      delete curtasks[taskid]; // so only deleteable ones are left
      if(applyTask(task, fixedfreq) || force) return exports.saveTask(task, cbLoop);
      return cbLoop();
    }
    // create a new blank one
    logger.debug("creating new task",taskid);
    added = true;
    exports.saveTask(createTask(taskid, auth.pid, service, synclet, fixedfreq), cbLoop);
  }, function(err) {
    callback(err, curtasks, added);
  });
}

// returns the current set of synclets (as specd by synclets.json) for a serivce
function getLiveSynclets(service, apps) {
  // temp hack experimenting w/ disabling idego!
  var idego = apps && apps["0d0dfc9344d5046e55d57ed001573793"];
  if(idego && Object.keys(apps).length === 1) return [];

  // generate superset of all tasks based on the apps
  // PLACE HERE, getOne app mask info logic
  return servezas.syncletList(service);
}

function deleteTasks(tasks, callback) {
  async.forEach(Object.keys(tasks), function(taskid, cbLoop) {
    ijod.delOne(taskid, function() {
      // if the profile is active, we want to kill this task so it doesn't
      // get re-saved!
      locksmith.isLocked(tasks[taskid].pid, function(locked) {
        // one hour expirey so they auto cleanup
        if (locked) redis.setex(taskid, 3600, "taskUpdate deleted");
        cbLoop();
      });
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

function createTask(taskid, pid, service, synclet, fixedfreq, callback) {
  var task = {
    idr     : taskid,
    at      : Date.now(),
    pid     : pid,
    created : Date.now(),
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

// temporary export before a refactor to bring this inside of reconcileTasks
exports.checkFixedFreq = checkFixedFreq;
function checkFixedFreq(apps, callback) {
  var fixedFreq = false;
  // loop through each app
  async.forEach(apps, function(app, cbLoop) {
    appfetch(app, function(err, appinfo){
      if(!appinfo || !appinfo.notes) return cbLoop();
      if(appinfo.notes["ExtraFast Sync"]) fixedFreq = true;
      cbLoop();
    });
  }, function(err) {
    return callback(err, fixedFreq);
  });
}

// just save it out, setting next time appropriately
exports.saveTask = function(task, callback) {
  // check for any task deleted flag in redis and bail if so
  redis.get(task.idr, function(err, deleted) {
    if (deleted) return callback(new Error("task was deleted "+deleted));

    // determine new at based on nextRun and tolerance math
    var nextRun = task.nextRun;
    delete task.nextRun;

    if (nextRun < 0) nextRun = lconfig.taskman.pagingTiming;

    // use tolerance if nothing
    if (!nextRun) {
      var factor = Math.pow(BACKOFF_FACTOR, task.tolerance.current) + 1;
      var backoff = (1/(factor + 1)) * (factor * (factor + 1) / 2);
      nextRun = backoff * (parseInt(task.data.frequency, 10) * 1000);
      if (nextRun > ONE_DAY) nextRun = ONE_DAY; // We max at one day
      if (task.data.max && nextRun > (task.data.max * 1000)) {
        nextRun = (task.data.max * 1000); // allow synclet override max
      }
      logger.info("Applied a tolerance backoff to %s with a level of %d",
        task.idr, task.tolerance.current);
    }
    logger.debug("saving task %s nextRun(%d) tolerance(%j)",
        task.idr, nextRun, task.tolerance);

    task.at = parseInt(Date.now() + nextRun, 10);
    task.saved = Date.now(); // this forces it to be re-saved!
    ijod.batchSmartAdd([task], callback);
  });
}

// get all possible task objects
function getTasks(pid, callback) {
  if(!pid) return callback({});
  var service = pid.split('@')[1];
  if(!service || !servezas.synclets(service)) return callback({});
  var tasks = {};
  async.forEach(servezas.syncletList(service), function(synclet, cbLoop) {
    ijod.getOne('task:'+service+'/'+synclet+'#'+pid, function(err, task) {
      if (task) tasks[task.idr] = task;
      cbLoop();
    });
  }, function() {
    callback(tasks);
  });
}

exports.getTasks = getTasks;

// given an updated auth object for a profile, make sure it has all the correct
// tasks in the system
var APPCACHE = {};
// dump the cache hourly
setInterval(function(){
  APPCACHE = {};
}, 3600000);

function appfetch(app, callback) {
  if(APPCACHE[app]) return callback(null, APPCACHE[app]);
  acl.getApp(app, function(err, data){
    if(data) APPCACHE[app] = data;
    return callback(err, data);
  });
}

