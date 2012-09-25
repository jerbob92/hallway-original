var PAGE_SIZE = 500;
var PROFILE_FIELDS = '(id,first-name,last-name,maiden-name,formatted-name,phonetic-first-name,phonetic-last-name,formatted-phonetic-name,headline,location:(name,country:(code)),industry,distance,relation-to-viewer:(distance),current-share,num-connections,num-connections-capped,summary,specialties,positions,picture-url,site-standard-profile-request,api-standard-profile-request:(url,headers),public-profile-url)';
var PATH_START = 'people/~/connections:' + PROFILE_FIELDS + '?format=json&count=' + PAGE_SIZE;

exports.sync = require('./lib').genericSync(function(pi){
  if (!pi.config.connLastModified) pi.config.connLastModified = 1;
  var path = PATH_START + '&modified-since=' + pi.config.connLastModified;
  if (!pi.config.connStart) {
    pi.config._tmpConnLastModified = Date.now();
    pi.config.connStart = 0;
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
  // using _ keys, so being defensive and falling back to raw length
  // if they disappear some day
  if (!js.values || js.values.length < PAGE_SIZE) done = true;

  if (done) {
    pi.config.connLastModified = pi.config._tmpConnLastModified;
    pi.config._tmpConnLastModified = 1;
    pi.config.connStart = 0;
  } else {
    pi.config.connStart += js.values.length;
    // pi.nextRun = -1;
  }
  var base = 'profile:'+pi.auth.pid+'/connections';
  var data = {};
  data[base] = js.values;
  cb(null, {data:data, config:pi.config});
});
