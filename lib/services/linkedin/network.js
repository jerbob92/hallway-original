exports.sync = require('./lib').genericSync(function(pi){
  // need to optimize this into two synclets, track updates, timestamps, etc
  return "people/~/network/updates?format=json&count=250";
},function(pi, js, cb){
  // if none, reset to start for next run
  if (!js || !js.values) return cb(null, {});
  var configUpdate = {};

  // track the latest PROF and NCON updates. The connections synclet will only
  // run when these are found
  var networkConnUpdate = pi.config.networkConnUpdate || 1;
  for (var i in js.values) {
    var update = js.values[i];
    if (update &&
      (update.updateType === "PROF" || update.updateType === "NCON") &&
      update.timestamp > networkConnUpdate) {
      networkConnUpdate = update.timestamp;
    }
  }

  // if we found a new update, pass it back
  if ((!pi.config.networkConnUpdate && networkConnUpdate > 1)
    || networkConnUpdate > pi.config.networkConnUpdate) {
    configUpdate.networkConnUpdate = networkConnUpdate;
  }
  var data = {};
  data['update:'+pi.auth.pid+'/network'] = js.values;
  cb(null, {data:data, config:configUpdate});
});
