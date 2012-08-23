var fs = require('fs');
var path = require('path');
var async = require('async');
var lconfig = require('lconfig');
var util = require('util');
var logger = require('logger').logger('taskman');
var profileManager = require('profileManager');
var dal = require('dal');
var ijod = require('ijod');
var instruments = require('instruments');
var pipeline = require('pipeline');
var redis;

var WORKER_NAME = process.env.WORKER || require("os").hostname();
var NUM_WORKERS = lconfig.taskman.numWorkers || 4;
var PAGING_TIMING = lconfig.taskman.pagingTiming || 1000;
var DEFAULT_SCAN_TIME = lconfig.taskman.defaultScanTime || 30000;
var BACKOFF_FACTOR = 1.8; // The exponential factor for our tolerance backoff
var LOCK_TIMEOUT = 60000; // how long before a lock is expired
var TASK_TIMEOUT = lconfig.taskman.timeout || 240000; // max runtime for any task
var TASK_GLOB = 60000; // how far into the future to run any upcoming tasks
var TASK_ERRDELAY = 43200000; // if it's error'd the last two times, when to try again

var ONE_DAY = 24 * 60 * 60 * 1000; // Broken down so you can visualize it, it's 86,400,000ms

var ONE_PROFILE = false; // to only run tasks for one profile

var STATS = {total:0, last:[]};
var SERVICES = {};
var SYNCLETS = {};
var WORKERS = {};
var TIMERS = {};

// the live flag makes this start doing work :)
exports.init = function(pid, live, callback) {
  if (!lconfig.taskman.redis) {
    logger.error('lconfig.taskman.redis is required, exiting');
    process.exit(1);
  }
  redis = require('redis').createClient(lconfig.taskman.redis.port, lconfig.taskman.redis.host);
  redis.on("error", function (err) { logger.error("Redis Error",err); });

  if (pid)
  {
    ONE_PROFILE = pid;
    logger.info("locking in to",pid);
  }


  exports.loadSynclets(function() {
    // we're init'd once we've selected our redis db
    redis.select(1, function() {
      // start threads!
      if (live)
      {
        TIMERS.check = setInterval(checkNext, PAGING_TIMING);
        fillNext();
      }
      callback();
    });
  });
};

exports.stop = function(callback)
{
  clearInterval(TIMERS.check);
  clearInterval(TIMERS.fill);
  if (STATS.stopped) return callback();
  STATS.stopped = true;
  if (Object.keys(WORKERS).length === 0) return callback();

  // try to kill each worker thread
  Object.keys(WORKERS).forEach(function(worker) {
    worker.killed = true;
  });
  // check again in 10sec to force kill
  setTimeout(function() {exports.stop(callback);}, 10000);
};

// just breaking out to be cleaner, load up any synclets.json
exports.loadSynclets = function(callback)
{
  var services = fs.readdirSync(path.join(__dirname,'services'));
  async.forEach(services, function(service, cbLoop) {
    var map = path.join(__dirname,'services',service,'synclets.json');
    path.exists(map, function(exists) {
      if (!exists) return cbLoop();
      logger.debug("loading",map);
      var sjs = SERVICES[service] = JSON.parse(fs.readFileSync(map));
      if (!SYNCLETS[service]) SYNCLETS[service] = {};

      for (var i = 0; i < sjs.synclets.length; i++) {
        var sname = sjs.synclets[i].name;
        var spath = path.join(__dirname, "services", service, sname);
        delete require.cache[spath]; // remove any old one
        SYNCLETS[service][sname] = {
          data: sjs.synclets[i],
          sync: require(spath).sync
        };
        logger.info("\t* " + sname);
      }

      cbLoop();
    });
  }, callback);
};

// util for webservices /services endpoint
exports.getServices = function(callback)
{
  callback(null, SERVICES);
};

exports.stats = function()
{
  STATS.workers = WORKERS;
  return STATS;
};

// trigger any profile to sync asap
exports.syncNow = function(pid, synclet, callback)
{
  logger.debug("force sync",pid,synclet);
  // TODO do we poll-wait for tasks to be updated to callback()??
  // if synclet, fetch/update task at to now
  redis.sadd("next",pid);
  callback();
};

// just raw tally to estimate
exports.backlog = function(callback)
{
  var total = 0;
  var oldest = Date.now();
  var bases = {};
  async.forEachSeries(Object.keys(SERVICES), function(service, cbSvcLoop) {
    async.forEach(Object.keys(SYNCLETS[service]), function(synclet, cbSyncLoop) {
      var base = 'task:'+service+'/'+synclet;
      ijod.getBounds(base, {until:Date.now()}, function(err, bounds) {
        if (err) logger.warn(err,base);
        if (bounds && bounds.total) total += parseInt(bounds.total, 10);
        if (bounds && bounds.oldest && bounds.oldest < oldest) oldest = parseInt(bounds.oldest, 10);
        if (bounds) bases[base] = bounds;
        cbSyncLoop();
      });
    }, cbSvcLoop);
  }, function() {
    callback({total:total, oldest:oldest, bases:bases});
  });
};

// force run everything for a pid right now
exports.syncForce = function(pid, callback)
{
  logger.debug("force running",pid);
  runWorker(pid, callback, true);
};

// try to pop a new task off the general redis next queue
function checkNext()
{
  if (Object.keys(WORKERS).length > NUM_WORKERS) return; // bail if already max busy
//  logger.debug("checking for any next work");
  redis.spop("next", function(err, pid) {
    if (!pid) return;
    isLocked(pid, function(locked) {
      if (locked) return;
      runWorker(pid, function() {
        process.nextTick(checkNext); // if a worker finished, look for more work asap!
      });
    });
  });
}

// scan due or soon-to-be-due tasks for profiles to get busy with, must only be run every 10s
function fillNext()
{
  if (STATS.shutdown) return;

  var pids = {};
  logger.debug("fillNext looking");
  var start = Date.now();
  async.forEachSeries(Object.keys(SERVICES), function(service, cbSvcLoop) {
    async.forEach(Object.keys(SYNCLETS[service]), function(synclet, cbSyncLoop) {
      // just get the 100 oldest... maybe use special db-only to get list of idrs and getOne each would be faster?
      ijod.getRange('task:'+service+'/'+synclet, {until:Date.now(), reverse:true, limit:100}, function(task) {
        if (ONE_PROFILE && task.pid !== ONE_PROFILE) return;
//        logger.debug('aged task',task.idr,task.at);
        pids[task.pid] = true;
      }, cbSyncLoop);
    }, cbSvcLoop);
  }, function() {
    var plist = Object.keys(pids);
    logger.debug("fillNext took",parseInt((Date.now() - start)/1000, 10),plist.length);
    if (plist.length === 0) return setTimeout(fillNext, DEFAULT_SCAN_TIME);

    // we've got tasks!
    // gotta async this so that the workers have a cycle to startup and be tracked
    async.forEachSeries(plist, function(pid, cbLoop) {
      if (Object.keys(WORKERS).length > NUM_WORKERS) {
        redis.sadd("next", pid); // dump into next queue for others if already max busy
        return cbLoop();
      }
      isLocked(pid, function(locked) {
        if (!locked) runWorker(pid, function() {});
        cbLoop();
      });
    }, function() {
      setTimeout(fillNext, DEFAULT_SCAN_TIME);
    });
  });
}

// just robin to redis to see if it's busy or expired
function isLocked(pid, callback)
{
  if (ONE_PROFILE && pid !== ONE_PROFILE) return callback(true); // convenient way to lock to just one profile
  redis.hget("active", pid, function(err, lock) {
    if (!lock) return callback(false);
    var bits = lock.split("\t"); // lock format: "heartbeat-timestamp\tworker-name"
    if (bits[0] > (Date.now() - LOCK_TIMEOUT)) return callback(true, bits);
    // invalid lock, delete it!
    logger.warn("removing expired lock",lock);
    redis.hdel("active", pid, function() { callback(false); }); // TODO very small race condition here if someone else removed and re-added inbetween
  });
}

// given an updated auth object for a profile, make sure it has all the correct tasks in the system
exports.taskUpdate = function(auth, callback, force)
{
  if (!auth.pid)
  {
    logger.warn("invalid auth, missing pid",auth);
    return callback(new Error("auth missing pid"));
  }
  var service = auth.pid.split('@')[1];
  if (!SYNCLETS[service]) return callback(new Error("unknown service"));

  // generate superset of all tasks based on the apps
  // PLACE HERE, getOne app mask info logic
  var livesynclets = Object.keys(SYNCLETS[service]); // just all for now
  var freqoverride = false; // masks might make it daily or something

  // fetch any existing tasks by looking for all possible ones
  getTasks(auth.pid, function(curtasks) {
    // go through all tasks that should exist, make them if they don't!
    var added = false;
    async.forEach(livesynclets, function(synclet, cbLoop) {
      var taskid = 'task:'+service+'/'+synclet+'#'+auth.pid;
      var task;
      if (curtasks[taskid]) {
        task = curtasks[taskid];
        delete curtasks[taskid]; // so only deleteable ones are left
        // TODO may need to modify frequency!!
        return force ? saveTask(task, cbLoop) : cbLoop(); // can be forced to reset
      }
      // create a new blank one
      logger.debug("creating new task",taskid);
      added = true;
      task = {idr:taskid, at:Date.now(), pid:auth.pid, created:Date.now(), service:service, synclet:synclet};
      task.data = SYNCLETS[service][synclet].data;
      task.tolerance = {
        averages: [], // The count of the most recent runs to maintain an average
        current: 0 // The current backoff factor
      };
      task.nextRun = -1; // run immediately
      saveTask(task, cbLoop);
    }, function(err) {
      if (err) return callback(err);

      // done adding, any leftovers need to be deleted
      async.forEach(Object.keys(curtasks), function(taskid, cbLoop) {
        ijod.delOne(taskid, function() {
          // if the profile is active, we want to kill this task so it doesn't get re-saved!
          isLocked(auth.pid, function(locked) {
            if (locked) redis.setex(taskid, 3600, "taskUpdate deleted"); // one hour expirey so they auto cleanup
            cbLoop();
          });
        });
      }, function() {
        if (added) redis.sadd("next",auth.pid); // if there's new tasks, def queue them up asap
        callback();
      });
    });
  });
};

// perform the synclet and pipeline, saving state at the end
function runTask(pi, task, callback)
{
  if (!pi || !task)
  {
    logger.warn("runtask invalid args", typeof pi, typeof task);
    return callback();
  }
  logger.debug("running task",task.idr);
  var tstart = task.tstart = Date.now();

  // all the post-processing of a synclet run, skip below where it runs
  var done = false; // be fucking paranoid about not double-callbacks
  var timer = setTimeout(function() {
    cbDone("forced timeout");
  }, TASK_TIMEOUT);

  function cbDone(err, response) {
    clearTimeout(timer);
    if (done) return logger.warn("DOUBLE CALLBACK IS BAD",task.idr);
    done = true;
    if (!response) response = {}; // easier to have this as the default
    if (err) logger.warn(task.idr,"sync error",util.inspect(err).replace(/\s+/g, " "));
    var lasterr = task.err;
    task.err = err;

    var elapsed = Date.now() - tstart;

    logger.verbose("Synclet finished",task.idr,"in",elapsed,"ms");

    // flag it's done, then send it out and be done
    task.tpipe = Date.now();
    task.count = 0;

    // ugly but counts the total items being processed for admin/debug
    if (typeof response.data === 'object') {
      Object.keys(response.data).forEach(function(key) {
        if (Array.isArray(response.data[key])) {
          task.count += response.data[key].length;
        }
      });
    }
    STATS.total += task.count;

    // if there's an error and no data, bail, but we process data even during an error since some synclets return them as a warning or where they got stuck
    if (task.err && task.count === 0) {
      instruments.increment("synclet.error." + task.service + "." + task.synclet).send();
      if (lasterr) task.nextRun = TASK_ERRDELAY;
      return saveTask(task, callback);
    }

    // Update our tolerance info
    var average = 0;
    if (task.tolerance.averages.length > 5) {
      task.tolerance.averages.forEach(function(avg) {
        average += avg;
      });
      average /= task.tolerance.averages.length;
    } else {
      // Until we have enough to get an idea of what they are moving, we're using an old threshold
      average = 50;
    }
    logger.debug("Average for tolerance is %d", average);

    if (task.count > average * 1.1) {
      // We're over the average, let's bump the tolerance down so we run more
      task.tolerance.current--;
      if (task.tolerance.current < 0) task.tolerance.current = 0;
    } else if (task.count === 0 || task.count <= average * 0.90) {
      // We got too little data, we can wait a bit longer
      task.tolerance.current++;
    }

    task.tolerance.averages.push(task.count);
    if (task.tolerance.averages.length > 10) task.tolerance.averages.shift();

    // if any auth updates, merge+flag it
    if (typeof response.auth === 'object')
    {
      pi.newauth = true;
      Object.keys(response.auth).forEach(function(key) {
        pi.auth[key] = response.auth[key];
      });
    }

    // if no data to process, shortcut
    if (task.count === 0) return saveTask(task, callback);

    task.tpipe = Date.now();

    // run it through the pipeline!
    pipeline.inject(response.data, pi.auth, function(err) {
      if (err)
      { // when we can't save, capture that state, but bail fast
        task.err = err;
        logger.warn("pipeline failed to save task data",task.idr,err);
        return saveTask(task, callback);
      }

      // if config updated, sanitize it and save it in background
      if (response.config && response.config.nextRun)
      {
        task.nextRun = response.config.nextRun;
        delete response.config.nextRun;
      }

      if (typeof response.config === 'object') {
        profileManager.configSet(pi.auth.pid, response.config, function() {});
      }

      task.tdone = Date.now();

      // update stats
      var stats = {};

      stats["synclet.items.services.rollup"] = task.count;
      stats["synclet.items.services." + task.service + ".rollup"] = task.count;
      stats["synclet.items.services." + task.service + "." + task.synclet] = task.count;

      instruments.modify(stats).send();

      instruments.increment("synclet.successful").send();

      // Log the duration of the synclet by its connector and name
      stats = {};

      var duration = task.tdone - task.tstart;

      stats["synclet.duration.rollup"] = duration;
      stats["synclet.duration." + task.service + ".rollup"] = duration;
      stats["synclet.duration." + task.service + "." + task.synclet] = duration;

      instruments.timing(stats).send();

      // Log at 60 seconds
      if (duration > 60000) {
        logger.info("Synclet " + task.service + "#" + task.synclet + " took > 60s to complete: " + Math.round(duration / 1000) + "s");
      }

      // keep the last 100 tasks around for admin
      STATS.last.unshift(task);
      STATS.last = STATS.last.slice(0, 100);

      // party time
      saveTask(task, callback);
    });
  }

  // tiem to run the synclet :)
  instruments.increment("synclet.run").send();
  instruments.increment("synclet.runs." + task.service + "." + task.synclet).send();

  // In case something in the synclet immediately barfs...
  try {
    SYNCLETS[task.service][task.synclet].sync(pi, cbDone);
  } catch(E) {
    cbDone(E);
  }
}

// just save it out, setting next time appropriately
function saveTask(task, callback)
{
  // check for any task deleted flag in redis and bail if so
  redis.get(task.idr, function(err, deleted) {
    if (deleted) return callback(new Error("task was deleted "+deleted));

    // determine new at based on nextRun and tolerance math
    var nextRun = task.nextRun;
    delete task.nextRun;

    if (nextRun < 0) nextRun = PAGING_TIMING;

    // use tolerance if nothing
    if (!nextRun) {
      var factor = Math.pow(BACKOFF_FACTOR, task.tolerance.current) + 1;
      var backoff = (1/(factor + 1)) * (factor * (factor + 1) / 2);
      nextRun = backoff * (parseInt(task.data.frequency, 10) * 1000);
      if (nextRun > ONE_DAY) nextRun = ONE_DAY; // We max at one day
      if (task.data.max && nextRun > (task.data.max * 1000)) nextRun = (task.data.max * 1000); // allow synclet override max
      logger.info("Applied a tolerance backoff to %s with a level of %d", task.idr, task.tolerance.current);
    }
    logger.debug("saving task %s nextRun(%d) tolerance(%j)", task.idr, nextRun, task.tolerance);

    task.at = parseInt(Date.now() + nextRun, 10);
    task.saved = Date.now(); // this forces it to be re-saved!
    ijod.batchSmartAdd([task], callback);
  });
}

// get all possible task objects
function getTasks(pid, callback)
{
  var service = pid.split('@')[1];
  var tasks = {};
  async.forEach(Object.keys(SYNCLETS[service]), function(synclet, cbLoop) {
    ijod.getOne('task:'+service+'/'+synclet+'#'+pid, function(err, task) {
      if (task) tasks[task.idr] = task;
      cbLoop();
    });
  }, function() {
    callback(tasks);
  });
}

exports.getTasks = getTasks;

// perform all possible tasks for this pid
function runWorker(pid, callback, force)
{
  if (WORKERS[pid]) return callback(new Error("already running"));
  if (STATS.stopped) return callback(new Error("shutting down"));

  // our process-wide tracking
  var self = WORKERS[pid] = {pid:pid, tasks:[], started:Date.now(), total:0, killed:false};
  self.service = pid.split('@')[1];

  // safety cleanup
  function cbDone(err, tasks)
  {
    if (err) logger.error("runWorker error",err);
    logger.debug("worker done",pid);
    clearInterval(self.hbtimer);
    redis.srem("next", pid); // in case it got queued for any reason
    redis.hdel("active",pid, function() {
      delete WORKERS[pid];
      callback(err, tasks);
    });
  }

  // first! acquire pid lock
  redis.hsetnx("active",pid,[Date.now(),WORKER_NAME].join("\t"), function(err, set) {
    if (err || set === 0) return cbDone(new Error("failed to acquire lock"));
    redis.srem("next", pid); // sometimes it got queued again, doesn't need to be now

    // validate and freshen our lock to heartbeat and stay alive
    self.hbtimer = setInterval(function() {
      logger.debug("heartbeating",pid);
      redis.hget("active",pid, function(err, lock) {
        if (!lock) return self.killed="lock missing";
        if (lock.indexOf(WORKER_NAME) === -1) return self.killed="lock stolen by "+lock;
        redis.hset("active",pid,[Date.now(),WORKER_NAME].join("\t"));
      });
    }, LOCK_TIMEOUT/2);

    // get the auth+config needed to run any task
    logger.debug("worker startup looking for tasks",pid);
    profileManager.allGet(pid, function(err, pi) {
      // ugly, but have to fetch all possible synclets (TODO are a bunch of
      // getOnes faster than a forced db range query on a set of idrs and
      // base+timestamp? or use redis to collect them?)
      getTasks(pid, function(tasks) {
        logger.info("scanning tasks", Object.keys(tasks).map(function(id) {
          return [id,tasks[id].at - Date.now()].join(" ");
        }).join(" "));

        // if somehow this is removed, dump the tasks!
        if (!pi || !pi.auth) {
          async.forEach(Object.keys(tasks), function(taskid, cbLoop) {
            logger.warn("missing profile info, removing task",taskid);
            ijod.delOne(taskid, function() { cbLoop(); });
          }, function() {
            return cbDone(new Error("missing profile info"));
          });
        }
        if (!pi.config) pi.config = {};

        // figure out which ones we're doing based on their .at being near to now
        var todo = [];
        var glob = Date.now();
        glob += TASK_GLOB; // set into the future
        async.forEach(Object.keys(tasks), function(taskid, cbLoop) {
          if (!force && tasks[taskid].at > glob) return cbLoop();
          todo.push(tasks[taskid]);
          // also save it into the future a bit so it stays out of the filler and in case this all goes bust it'll come back again
          tasks[taskid].nextRun = 300000; // 5 minutes into the future
          tasks[taskid].queued = Date.now();
          tasks[taskid].worker = WORKER_NAME;
          saveTask(tasks[taskid], cbLoop);
        }, function() {
          if (todo.length === 0)
          {
            logger.warn("no tasks found to do!", pid,
              Object.keys(tasks).map(function(id) {
                return [id, tasks[id].at].join(" ");
              }).join(" "));

            return cbDone();
          }

          self.tasks = todo;

          // do each task serially due to config sharing!
          logger.debug("working doing tasks",todo.length);
          async.forEachSeries(todo, function(task, cbLoop) {
            if (self.killed) return cbLoop();
            runTask(pi, task, cbLoop);
          }, function() {

            // auth info is rarely updated, must save it if so, can happen async
            if (pi.newauth) profileManager.authSet(pid, pi.auth, false, function(err) {
              if (err) logger.warn(err);
            });

            // release locks and return
            cbDone(null, self);
          });
        });
      });
    });
  });
}
