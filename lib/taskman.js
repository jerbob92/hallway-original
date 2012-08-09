var fs = require('fs');
var path = require('path');
var async = require('async');
var lconfig = require('lconfig');
var util = require('util');
var logger = require('logger').logger('taskman');
var profileManager = require('profileManager');
var dal = require('dal');
var instruments = require('instruments');
var redis;

var WORKER_NAME = process.env.WORKER || require("os").hostname();;
var NUM_WORKERS = lconfig.taskman.numWorkers || 4;
var PAGING_TIMING = lconfig.taskman.pagingTiming || 1000;
var DEFAULT_SCAN_TIME = lconfig.taskman.defaultScanTime || 10000;
var BACKOFF_FACTOR = 1.8; // The exponential factor for our tolerance backoff
var DEFAULT_PRIORITY = 2048; // Priority < 1024 == 'urgent' to beanstalk
var LOCK_TIMEOUT = 60000; // how long before a lock is expired
var TASK_GLOB = 60000; // how far into the future to run any upcoming tasks

var ONE_DAY = 24 * 60 * 60 * 1000; // Broken down so you can visualize it, it's 86,400,000ms

var ONEPROFILE = false; // to only run tasks for one profile

var STATS = {total:0, now:Date.now()};
var SERVICES = {};
var SYNCLETS = {};
var WORKERS = {};

// the live flag makes this start doing work :)
exports.init = function(pid, live, callback) {
  if (!lconfig.taskman.redis) {
    logger.error('lconfig.taskman.redis is required, exiting');
    process.exit(1);
  }
  redis = require('redis').createClient(lconfig.taskman.redis.port, lconfig.taskman.redis.host);
  redis.on("error", function (err) { logger.error("Redis Error",err); });

  ONEPROFILE = pid;

  exports.loadSynclets(function(){        
    // we're init'd once we've selected our redis db
    redis.select(1, function(){
      // start threads!
      if(live)
      {
        setInterval(checkNext, PAGING_TIMING);
        setInterval(fillNext, DEFAULT_SCAN_TIME);
        fillNext(); // run immediately too
      }
      callback();
    });
  });
};

// just breaking out to be cleaner, load up any synclets.json
exports.loadSynclets = function(callback)
{
  var services = fs.readdirSync(path.join(__dirname,'services'));
  async.forEach(services, function(service, cb){
    var map = path.join(__dirname,'services',service,'synclets.json');
    path.exists(map, function(exists){
      if(!exists) return cb();
      logger.debug("loading",map);
      var sjs = SERVICES[service] = JSON.parse(fs.readFileSync(map));
      if (!SYNCLETS[service]) SYNCLETS[service] = {};

      for (var i = 0; i < sjs.synclets.length; i++) {
        var sname = sjs.synclets[i].name;
        var spath = path.join(__dirname, "services", service, sname);
        delete require.cache[spath]; // remove any old one
        SYNCLETS[service][sname] = {
          frequency: sjs.synclets[i].frequency,
          sync: require(spath).sync
        };
        logger.info("\t* " + sname);
      }

      cb();
    });
  }, callback);  
}

// util for webservices /services endpoint
exports.getServices = function(callback)
{
  callback(null, SERVICES);
}

// trigger any profile to sync asap
exports.syncNow = function(pid, synclet, callback)
{
  logger.debug("force sync",pid,synclet);
  // TODO do we poll-wait for tasks to be updated to callback()??
  // if synclet, fetch/update task at to now
  redis.sadd("next",pid);
  callback();
}

// try to pop a new task off the general redis next queue
function checkNext()
{
  if(Object.keys(WORKERS).length > NUM_WORKERS) return; // bail if already max busy
  logger.debug("checking for any next work");
  redis.spop("next", function(err, pid){
    if(!pid) return;
    isLocked(pid, function(locked){
      if(locked) return;
      runWorker(pid, function(err){
        if(err) logger.err("runWorker error",err);
        process.nextTick(checkNext); // if a worker finished, look for more work asap!
      });
    });
  });
}

// scan due or soon-to-be-due tasks for profiles to get busy with
function fillNext()
{
  // step through all services serially to be nice
	//	ijod range on all synclet bases older than now
	//		(add 10sec into future each time .fill is run w/ none total, track this in STATS)
	//	sort by oldest->newest
	//	getOne each one, getting the pid from the full idr	
  // if not locked and there's local capacity, just runWorker() it!
    // no capacity, dump it in the redis next queue
}

function isLocked(pid, callback)
{
  redis.hget("active", pid, function(err, lock){
    if(!lock) return callback(false);
    var bits = lock.split("\t"); // lock format: "heartbeat-timestamp\tworker-name"
    if(bits[0] > (Date.now() - LOCK_TIMEOUT)) return callback(true, bits);
    callback(false);
  })
}

// given an updated auth object for a profile, make sure it has all the correct tasks in the system
exports.taskUpdate = function(auth, callback)
{
  var service = auth.pid.split('@')[1];
  if(!SYNCLETS[service]) return callback(new Error("unknown service"));

  // generate superset of all tasks based on the apps
  // TODO, getOne app mask info
  var livesynclets = Object.keys(SYNCLETS[service]); // just all for now
  var freqoverride = false; // masks might make it daily or something
  
  // fetch any existing tasks by looking for all possible ones
  getTasks(pid, function(curtasks){
    // go through all tasks that should exist, make them if they don't!
    var added = false;
    async.forEach(livesynclets, function(synclet, cbLoop){
      var taskid = 'task:'+service+'/'+synclet+'#'+pid;
      if(curtasks[taskid]) {
        delete curtasks[taskid]; // so only deleteable ones are left
        // TODO may need to modify frequency!!
        return cbLoop(); // nothing to do here, move on
      }
      // create a new blank one
      logger.debug("creating new task",taskid);
      added = true;
      var task = {idr:taskid, at:Date.now(), created:Date.now()};
      task.data = SYNCLETS[service];
      saveTask(task, cbLoop);
    }, function(err){
      if(err) return callback(err);

      // done adding, any leftovers need to be deleted
      async.forEach(Object.keys(curtasks), function(taskid, cbLoop){
        ijod.delOne(taskid, function(){
          // if the profile is active, we want to kill this task so it doesn't get re-saved!
          isLocked(pid, function(locked){
            if(locked) redis.setex(taskid, 3600, "taskUpdate deleted"); // one hour expirey so they auto cleanup
            cbLoop();
          });
        });
      }, function(){
        if(added) redis.sadd("next",pid); // if there's new tasks, def queue them up asap
        callback();
      });
    });
  });
}

// perform the synclet and pipeline, saving state at the end
function runTask(profile, task, callback)
{
	// snyclet->pipeline
	// task.lastCount = X or false
	// task.last = error or success
	// saveTask(task)
	// if config, save config, since if the worker goes down it's current to the saved data per task
	// if auth, dumb merge and set profile.newauth flag!
  logger.debug("running task",task);
  callback();
}

// just save it out, setting next time appropriately
function saveTask(task, callback)
{
  // check for any task deleted flag in redis and bail if so
  redis.get(task.idr, function(err, deleted){
    if(deleted) return callback(new Error("task was deleted "+deleted));

    // XXXX determine new at based on nextRun, .lastCount and tolerance math
    task.at += 10000;
    ijod.batchSmartAdd([task], callback);
  });
}

// get all possible task objects
function getTasks(pid, callback)
{
  var service = pid.split('@')[1];
  var tasks = {};
  async.forEach(Object.keys(SYNCLETS[service]), function(synclet, cbLoop){
    ijod.getOne('task:'+service+'/'+synclet+'#'+pid, function(err, task){
      if(task) tasks[task.idr] = task;
      cbLoop();
    })
  }, function(){
    callback(tasks);
  });  
}

// perform all possible tasks for this pid
function runWorker(pid, callback)
{
  if(WORKERS[pid]) return callback(); // don't even bother trying

  // first! acquire pid lock
  redis.hsetnx("active",pid,[Date.now(),WORKER_NAME].join("\t"), function(err, set){
    if(err || set == 0) return callback(new Error("failed to acquire lock"));

    // our process-wide tracking
    var self = WORKERS[pid] = {pid:pid, tasks:[], started:Date.now(), total:0, killed:false};
    self.service = pid.split('@')[1];

    // validate and freshen our lock to heartbeat and stay alive
    var hbtimer = setInterval(function(){
      logger.debug("heartbeating",pid);
      redis.hget("active",pid, function(err, lock){
        if(!lock) return self.killed="lock missing";
        if(lock.indexOf(WORKER_NAME) == -1) return self.killed="lock stolen by "+lock;
        redis.hset("active",pid,[Date.now(),WORKER_NAME].join("\t"));
      });
    }, LOCK_TIMEOUT/2);

    // get the auth+config needed to run any task
    logger.debug("looking for tasks",pid);
    profileManager.allGet(task.profile, function(err, profile) {
      if(!profile) return callback(new Error("missing profile info"));
      
      // ugly, but have to fetch all possible synclets (TODO are a bunch of getOnes faster than a forced db range query on a set of idrs and base+timestamp? or use redis to collect them?)
      getTasks(pid, function(tasks){

        // figure out which ones we're doing based on their .at being near to now
        var todo = {};
        var glob = (Date.now() > STATS.now) ? Date.now() : STATS.now;
        glob += TASK_GLOB; // set into the future
        async.forEach(Object.keys(tasks), function(taskid, cbLoop){
          if(tasks[taskid].at > glob) return cbLoop();
          todo[taskid] = tasks[taskid];
          // also save it into the future so it stays out of the filler and in case this all goes bust it'll come back again
          tasks[taskid].queued = Date.now();
          tasks[taskid].worker = WORKER_NAME;
          saveTask(tasks[taskid], cbLoop);
        }, function(){
          if(Object.keys(todo).length == 0)
          {
            logger.warn("no tasks found to do!",pid);
            return callback();
          }

          // do each task serially due to config sharing!
          async.forEachSeries(Object.keys(todo), function(taskid, cbLoop){
            runTask(profile, todo[taskid], cbLoop);
          }, function(){

            // auth info is rarely updated, must save it if so, can happen async
            if(profile.newauth) profileManager.authSet(pid, profile.auth, false, function(err){
              if(err) logger.warn(err);
            });

            // release locks and return
            clearInterval(hbtimer);
            redis.hdel("active",pid, function(){
            	delete WORKERS[pid];
              checkNext(); // more capacity now
              callback();      
            });
          });          
        });
      });
    });
  });

}
