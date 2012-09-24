var PROFILE_FIELDS = '(id,first-name,last-name,maiden-name,formatted-name,phonetic-first-name,phonetic-last-name,formatted-phonetic-name,headline,location:(name,country:(code)),industry,distance,relation-to-viewer:(distance),current-share,num-connections,num-connections-capped,summary,specialties,positions,picture-url,site-standard-profile-request,api-standard-profile-request:(url,headers),public-profile-url)';
var PATH_START = 'people/~/connections:' + PROFILE_FIELDS + '?format=json';

exports.sync = require('./lib').genericSync(function(pi){
  if (!pi.config.connStart) {
    pi.config.connStart = 0;
    return PATH_START;
  } else {
    return PATH_START + '&start=' + pi.config.connStart + '&count=500';
  }
},function(pi, js, cb){
  // if none, reset to start for next run
  if (!js || !js.values) return cb(null, {config:{connStart:0}});
  // only bump it up if more than default amount (500)
  if (js.values.length < 500) {
    pi.config.connStart = 0;
  } else {
    pi.config.connStart += 500;
  }
  var base = 'profile:'+pi.auth.pid+'/connections';
  var data = {};
  data[base] = js.values;
  cb(null, {data:data, config:{connStart:pi.config.connStart}});
});