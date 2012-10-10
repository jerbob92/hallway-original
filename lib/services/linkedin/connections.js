var PAGE_SIZE = 500;
var PROFILE_FIELDS = '(id,first-name,last-name,maiden-name,formatted-name,phonetic-first-name,phonetic-last-name,formatted-phonetic-name,headline,location:(name,country:(code)),industry,distance,relation-to-viewer:(distance),current-share,num-connections,num-connections-capped,summary,specialties,positions,picture-url,site-standard-profile-request,api-standard-profile-request:(url,headers),public-profile-url)';
var PATH_START = 'people/~/connections:' + PROFILE_FIELDS + '?format=json&count=' + PAGE_SIZE;

exports.sync = require('./lib').genericSync(function(pi){
  var config = pi.config;
  var firstSyncDone = config.networkConnUpdate && config.connLastModified;
  if (firstSyncDone && (config.networkConnUpdate <= config.connLastModified) ) {
    // no new updates found by the network synclet, come back later
    // (this is mostly used to avoid rate limiting on fresh=true calls)
    return false;
  }
  if (!config.connLastModified) config.connLastModified = 1;
  var path = PATH_START + '&modified-since=' + config.connLastModified;
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

  var configUpdate = {};
  if (done) {
    configUpdate.connLastModified = pi.config._tmpConnLastModified;
    configUpdate._tmpConnLastModified = 1;
    configUpdate.connStart = 0;
  } else {
    configUpdate.connStart += js.values.length;
    configUpdate.nextRun = -1;
  }
  var base = 'profile:'+pi.auth.pid+'/connections';
  var data = {};
  data[base] = js.values;
  cb(null, {data:data, config:configUpdate});
});
