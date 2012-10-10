var fs = require('fs');
var path = require('path');
var async = require('async');
var lconfig = require('lconfig');
var util = require('util');
var logger = require('logger').logger('taskman');
var profileManager = require('profileManager');
var dal = require('dal');
var idrlib = require('idr');
var ijod = require('ijod');
var instruments = require('instruments');
var pipeline = require('pipeline');
var acl = require('acl');
var redis;

var WORKER_NAME = process.env.WORKER || require("os").hostname();
var NUM_WORKERS = lconfig.taskman.numWorkers || 4;
var PAGING_TIMING = lconfig.taskman.pagingTiming || 1000;
var DEFAULT_SCAN_TIME = lconfig.taskman.defaultScanTime || 30000;
var STALE_TIME = lconfig.taskman.staleTime || 600000; // when a task is considered stale for freshness support
var SCAN_CHUNK = lconfig.taskman.scanChunk || 100; // how many tasks do we grab per scan
var BACKOFF_FACTOR = 1.8; // The exponential factor for our tolerance backoff
var LOCK_TIMEOUT = 60000; // how long before a lock is expired
var TASK_TIMEOUT = lconfig.taskman.timeout || 240000; // max runtime for any task
var TASK_GLOB = 60000; // how far into the future to run any upcoming tasks
var TASK_ERRDELAY = 43200000; // if it's error'd the last two times, when to try again

var ONE_DAY = 24 * 60 * 60 * 1000; // Broken down so you can visualize it, it's 86,400,000ms

var ONE_PROFILE = false; // to only run tasks for one profile

var STATS = {total:0, last:[], tasks:0};
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
    fs.exists(map, function(exists) {
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
        if (bounds && bounds.total) total += bounds.total;
        if (bounds && bounds.oldest && bounds.oldest < oldest) oldest = bounds.oldest;
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
  logger.debug("fillNext looking");
  var scount = {};
  redis.smembers("next", function(err, nexts){
    if(nexts) nexts.forEach(function(pid){
      var svc = pid.split('@')[1];
      if(!scount[svc]) scount[svc] = 0;
      scount[svc]++;
    });
    fillNextScan(scount);
  });
}

function fillNextScan(scount)
{
  var pids = {};
  var start = Date.now();
  async.forEachSeries(Object.keys(SERVICES), function(service, cbSvcLoop) {
    if(scount[service] && scount[service] > SCAN_CHUNK) return cbSvcLoop(); // if this service is already active don't scan for more
    async.forEach(Object.keys(SYNCLETS[service]), function(synclet, cbSyncLoop) {
      // just get the X oldest... maybe use special db-only to get list of idrs and getOne each would be faster?
      ijod.getRange('task:'+service+'/'+synclet, {until:Date.now(), reverse:true, limit:SCAN_CHUNK}, function(task) {
        if (ONE_PROFILE && task.pid !== ONE_PROFILE) return;
//        logger.debug('aged task',task.idr,task.at);
        pids[task.pid] = true;
      }, cbSyncLoop);
    }, cbSvcLoop);
  }, function() {
    var plist = Object.keys(pids);
    logger.info("fillNext took",parseInt((Date.now() - start)/1000, 10),plist.length);
    if (plist.length === 0) return setTimeout(fillNext, DEFAULT_SCAN_TIME);

    // we've got tasks!
    // gotta async this so that the workers have a cycle to startup and be tracked
    var nexted = [];
    async.forEachSeries(plist, function(pid, cbLoop) {
      if (Object.keys(WORKERS).length > NUM_WORKERS) {
        redis.sadd("next", pid); // dump into next queue for others if already max busy
        nexted.push(pid);
        return cbLoop();
      }
      isLocked(pid, function(locked) {
        if (!locked) runWorker(pid, function() {});
        cbLoop();
      });
    }, function() {
      logger.info("nexted ",nexted.join(" "));
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
var APPCACHE = {};
setInterval(function(){ APPCACHE = {}; }, 3600000); // dump the cache hourly
function appfetch(app, callback)
{
  if(APPCACHE[app]) return callback(null, APPCACHE[app]);
  acl.getApp(app, function(err, data){
    if(data) APPCACHE[app] = data;
    return callback(err, data);
  });
}

// I'm hating the logic in this function, it def needs a refactor
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
  var fixedfreq = false; // disable tolerance

  /// apply any mods from apps
  function applyTask(task)
  {
    var changed = false;
    if (fixedfreq && task.data.max != task.data.frequency) {
      logger.info("fixing frequency ",task.idr,task.data.frequency);
      task.data.max = task.data.frequency;
      changed = true;
    }
    return changed;
  }

  // loop through each app
  async.forEach((typeof auth.apps == 'object' && Object.keys(auth.apps)) || [], function(app, cbLoop){
    appfetch(app, function(err, appinfo){
      if(!appinfo || !appinfo.notes) return cbLoop();
      if(appinfo.notes["ExtraFast Sync"]) fixedfreq = true;
      cbLoop();
    });
  }, function(err){

    if(auth.apps && auth.apps["0d0dfc9344d5046e55d57ed001573793"] && Object.keys(auth.apps).length == 1) livesynclets = []; // temp hack experimenting w/ disabling idego!

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
          if(applyTask(task) || force) return saveTask(task, cbLoop);
          return cbLoop()
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
        applyTask(task);
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
  });
};

// perform the synclet and pipeline, saving state at the end
function runTask(pi, task, callback)
{
  if (!pi || !task) {
    logger.warn("runtask invalid args", typeof pi, typeof task);

    return callback();
  }

  logger.debug("running task", task.idr);

  task.tstart = Date.now();

  // be fucking paranoid about not double-callbacks
  var done = false;

  var timer = setTimeout(function() {
    cbDone("forced timeout");
  }, TASK_TIMEOUT);

  // all the post-processing of a synclet run, skip below where it runs
  function cbDone(err, response) {
    clearTimeout(timer);

    if (done) {
      return logger.warn("DOUBLE CALLBACK IS BAD", task.idr);
    }

    done = true;

    if (!response) {
      // easier to have this as the default
      response = {};
    }

    if (err) {
      logger.warn(task.idr, "sync error", util.inspect(err).replace(/\s+/g, " "));
    }

    var lasterr = task.err;

    task.err = err;

    // flag it's done, then send it out and be done
    task.tpipe = Date.now();
    task.count = 0;

    logger.verbose("Synclet finished", task.idr, "in", task.tpipe - task.tstart, "ms");

    // ugly but counts the total items being processed for admin/debug
    if (typeof response.data === 'object') {
      Object.keys(response.data).forEach(function(key) {
        if (Array.isArray(response.data[key])) {
          task.count += response.data[key].length;
        }
      });
    }

    STATS.total += task.count;
    STATS.tasks++;

    // if there's an error and no data, bail, but we process data even during an
    // error since some synclets return them as a warning or where they got stuck
    if (task.err && task.count === 0) {
      instruments.increment("synclet.error." + task.service + "." + task.synclet).send();

      if (lasterr) task.nextRun = TASK_ERRDELAY;

      return saveTask(task, callback);
    }

    var average = 0;

    // Update our tolerance info
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

      if (task.tolerance.current < 0) {
        task.tolerance.current = 0;
      }
    } else if (task.count === 0 || task.count <= average * 0.90) {
      // We got too little data, we can wait a bit longer
      task.tolerance.current++;
    }

    task.tolerance.averages.push(task.count);

    if (task.tolerance.averages.length > 10) {
      task.tolerance.averages.shift();
    }

    // if any auth updates, merge+flag it
    if (typeof response.auth === 'object') {
      pi.newauth = true;

      Object.keys(response.auth).forEach(function(key) {
        pi.auth[key] = response.auth[key];
      });
    }

    // if no data to process, shortcut
    if (task.count === 0) {
      return saveTask(task, callback);
    }

    task.tpipe = Date.now();

    // run it through the pipeline!
    pipeline.inject(response.data, pi.auth, function(err) {
      // when we can't save, capture that state, but bail fast
      if (err) {
        task.err = err;

        logger.warn("pipeline failed to save task data",task.idr,err);

        return saveTask(task, callback);
      }

      // if config updated, sanitize it and save it in background
      if (response.config && response.config.nextRun) {
        task.nextRun = response.config.nextRun;

        delete response.config.nextRun;
      }

      if (typeof response.config === 'object') {
        profileManager.configSet(pi.auth.pid, response.config, function() {});
      }

      task.tdone = Date.now();

      logger.verbose("Pipeline finished", task.idr, "in", task.tdone - task.tstart, "ms");

      // Log a gauge of the # of items returned by the synclet by service and name
      var stats = {};

      stats["synclet.items.services.rollup"] = task.count;
      stats["synclet.items.services." + task.service + ".rollup"] = task.count;
      stats["synclet.items.services." + task.service + "." + task.synclet] = task.count;

      instruments.modify(stats).send();

      instruments.increment("synclet.successful").send();

      // Log the duration of the synclet by service and name
      stats = {};

      var syncletDuration = task.tpipe - task.tstart;
      var pipelineDuration = task.tdone - task.tpipe;

      stats["synclet.duration.rollup"] = syncletDuration;
      stats["synclet.duration." + task.service + ".rollup"] = syncletDuration;
      stats["synclet.duration." + task.service + "." + task.synclet] = syncletDuration;

      stats["pipeline.duration.rollup"] = pipelineDuration;
      stats["pipeline.duration." + task.service + ".rollup"] = pipelineDuration;
      stats["pipeline.duration." + task.service + "." + task.synclet] = pipelineDuration;

      instruments.timing(stats).send();

      // Log at 60 seconds
      if (syncletDuration > 60000 ||
        pipelineDuration > 60000) {
        logger.info("Synclet " + task.service + "#" + task.synclet +
          " took > 60s to complete: " +
          Math.round(syncletDuration / 1000) + "s synclet, " +
          Math.round(pipelineDuration / 1000) + "s pipeline");
      }

      // keep the last 100 tasks around for admin
      STATS.last.unshift(task);
      STATS.last = STATS.last.slice(0, 100);

      // party time
      saveTask(task, callback);
    });
  }

  // time to run the synclet :)
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
  if(!pid) return callback({});
  var service = pid.split('@')[1];
  if(!service || !SYNCLETS[service]) return callback({});
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

  // handy cb wrapper
  function tasksNow(cbTasks)
  {
    // if given a list of tasks already, use and force run them
    if(typeof force == 'object') return cbTasks(force);
    getTasks(pid, cbTasks);
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
      tasksNow(function(tasks) {
        logger.info("scanning tasks", Object.keys(tasks).map(function(id) {
          return [id,tasks[id].at - Date.now()].join(" ");
        }).join(" "));

        // if somehow this is removed, dump the tasks!
        if (!pi || typeof pi.auth != "object") {
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
          if (force) return cbLoop(); // when being force run don't stage them forward
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

// optionally run a base here if needed
exports.fresh = function(base, callback) {
  if(!base) return callback();
  var r = idrlib.parse(base);
  var service = r.host;
  var endpoint = r.path;
  var synclets = SYNCLETS[service];
  if(!r.host || !synclets) return callback(new Error("invalid service "+service));
  var pid = [encodeURIComponent(r.auth),r.host].join('@');

  // have to find out which synclets matched
  var matched = {};
  // and which synclets they depend on for freshness
  var deps = [];
  Object.keys(synclets).forEach(function(sname){
    if(sname == endpoint) matched[sname] = true;
    var data = synclets[sname].data;
    if (data.aka && data.aka.indexOf(endpoint) >= 0) matched[sname] = true;
    // check for freshness depdendencies
    if (matched[sname] && data.freshDeps) {
      deps.push(data.freshDeps);
    }
  });

  // now get all of those tasks and see if they've become stale
  freshenUp(deps, service, pid, STALE_TIME, function(errDeps) {
    // if dependencies ran, then we need to run regardless of last sync time
    var staleTime = 0;
    if (errDeps === -1) staleTime = STALE_TIME;
    // regular error check
    else if (errDeps) return callback(errDeps);
    // run the regular matched synclets
    freshenUp(Object.keys(matched), service, pid, staleTime, function(err) {
      if (err && err !== -1) return callback (err);
      callback();
    });
  });

}

// runs a set of synclets if they are older than staleTime
function freshenUp(synclets, service, pid, staleTime, callback) {
  var tasks = {};
  async.forEach(synclets, function(synclet, cbLoop) {
    ijod.getOne('task:'+service+'/'+synclet+'#'+pid, function(err, task) {
      // if task is older than stale time, or always allow freshening up self synclets
      var stale = task && (Date.now() - task.saved > staleTime);
      if (stale || synclet == 'self') tasks[task.idr] = task;
      cbLoop();
    });
  }, function() {
    if(Object.keys(tasks).length == 0) return callback(-1);
    isLocked(pid, function(locked){ // this will clear stale locks too
      if(locked) return callback("currently running");
      console.info("fresh running ",Object.keys(tasks));
      runWorker(pid, callback, tasks);
    });
  });
}
