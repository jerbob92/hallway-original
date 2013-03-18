/*
* Copyright (C) 2012-2013 Singly, Inc. All Rights Reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are permitted provided that the following conditions are met:
*    * Redistributions of source code must retain the above copyright
*      notice, this list of conditions and the following disclaimer.
*    * Redistributions in binary form must reproduce the above copyright
*      notice, this list of conditions and the following disclaimer in the
*      documentation and/or other materials provided with the distribution.
*    * Neither the name of the Locker Project nor the
*      names of its contributors may be used to endorse or promote products
*      derived from this software without specific prior written permission.
*
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
* ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
* WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
* DISCLAIMED. IN NO EVENT SHALL THE LOCKER PROJECT BE LIABLE FOR ANY
* DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
* (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
* LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
* ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
* (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
* SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

var fs = require('fs');
var async = require('async');
var lconfig = require('lconfig');
var util = require('util');
var logger = require('logger').logger('taskman-ng');
var profileManager = require('profileManager');
var instruments = require('instruments');
var pipeline = require('pipeline');
var taskList = require('taskList');
var servezas = require('servezas');
var lutil = require('lutil');
var idr = require('idr');
var _ = require('underscore');
var podClient = require("podClient");
var toobusy = require('toobusy');

var WORKER_NAME = process.env.WORKER || require("os").hostname();
var WORKER_KEY = WORKER_NAME.replace(/\..*$/, '');

// max runtime for any task
var TASK_TIMEOUT = lconfig.taskman.timeout || (60 * 4 * 1000);
// how far into the future to run any upcoming tasks
var TASK_GLOB = 60000;
// if it's error'd the last two times, when to try again
var TASK_ERRDELAY = 3600 * 12 * 1000;
// after this many attempts to run it w/o any success (synclet hung), disable
// completely
var TASK_ATTEMPTS = lconfig.taskman.attempts || 8;

var STATS = {total: 0,
             last: [],
             tasks: 0};
var ACTIVE = {};

// Initialize a pcron instance for scheduling purposes
// TODO: Move this code to a more logical location
var rclient = require("redis").createClient(lconfig.taskman.redis.port,
                                            lconfig.taskman.redis.host);
var pcron = require("pcron").init(rclient);

var lastHeartbeat = Date.now();

function checkLag(tag) {
  var lag = toobusy.lag();
  if (lag > 100) {
    console.log(tag + " lag: " + lag + " is toobusy? " + toobusy());
  }
}

exports.init = function (cbDone) {
  servezas.load();

  // Schedule a heartbeat to the parent process
  var heartbeatInterval = lconfig.taskman.heartbeat || 10000;
  setInterval(function () {
    checkLag("heartbeat");

    var now = Date.now();
    if ((now - lastHeartbeat) > (heartbeatInterval + 1000)) {
      logger.warn("Slow heartbeat: " + (now - lastHeartbeat) + "ms. Expected: " + heartbeatInterval +
                  "ms. Current lag: " + toobusy.lag());
    }
    lastHeartbeat = now;
    process.send({type: "alive"});
  }, heartbeatInterval);

  // Inbound messages from parent are work to do
  process.on('message', function (msg) {
    if (msg.type === "work") {
      var startTime = Date.now();
      logger.info("Starting work " + msg.id);
      runWorker(msg.id, function (err, nextRun) {
        var profileId = lutil.parseProfileId(msg.id);
        var resp = {type: "completed",
                    id: msg.id,
                    workerId: msg.workerId,
                    profile: profileId.id,
                    service: profileId.service};
        // TODO: Handle errors; need to reschedule for 12 hours in future??
        if (err) {
          resp.nextRun = Date.now() + TASK_ERRDELAY;
        } else {
          resp.nextRun = nextRun;
          if (resp.nextRun === null) {
            logger.warn("Not rescheduling " + msg.id + ": null nextRun provided.");
          }
        }

        var elapsedTime = Date.now() - startTime;
        var stats = {};
        stats["taskman.profileRuntime." + WORKER_KEY] = elapsedTime;
        instruments.timing(stats).send();

        var nextRunHuman = lutil.humanTimeFromSeconds((resp.nextRun - Date.now()) / 1000);
        logger.info("Finished work " + msg.id + " next run in " + nextRunHuman +
                    " @ " + resp.nextRun);
        process.send(resp);
      });
    } else {
      logger.error("Unexpected message from parent: " + JSON.stringify(msg));
    }
  });

  // Parent disconnect; shut down
  process.on('disconnect', function () {
    logger.info("Parent disconnect.");
    exports.stop(function () {
      process.exit(0);
    });
  });

  // Finally, inform parent that we're ready to go
  process.send({type: "ready"});

  cbDone();
};

exports.stop = function (callback) {
  if (STATS.stopped) return callback();
  STATS.stopped = true;

  // TODO: Need to refactor how we stop the running tasks
  // check again in 10sec to force kill
  setTimeout(function () { exports.stop(callback); }, 10000);
};

exports.stats = function () {
  STATS.workers = ACTIVE;
  return STATS;
};

exports.backlog = function (callback) {
  rclient.select(lconfig.worker.redis.database, function (err) {
    if (err) return callback(err);

    rclient.keys("*_schedule", function (err, scheduleKeys) {
      if (err) return callback(err);

      var scheduleNames = _.map(scheduleKeys, function (k) { return k.split("_")[0]; });

      pcron.schedule_info(scheduleNames, Date.now(), function (err, schedulesJson) {
        if (err) return callback(err);

        try {
          var schedules = JSON.parse(schedulesJson);

          // Walk each of the schedule keys, removing the _schedule suffix and tracking
          // total count
          var backlogCounts = { total: 0};
          _.each(_.pairs(schedules), function (pair) {
            var name = pair[0].split("_")[0];
            var count = pair[1];
            backlogCounts[name] = count;
            backlogCounts.total += count;
          });

          callback(null, backlogCounts);
        } catch (E) {
          callback(E);
        }
      });
    });
  });
};

exports.syncNow = function(pid, callback) {
  profileManager.loadProfile(pid, function(err, profile) {
    if (err) return callback(err);
    if (!profile) return callback(new Error('Missing profile: ' + pid));

    if (profile.pod) return podClient.syncNow(profile.pod, pid, callback);
    else return syncNowLocal(pid, callback);
  });
};

function syncNowLocal(pid, callback) {
  rclient.select(lconfig.worker.redis.database, function (err) {
    if (err) return callback(err);

    taskList.load(pid, function (err, tlist) {
      if (err) return callback(err);
      if (!tlist) return callback('no tasks for ' + pid);

      logger.info("Scheduling " + pid + " for immediate sync!");
      // make all tasks run immediately!
      Object.keys(tlist.tasks).forEach(function(key){
        tlist.tasks[key].nextRun = 1;
      });
      taskList.save(pid, tlist, function(err, next){
        if (err) return callback(err);
        var profileId = lutil.parseProfileId(pid);
        // set next = 1 to put the task in front of the backlog
        next = 1;
        pcron.schedule(profileId.service, profileId.id, next, false, callback);
      });
    });
  });
}

// Process all of a profile's pending work.
//
// callback should be: function(error, nextRun)
//
function runWorker(pid, callback) {
  if (STATS.stopped) return callback(new Error("shutting down"));

  var self = ACTIVE[pid] = {
    attempts: 0,
    pid     : pid,
    tasks   : [],
    started : Date.now(),
    total   : 0,
    killed  : false
  };

  self.service = lutil.parseProfileId(pid).service;

  // Final cleanup function
  function cleanup(err, nextRun) {
    if (err) logger.error("runWorker error for pid: " + pid, err);
    logger.debug("worker done", pid);
    delete ACTIVE[pid];
    callback(err, nextRun);
  }

  // Get the auth+config objects needed to run any task
  logger.debug("worker startup looking for tasks", pid);
  profileManager.allGet(pid, function (err, profileInfo) {

    // Fetch synclet state info and determine what needs to run
    taskList.load(pid, function (err, tlist) {
      // Handle error/empty cases
      if (err) logger.error('Error getting taskList: ' + JSON.stringify(err));
      if (!tlist || tlist.tasks === {}) return cleanup('No tasks found for ' + pid);

      // If the profile is missing/malformed, we can remove the individual task
      // entries and take steps to ensure it's not scheduled again
      if (!profileInfo || typeof profileInfo.auth !== "object" || !profileInfo.auth.pid) {
        return cleanup("Missing/malformed profile " + pid + " removing from schedule.", -1);
      }

      var now = Date.now();
      var delays = Object.keys(tlist.tasks).map(function (synclet) {
        var task = tlist.tasks[synclet];
        return [task.idr, now - task.at];
      });
      reportDelays(delays);
      logger.info("Scanning tasks " + pid + ":", delays.map(function (delay) {
        return delay[0] + ' ' + lutil.humanTimeFromSeconds(delay[1] / 1000);
      }).join(', '));

      if (!profileInfo.config) profileInfo.config = {};

      // Traverse each of the tasks and run them, merging their config changes into
      // the canonical copy of profileInfo each time.
      async.forEachSeries(Object.keys(tlist.tasks), function (task, cbLoop) {
        var profileCopy = JSON.parse(JSON.stringify(profileInfo));
        runTask(profileCopy, tlist.tasks[task], function (err, updatedConfig) {
          if (err) return cbLoop(err);
          _.extend(profileInfo.config, updatedConfig);
          cbLoop();
        });
      }, function (err) {
        if (err) logger.warn('Error processing pid: ' + profileInfo.auth.pid + ' ' + err);

        // Extract the auth and config updates (if they exist) and save them all at once
        // into profile store, following with task list. Note that if either step fails, we
        // generate a warning, but nothing more.
        var newAuth = profileInfo.config._auth;
        delete profileInfo.config._auth;
        var newConfig = profileInfo.config;
        profileManager.allSet(profileInfo.auth.pid, newAuth, newConfig, function (err) {
          if (err) logger.warn('Error updating config/auth for ' + profileInfo.auth.pid + ': ' + err);
          taskList.save(profileInfo.auth.pid, tlist, cleanup);
        });
      });
    });
  });
}


// perform the synclet and pipeline, saving state at the end
function runTask(profileInfo, task, fnCallback) {
  checkLag("runTask");

  // If the task is scheduled beyond the future threshold, there's
  // nothing to do
  if (task.at > Date.now() + TASK_GLOB) return fnCallback(null);

  logger.debug("running task", task.service);

  // If it's sandboxed, just pass in this synclet's config
  var sandboxed = servezas.isSandboxed(task.service);
  if (sandboxed) {
    profileInfo.all = profileInfo.config || {};
    profileInfo.config = profileInfo.config[task.synclet] || {};
  }

  // This is the first run if no tstart is defined or it's 0
  var firstRun = task.tstart <= 0;

  // Make sure tstart is initialized to current time
  task.tstart = Date.now();

  // all the post-processing of a synclet run, skip below where it runs
  function cleanup(err, response) {

    if (Date.now() - task.tstart > TASK_TIMEOUT)
      logger.warn(task.idr, "task sync ran over threshold (old Forced timeout)",
        Math.floor((Date.now() - task.tstart) / 1000));

    // Ensure we have a good or empty response
    response = response || {};

    if (err) {
      logger.warn(task.idr, "runTask error", util.inspect(err).replace(/\s+/g, " "));
      task.errors++;
    } else {
      task.errors = 0;
    }

    // Save the last error (if there is one) so we can adjust the delay on the
    // next run if necessary
    var lasterr = task.err;

    // Update task info
    task.err = err;
    task.attempts = 0; // it at least returned
    task.tpipe = Date.now();
    task.count = countObjectsReturned(response);

    logger.debug(task.idr, " synclet finished in ", task.tpipe - task.tstart, "ms");

    // if config has the signal of when to run again, tack that on this task
    if (response.config && response.config.nextRun) {
      task.nextRun = response.config.nextRun;
      delete response.config.nextRun;
      instruments.increment("synclet.nextrun").send();
    }

    // pass back the updated config, which will be saved by the parent function
    // save a pointer here, because response obj get modified along the way
    var cfg = response.config;

    function finishCleanup(err) {
      console.log("Cleaning up synclet: %s", task.idr);
      var configUpdate = cfg;
      // if it is sandboxed, namespace it to this synclet's name
      if (sandboxed) {
        configUpdate = {};
        configUpdate[task.synclet] = cfg;
        // move the _auth object to the top level
        if (cfg && cfg._auth) {
          configUpdate._auth = cfg._auth;
          delete cfg._auth;
        }
      }
      fnCallback(err, configUpdate);
    }

    STATS.total += task.count;
    STATS.tasks++;

    // if there's an error and no data, bail, but we process data even during an
    // error since some synclets return them as a warning or where they got
    // stuck
    if (task.err && task.count === 0) {
      var syncletError = "synclet.error." + task.service + "." + task.synclet;
      instruments.increment(syncletError).send();
      if (lasterr) task.nextRun = TASK_ERRDELAY;
      return finishCleanup();
    }

    updateTolerance(task);

    // if any auth updates, merge+flag it
    if (typeof response.auth === 'object') {
      if (!cfg) cfg = {};
      cfg._auth = {};

      Object.keys(response.auth).forEach(function (key) {
        cfg._auth[key] = response.auth[key];
      });
    }

    // if no data to process, shortcut
    if (task.count === 0) {
      task.tdone = Date.now();
      return finishCleanup();
    }

    // Run it through the pipeline; if there is an updated auth object, use it
    var auth = (cfg && cfg._auth) || profileInfo.auth;
    podClient.pipelineInject(response.data, auth, function (err, timings) {
      if (err) {
        task.err = err;
        logger.warn("Pipeline failed to save task data for: ", task.idr, " error ", err);
        return finishCleanup(err);
      }

      task.tdone = Date.now();

      logger.debug("Pipeline finished for: ", task.idr, " in ", task.tdone - task.tstart, "ms");

      sendStats(task, timings, firstRun);

      return finishCleanup();
    });
  } // cleanup()

  // Don't even bother attempting to run a task that has failed repeatedly
  if (task.attempts >= TASK_ATTEMPTS) {
    logger.warn("Max. task attempts exceeded for: ", task.idr, " ",
      task.attempts, " attempts");
    return cleanup("too many failed attempts to run");
  }

  // Increment # of attempts
  task.attempts++;

  // Update our stats
  instruments.increment("synclet.run").send();
  instruments.increment("synclet.runs.workers." + WORKER_KEY).send();
  instruments.increment("synclet.runs." + task.service + "." +
                        task.synclet).send();

  // In case something in the synclet immediately barfs...
  try {
    console.log("Starting synclet: %s", task.idr);
    servezas.synclet(task.service, task.synclet).sync(profileInfo, cleanup);
  } catch (E) {
    cleanup(E);
  }
}

function countObjectsReturned(response) {
  var count = 0;
  // ugly but counts the total items being processed for admin/debug
  if (typeof response.data === 'object') {
    Object.keys(response.data).forEach(function (key) {
      if (Array.isArray(response.data[key])) {
        count += response.data[key].length;
      }
    });
  }
  return count;
}

function updateTolerance(task) {
  var average = 0;

  // Update our tolerance info
  if (task.tolerance.averages.length > 5) {
    task.tolerance.averages.forEach(function (avg) {
      average += avg;
    });

    average /= task.tolerance.averages.length;
  } else {
    // Until we have enough to get an idea of what they are moving, we're
    // using an old threshold
    average = 50;
  }

  logger.debug("Average for tolerance is %d", average);

  if (task.count > average * 1.1) {
    // We're over the average, let's bump the tolerance down so we run more
    task.tolerance.current--;

    if (task.tolerance.current < 0) {
      task.tolerance.current = 0;
    }
  } else if (task.count === 0 || task.count <= average * 0.90) {
    // We got too little data, we can wait a bit longer
    task.tolerance.current = Math.min(++task.tolerance.current, 500);
  }

  task.tolerance.averages.push(task.count);

  if (task.tolerance.averages.length > 10) {
    task.tolerance.averages.shift();
  }
}

function reportDelays(delays) {
  var stats = {};
  delays.forEach(function(delay) {
    if (delay[1] < 0) return; // Task isn't scheduled yet; won't have run.
    var taskIDR = idr.parse(delay[0]);
    var stat = ['synclet.delay', taskIDR.host, taskIDR.path].join('.');
    stats[stat] = delay[1];
  });
  instruments.timing(stats).send();
}

function sendStats(task, timings, isFirstRun) {
  // Log a gauge of the # of items returned by the synclet by service and name
  var stats = {};

  var servicesPrefix = "synclet.items.services.";
  stats[servicesPrefix + task.service + "." + task.synclet] = task.count;

  instruments.modify(stats).send();

  instruments.increment("synclet.successful").send();

  // Log the duration of the synclet by service and name
  stats = {};

  var syncletDuration = task.tpipe - task.tstart;
  var pipelineDuration = task.tdone - task.tpipe;

  var syncDurationPrefix = "synclet.duration." + task.service;
  var pipeDurationPrefix = "pipeline.duration." + task.service;

  stats[syncDurationPrefix + "." + task.synclet] = syncletDuration;
  stats[pipeDurationPrefix + "." + task.synclet] = pipelineDuration;

  // Aggregate total time for synclet + pipeline
  stats["task.duration"] = task.tdone - task.tstart;

  if (isFirstRun) {
    var et = Date.now() - task.tstart;

    logger.info('firstData', lutil.humanTimeFromSeconds(et / 1000), 'for task',
      JSON.stringify(task));

    var firstDataPrefix = "synclet.firstData." + task.service;
    stats[firstDataPrefix + "." + task.synclet] = et;
    instruments.increment("synclet.firstrun").send();
  }

  instruments.timing(stats).send();

  // Log at 60 seconds
  if (syncletDuration > 60000 ||
    pipelineDuration > 60000) {
    logger.info("Synclet " + task.service + "#" + task.synclet +
      " took > 60s to complete: " +
      Math.round(syncletDuration / 1000) + "s synclet, " +
      Math.round(pipelineDuration / 1000) + "s pipeline, " +
      "pipeline breakout:", timings);
  }

  // keep the last 100 tasks around for admin
  STATS.last.unshift(task);
  STATS.last = STATS.last.slice(0, 100);
}

exports.fresh = function (base, callback) {
  // TODO: Consider a way to implement effective dispatch+notification when work
  // is done. For the moment, this is only invoked as part of the ?fresh=true
  // code path so we will simply always bypass
  return callback();
};

// Removed:
// freshenUp(synclets, service, pid, callback) - Runs a set of synclets if they
//                                               are older than STALE_TIME
// entryDirty(id) - Add this entry id to a queue of dirty ones
