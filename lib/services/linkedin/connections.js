var lib = require('./lib');

var PAGE_SIZE = 500;
var PATH_START = 'people/~/connections:' + lib.PROFILE_FIELDS +
                 '?format=json&count=' + PAGE_SIZE;

exports.sync = lib.genericSync(function(pi){
  var config = pi.config;
  var firstSyncDone = config.networkConnUpdate && config.connLastModified;
  if (firstSyncDone && (config.networkConnUpdate <= config.connLastModified) ) {
    // no new updates found by the network synclet, come back later
    // (this is mostly used to avoid rate limiting on fresh=true calls)
    return false;
  }
  if (!config.connLastModified) config.connLastModified = 1;
  var path = PATH_START + '&modified-since=' + config.connLastModified;
  // a value for connStart indicates that we are in the middle of paging
  if (!config.connStart) {
    config._tmpConnLastModified = Date.now();
    config.connStart = 0;
    return path;
  } else {
    return path + '&start=' + pi.config.connStart;
  }
},function(pi, js, cb){
  // if no more, reset to start for next run
  if (!js ) {
    return cb(new Error('no response body from LinkedIn Connections'),
              {config:{connStart:0}});
  }
  // XXX: small bug until the following is fixed:
  // If the # of connections a person has is a multiple of 500
  // the config value won't be stored because configs are only stored if
  // a non-zero-length array of objects is returned.
  var done = false;
  if (!js.values || js.values.length < PAGE_SIZE) done = true;

  var configUpdate = {firstSync:pi.config.firstSync};
  if (done) {
    configUpdate.connLastModified = pi.config._tmpConnLastModified;
    configUpdate._tmpConnLastModified = 1;
    configUpdate.connStart = 0;
    if(!configUpdate.firstSync) configUpdate.firstSync = Date.now(); // when done paging flag
  } else {
    configUpdate.connStart = pi.config.connStart + js.values.length;
    configUpdate.nextRun = (configUpdate.firstSync) ? -1 : 2;
  }
  var base = 'profile:'+pi.auth.pid+'/connections';
  var data = {};
  data[base] = js.values;
  cb(null, {data:data, config:configUpdate});
});
