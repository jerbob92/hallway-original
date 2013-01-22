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
var ijod = require('ijod');
var instruments = require('instruments');
var pipeline = require('pipeline');
var taskStore = require('taskStore');
var servezas = require('servezas');
var pcron = require('pcron');
var lutil = require('lutil');
var _ = require('underscore');

var WORKER_NAME = process.env.WORKER || require("os").hostname();
var WORKER_KEY = WORKER_NAME.replace(/\..*$/, '');

// max runtime for any task
var TASK_TIMEOUT = lconfig.taskman.timeout || (60*4*1000);
// how far into the future to run any upcoming tasks
var TASK_GLOB = 60000;
// if it's error'd the last two times, when to try again
var TASK_ERRDELAY = 3600*12*1000;
// after this many attempts to run it w/o any success (synclet hung), disable completely
var TASK_ATTEMPTS = lconfig.taskman.attempts || 8;

var STATS = {total: 0,
             last: [],
             tasks: 0};
var ACTIVE = {};

exports.init = function (cbDone) {
  servezas.load();

  // Schedule a heartbeat to the parent process
  setInterval(function () {process.send({type: "alive"}); }, lconfig.taskman.heartbeat || 10000);

  // Inbound messages from parent are work to do
  process.on('message', function (msg) {
    if (msg.type === "work") {
      logger.info("Starting work " + msg.id);
      runWorker(msg.id, function (err, nextRun) {
        var parts = msg.id.split("@");
        var resp = {type: "completed",
                    id: msg.id,
                    workerId: msg.workerId,
                    profile: parts[0],
                    service: parts[1]};
        // TODO: Handle errors; need to reschedule for 12 hours in future??
        if (err) {
          resp.nextRun = Date.now() + TASK_ERRDELAY;
        } else {
          resp.nextRun = nextRun;
          if (resp.nextRun === null) logger.warn("Not rescheduling " + msg.id + ": null nextRun provided.");
        }

        var nextRunHuman = lutil.humanTimeFromSeconds((resp.nextRun - Date.now()) / 1000);
        logger.info("Finished work " + msg.id + " next run in " + nextRunHuman + " @ " + resp.nextRun);
        process.send(resp);
      });
    } else {
      logger.error("Unexpected message from parent: " + JSON.stringify(msg));
    }
  });

  // Parent disconnect; shut down
  process.on('disconnect', function () {
    logger.info("Parent disconnect.");
    exports.stop(function () {});
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
  pcron.schedule_info(lconfig.taskman.schedules, Date.now(), function (schedules) {
    var backlog = _.reduce(_.values(schedules), function (acc, count) { return acc + count; }, 0);
    callback(backlog);
  });
};


exports.taskUpdate = function (auth, cbDone, force) {
  if (!auth.pid) {
    return process.nextTick(
      cbDone.bind(null, new Error("taskUpdate: auth missing pid")));
  }

  var service = auth.pid.split('@')[1];
  if (!servezas.synclets(service)) {
    return process.nextTick(
      cbDone.bind(null, new Error("taskUpdate: unknown service")));
  }

  taskStore.reconcileTasks(auth, force, cbDone);
};

// Things not currently implemented (and should go elsewhere)
// * syncNow - force a given profile to be synced right away

// Process all of a profile's pending work.
//
// callback should be: function(error, nextRun)
//
function runWorker(pid, callback) {
  if (STATS.stopped) return callback(new Error("shutting down"));

  var self = {
    attempts: 0,
    pid     : pid,
    tasks   : [],
    started : Date.now(),
    total   : 0,
    killed  : false
  };
  self.service = pid.split('@')[1];

  // Final cleanup function
  function cleanup(err, nextRun) {
    if (err) logger.error("runWorker error for pid: " + pid, err);
    logger.debug("worker done", pid);
    callback(err, nextRun);
  }

  // Get the auth+config objects needed to run any task
  logger.debug("worker startup looking for tasks", pid);
  profileManager.allGet(pid, function (err, profileInfo) {

    // Fetch all possible synclets and evaluate each of them to determine what
    // needs to run
    // TODO: Inefficient; target for next round of optimizations
    taskStore.getTasks(pid, function (err, tasks) {
      // Handle error/empty cases
      if (err) logger.error('Error getting tasks from IJOD: ' + JSON.stringify(err));
      if (!tasks || Objects.keys(tasks).length === 0) return cleanup('No tasks found for ' + pid);

      // If the profile is missing/malformed, we can remove the individual task
      // entries and take steps to ensure it's not scheduled again
      if (!profileInfo || typeof profileInfo.auth !== "object" || !profileInfo.auth.pid) {
        return async.forEach(Object.keys(tasks), function (taskid, cbLoop) {
          ijod.delOne(taskid, cbLoop);
        }, function () {
          return cleanup("Missing/malformed profile " + pid + " removed tasks: " + Object.keys(tasks));
        });
      }

      // Provide some contextual info in the log
      var now = Date.now();
      logger.info("Scanning tasks " + pid + " ", Object.keys(tasks).map(function (id) {
        return [id, tasks[id].at - now].join(" ");
      }).join(" "));


      if (!profileInfo.config) profileInfo.config = {};

      // figure out which ones we're doing based on their .at being near to
      // now
      var todo = [];
      var threshold = now + TASK_GLOB;
      async.forEach(Object.keys(tasks), function (taskid, cbLoop) {
        // Skip tasks that are scheduled beyond the threshold in the future
        if (tasks[taskid].at > threshold) {
          return process.nextTick(cbLoop);
        }

        // Add the task to our task list
        todo.push(tasks[taskid]);

        // REVIEW: We used to save the task 30 mins into the future to ensure it
        // got reprocessed; pcron handles all this with its GC system.
        tasks[taskid].queued = Date.now();
        cbLoop();
      }, function () {
        if (todo.length === 0) {
          // There are no tasks that need immediate processing. Use the task
          // list as the basis for our calculation.
          var minObj = _.min(tasks, function (t) { return t.at; });
          logger.warn("No pending tasks for " + pid);
          return cleanup(null, minObj.at);
        }

        self.tasks = todo;

        // "Sandboxed" tasks are those tasks which are safe to run in parallel
        if (servezas.isSandboxed(self.service)) {
          doTasksInParallel(todo, self, profileInfo, cleanup);
        } else {
          doTasksInSeries(todo, self, profileInfo, cleanup);
        }
      });
    });
  });
}

function doTasksInSeries(todo, self, profileInfo, cbDone) {
  logger.debug('Processing tasks in series for ', profileInfo.auth.pid, ': ', todo.length);
  async.forEachSeries(todo, function (task, cbLoop) {
    if (self.killed) return process.nextTick(cbLoop);
    var profileCopy = JSON.parse(JSON.stringify(profileInfo));
    runTask(profileCopy, task, function (err, config) {
      if (err) return cbLoop(err);
      updateConfig(config, profileInfo.auth.pid, cbLoop);
    });
  }, function (err) {
    var minObj = _.min(todo, function (t) { return t.at; });
    cbDone(err, minObj.at);
  });
}


function doTasksInParallel(todo, self, profileInfo, cbDone) {
  logger.debug('Processing tasks in parallel for ', profileInfo.auth.pid, ': ', todo.length);
  // collect configs and then save them all in series so we can run
  // the tasks in parallel without worrying about race conditions
  // there is definitely a better way to do this, but this works consistently
  // for now
  var configUpdates = [];
  async.forEach(todo, function (task, cbLoop) {
    if (self.killed) return process.nextTick(cbLoop);
    var piCopy = JSON.parse(JSON.stringify(profileInfo));
    runTask(piCopy, task, function (err, config) {
      if (err) return cbLoop(err);
      if (config) configUpdates.push(config);
      cbLoop();
    });
  }, function () {
    // Update the configs in series to avoid an insert race condition
    async.forEachSeries(configUpdates, function (configUpdate, cbLoop) {
      updateConfig(configUpdate, profileInfo.auth.pid, cbLoop);
    }, function (err) {
      // REVIEW: So if we fail to update a config, we just give up an any remaining?!
      // (this is original behaviour; I'm just unclear as to _why_)
      if (err) {
        logger.error('Error updating config for pid:' + profileInfo.auth.pid +
                     ' config:', configUpdates);
      }
      var minObj = _.min(todo, function (t) { return t.at; });
      cbDone(err, minObj.at);
    });
  });
}


function updateConfig(configUpdate, pid, cb) {
  if (!configUpdate) return process.nextTick(cb);
  // auth info is rarely updated, must save it if so, can happen async
  if (configUpdate && configUpdate._auth) {
    return profileManager.authSet(pid, configUpdate._auth, false, function (err) {
      if (err) logger.warn(err);
      delete configUpdate._auth;
      profileManager.configSet(pid, configUpdate, cb);
    });
  }

  profileManager.configSet(pid, configUpdate, cb);
}

// perform the synclet and pipeline, saving state at the end
function runTask(profileInfo, task, fnCallback) {
  logger.debug("running task", task.idr);

  // If it's sandboxed, just pass in this synclet's config
  var sandboxed = servezas.isSandboxed(task.service);
  if (sandboxed) {
    profileInfo.all = profileInfo.config || {};
    profileInfo.config = profileInfo.config[task.synclet] || {};
  }

  task.tstart = Date.now();

  // all the post-processing of a synclet run, skip below where it runs
  function cleanup(err, response) {

    if (Date.now() - task.tstart > TASK_TIMEOUT)
      logger.warn(task.idr, "task sync ran over threshold (old Forced timeout)", Math.floor((Date.now() - task.tstart)/1000));

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
    }

    // pass back the updated config, which will be saved by the parent function
    // save a pointer here, because response obj get modified along the way
    var cfg = response.config;

    function finishCleanup(err) {
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
      return taskStore.saveTask(task, finishCleanup);
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
      return taskStore.saveTask(task, finishCleanup);
    }

    // Run it through the pipeline; if there is an updated auth object, use it
    var auth = (cfg && cfg._auth) || profileInfo.auth;
    pipeline.inject(response.data, auth, function (err, timings) {
      if (err) {
        task.err = err;
        logger.warn("Pipeline failed to save task data for: ", task.idr, " error ", err);
        return taskStore.saveTask(task, finishCleanup);
      }

      task.tdone = Date.now();

      logger.debug("Pipeline finished for: ", task.idr, " in ", task.tdone - task.tstart, "ms");

      sendStats(task, timings);

      // Remove the flag that indicates this is the first time running
      delete task.firstRun;

      taskStore.saveTask(task, finishCleanup);
    });
  } // cleanup()


  // Don't even bother attempting to run a task that has failed repeatedly
  if (task.attempts >= TASK_ATTEMPTS)
  {
    logger.warn("Max. task attempts exceeded for: ", task.idr, " ", task.attempts, " attempts");
    return cleanup("too many failed attempts to run");
  }

  // Increment # of attempts
  task.attempts++;

  // Update our stats
  instruments.increment("synclet.run").send();
  instruments.increment("synclet.runs.workers." + WORKER_KEY).send();
  instruments.increment("synclet.runs." + task.service + "." +
                        task.synclet).send();

  // Write out our state for debugging
  fs.writeFileSync("/tmp/work.json", JSON.stringify(exports.stats()));

  // In case something in the synclet immediately barfs...
  try {
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

function sendStats(task, timings) {
  // Log a gauge of the # of items returned by the synclet by service and name
  var stats = {};

  var servicesPrefix = "synclet.items.services.";
  stats[servicesPrefix + "rollup"] = task.count;
  stats[servicesPrefix + task.service + ".rollup"] = task.count;
  stats[servicesPrefix + task.service + "." + task.synclet] = task.count;

  instruments.modify(stats).send();

  instruments.increment("synclet.successful").send();

  // Log the duration of the synclet by service and name
  stats = {};

  var syncletDuration = task.tpipe - task.tstart;
  var pipelineDuration = task.tdone - task.tpipe;

  var syncDurationPrefix = "synclet.duration." + task.service;
  stats["synclet.duration.rollup"] = syncletDuration;
  stats[syncDurationPrefix + ".rollup"] = syncletDuration;
  stats[syncDurationPrefix + "." + task.synclet] = syncletDuration;

  var pipeDurationPrefix = "pipeline.duration." + task.service;
  stats["pipeline.duration.rollup"] = pipelineDuration;
  stats[pipeDurationPrefix + ".rollup"] = pipelineDuration;
  stats[pipeDurationPrefix + "." + task.synclet] = pipelineDuration;

  // Aggregate total time for synclet + pipeline
  stats["task.duration.rollup"] = task.tdone - task.tstart;

  if (task.firstRun) {
    var et = Date.now() - task.created;
    logger.info('firstData', et, 'for task', task);
    var firstDataPrefix = "synclet.firstData." + task.service;
    stats["synclet.firstData.rollup"] = et;
    stats[firstDataPrefix + ".rollup"] = et;
    stats[firstDataPrefix + "." + task.synclet] = et;
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

// Removed:
// fresh(base, callback) - Optionally run a base in-line
// freshenUp(synclets, service, pid, callback) - Runs a set of synclets if they
//                                               are older than STALE_TIME
// entryDirty(id) - Add this entry id to a queue of dirty ones
