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

var ONE_DAY = 24 * 60 * 60 * 1000; // Broken down so you can visualize it, it's 86,400,000ms

var ONEPROFILE = false; // to only run tasks for one profile

var STATS = {total:0};
var SERVICES;
var SYNCLETS;
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
  }, function(){
    
    // start threads!
    if(live)
    {
      setInterval(checkNext, PAGING_TIMING);
      setInterval(fillNext, DEFAULT_SCAN_TIME);
      fillNext(); // run immediately too
    }
    
    callback();
  });
};

// try to pop a new task off the general redis next queue
function checkNext()
{
  if(Object.keys(WORKERS).length > NUM_WORKERS) return; // bail if already max busy
  // pop one from redis next queue
  // if it's not locked
    // if ONEPROFILE and doesnt match, return
    // runWorker
  // nexttick .check again
  
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
  // if no lock, or lock is expired
}

// given an updated auth object for a profile, make sure it has all the correct tasks in the system
exports.taskUpdate = function(auth, callback)
{
  // generate superset of all tasks based on the apps
  // getOne fetch all existing tasks
  // save new ones
  // delete old ones
    // if locked, set a task deleted flag for this idr in redis
  // insert pid into redis next queue
  callback();
}

// perform the synclet and pipeline, saving state at the end
function runTask(auth, config, task, callback)
{
	// snyclet->pipeline
	// task.lastCount = X or false
	// task.last = error or success
	// saveTask(task)
	// save config, since if the worker goes down it's current to the saved data per task
  callback();
}

// just save it out, setting next time appropriately
function saveTask(task, callback)
{
  // check for any task deleted flag in redis and bail if so
  // determine at based on nextRun, .lastCount and tolerance math
  callback()
}

// perform all possible tasks for this pid
function runWorker(pid, callback)
{
  if(WORKERS[pid]) return callback();
  var self = WORKERS[pid] = {pid:pid, tasks:[], started:Date.now(), total:0};
  // acquire pid lock
  // start interval to keep lock fresh
	// fetch auth+config
	// getRange all task bases
	  // async, saveTask() so they are set to the future and won't get fill'd again
	  // runTask serially
	// if auth updated, re-fetch auth (can change) and merge+save
  // kill freshener interval timer
	// release lock
	delete WORKERS[pid];
	exports.check(); // more capacity now
	
}
