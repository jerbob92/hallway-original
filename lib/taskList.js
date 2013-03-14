/*
* Copyright (C) 2012 Singly, Inc. All Rights Reserved.
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

var _ = require("underscore");
var acl = require("acl");
var async = require("async");
var instruments = require("instruments");
var lconfig = require("lconfig");
var logger = require("logger").logger("taskList");
var lutil = require("lutil");
var profileManager = require("profileManager");
var servezas = require("servezas");
var ijod = require("ijod");


/*
 Task list structure:
 {
    profileId: "user@service",
    tasks: { <synclet1> : {...},
             <synclet2> : {...} }
}
*/

var KVSTORE;

exports.init = function (cbDone) {
  KVSTORE = require('kvstore').instance(lconfig.taskman.store.type,
                                        lconfig.taskman.store);
  if (KVSTORE === null) {
    logger.error("Failed to initialize KVSTORE in taskList!");
    process.exit(1);
  }
  cbDone();
};


function loadTaskList(service, auth, cbDone) {
  KVSTORE.get("tasks", auth.pid, {}, function (err, taskList) {
    if (err) {
      return cbDone(err);
    } else if (taskList) {
      return cbDone(null, taskList);
    } else {
      // No task list was found; initialize it and check IJOD
      taskList = {tasks: {}};
      getTasksFromIJOD(service, auth, taskList, function () {
        cbDone(null, taskList);
      });
    }
  });
}

exports.load = function (profileId, cbDone) {
  var startTime = Date.now();
  var profile = lutil.parseProfileId(profileId);

  // Look up auth object for this profile
  profileManager.authGet(profileId, null, function (err, auth) {
    if (err) return cbDone(err);
    if (!auth || !auth.pid) return cbDone(new Error("No auth available for: " + profileId));

    // Load the task list (with fallback to IJOD)
    loadTaskList(profile.service, auth, function (err, taskList) {
      if (err) return cbDone(err);

      // Make sure mandatory top-level fields are present
      taskList.tasks = taskList.tasks || {};
      taskList.profileId = profileId;
      taskList._profile = profile;

      // Update the list of tasks to reflect current state of apps associated
      // with this profile. Once the update is complete, it will invoke the cbDone
      // with the finished task list
      updateTaskList(taskList._profile, auth, taskList, function (err) {
        if (err) return cbDone(new Error("taskList.load.updateTaskList on " +
                                         profileId + " failed: " + err));
        instruments.timing({"taskList.load": (Date.now() - startTime)}).send();
        logger.debug("Loaded tasks for " + profileId + ": " +
                    JSON.stringify(taskList));
        cbDone(null, taskList);
      });
    });
  });
};

exports.save = function (profileId, taskList, cbDone) {
  var startTime = Date.now();

  // Make a copy of the provided object (since we need to do some modifications)
  taskList = JSON.parse(JSON.stringify(taskList));

  // For each task, calculate the next time it's due. This also updates the .at
  // field on the task structure
  async.reduce(Object.keys(taskList.tasks), undefined, function (acc, taskId, cbLoop) {
    calcNextRun(taskList, taskId, function (err, nextRun) {
      // Ensure acc the smallest value we've seen
      if (acc === undefined) acc = nextRun;
      cbLoop(err, Math.min(acc, nextRun));
    });
  }, function (err, minNextRun) {
    if (err) return cbDone(new Error("taskList.save.calcNextRuns on " + profileId +
                                     " failed: " + err));

    // Task list is now up to date with next run times; remove the cached fields
    // and then save to KV
    delete taskList._apps;
    delete taskList._profile;

    KVSTORE.put("tasks", profileId, taskList, function (err) {
      if (err) return cbDone(new Error("taskList.save for " + profileId + " failed: " + err));

      // Save was successful, let caller know
      instruments.timing({"taskList.save": (Date.now() - startTime)}).send();
      logger.debug("Saved tasks for " + profileId + ": " + JSON.stringify(taskList));
      return cbDone(null, minNextRun);
    });
  });
};

exports.del = function (profileId, cbDone) {
  KVSTORE.del("tasks", profileId, cbDone);
};

// ---------------------------------
// Internal
// ---------------------------------

function newTask(service, synclet, pid) {
  return {
    idr: "task:" + service + "/" + synclet + "#" + pid,
    at: Date.now(),
    synclet: synclet,
    service: service,
    data: servezas.syncletData(service, synclet),
    tolerance: {
      averages: [],
      current: 0
    }
  };
}

// The exponential factor for our tolerance backoff
var BACKOFF_FACTOR = 1.8;

// Broken down so you can visualize it, it's 86,400,000ms
var ONE_DAY = 24 * 60 * 60 * 1000;


function updateTaskList(profile, auth, taskList, cbDone) {
  getLiveSynclets(profile.service, auth.apps, function (err, synclets, classes) {
    // keep the most recently calculated classes stored on the tasklist too
    taskList.classes = classes;

    logger.info("Pid:", auth.pid,
      "| Classes:", Object.keys(classes).sort().join(", "),
      "| ConfiguredSynclets:", synclets.sort().join(", "),
      "| ExistingSynclets:", Object.keys(taskList.tasks || {}).sort().join(", "),
      "| for apps:", Object.keys(auth.apps || {}).sort().join(", "));

    // For each live synclet, verify that an entry exists, or create it if
    // necessary
    synclets.forEach(function (synclet) {
      if (taskList.tasks[synclet] === undefined)
        taskList.tasks[synclet] = newTask(profile.service, synclet, auth.pid);
    });

    // Now, remove any tasks which are NOT in the list of synclets.
    Object.keys(taskList.tasks).forEach(function (key) {
      if (_.indexOf(synclets, key) === -1)
        delete taskList.tasks[key];
    });

    // Cache the list of apps to facilitate next run calculation
    if (auth.apps) taskList._apps = Object.keys(auth.apps);
    else taskList._apps = [];

    // Ok, task list is fully populated; notify caller
    cbDone(null);
  });
}

// Returns the currently set of synclets that are active for a given set of
// apps. AllSynclets intersected w/ EnabledSyncletsPerApp -> union(Result)
function getLiveSynclets(service, apps, cbDone) {
  acl.getAppsClasses(Object.keys(apps || {}), function (err, classes) {
    if (err) return cbDone(err);
    cbDone(null, servezas.syncletList(service, classes), classes);
  });
}

// Loads any tasks it can find from IJOD. All errors are logged, but ignored.
function getTasksFromIJOD(service, auth, taskList, cbDone) {
  getLiveSynclets(service, auth.apps, function (err, synclets) {
    if (err) {
      logger.warn("taskList.getTasksFromIJOD failed to load synclet list for " +
                  auth.pid + ": " + err);
      return cbDone();
    }

    var counter = 0;
    async.forEachSeries(synclets, function (synclet, cbLoop) {
      var taskid = 'task:' + service + '/' + synclet + '#' + auth.pid;
      ijod.getOne(taskid, function (err, task) {
        if (err || !task) return cbLoop();
        else taskList.tasks[synclet] = task;
        counter++;
        cbLoop();
      });
    }, function () {
      logger.info("Loaded " + counter + " tasks from IJOD for " + auth.pid);
      cbDone();
    });
  });
}


// Update the .at field of the task with the next time this task should be run.
function calcNextRun(taskList, taskId, cbDone) {
  var task = taskList.tasks[taskId];
  var apps = taskList._apps;
  var service = taskList._profile.service;
  var idr = taskId + "#" + taskList.profileId;
  var now = Date.now();

  var nextRun = task.nextRun;
  delete task.nextRun;

  if (nextRun < 0) nextRun = lconfig.taskman.pagingTiming;

  if (nextRun) {
    task.at = now + nextRun;
    cbDone(null, task.at);
  } else if (task.at > now) {
    // It's already scheduled in the future, don't mess w/ it
    cbDone(null, task.at);
  } else {
    // No nextRun was provided; calculate it
    acl.customFreq(apps, service, taskId, function (err, customFreq) {

      // Default frequency
      var freq = task.data.frequency;

      if (err) {
        logger.warn('error getting customFreq %s, %j, using defaults', idr, err);
      } else if (customFreq) {
        // Custom frequency; use that over the one specified on the task
        logger.info('using custom frequency (no tolerance) for %s %ds', idr, customFreq);

        // Output a warning if we have multiple apps with custom frequencies (??)
        if (apps && apps.length > 1) {
          logger.warn('custom frequency multiple apps: %s', idr);
        }

        task.at = now + (customFreq * 1000);
        return cbDone(null, task.at);
      }

      var factor = Math.pow(BACKOFF_FACTOR, task.tolerance.current) + 1;
      var backoff = (1 / (factor + 1)) * (factor * (factor + 1) / 2);

      nextRun = backoff * freq * 1000;

      if (nextRun > ONE_DAY) nextRun = ONE_DAY; // We max at one day

      if (task.data.max && nextRun > (task.data.max * 1000)) {
        nextRun = (task.data.max * 1000); // allow synclet override max
      }

      logger.info("Applied a tolerance backoff to %s with a level of %d",
                  idr, task.tolerance.current);

      task.at = now + nextRun;
      cbDone(null, task.at);
    });
  }
}
