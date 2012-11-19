var lib = require('./lib');
var async = require('async');

exports.sync = lib.genericSync(function(pi) {
  if (!pi.config.networkUpdate) {
    pi.config.networkUpdate = pi.config.networkConnUpdate;
  }
  var url = "people/~/network/updates?format=json&count=250";
  if (pi.config.networkUpdate) url += '&after='+pi.config.networkUpdate;
  // need to optimize this into two synclets, track updates, timestamps, etc
  return url;
}, function(pi, js, cb) {
  // if none, reset to start for next run
  if (!js || !js.values) return cb(null, {});
  var configUpdate = {};

  var data = {};
  data['update:'+pi.auth.pid+'/network'] = js.values;

  // track the latest PROF and NCON updates. The connections synclet will only
  // run when these are found
  var networkConnUpdate = pi.config.networkConnUpdate || 1;
  // collect connection IDs in a hash because there are often several at once
  // from the same person and don't want to waste API calls
  var updatedConnIDs = {};
  // we only want to pull down new or update connections, but networkConnUpdate
  // will change during the loop, so freeze to the newest we've already got
  var newestConnectionSynced = Math.max(networkConnUpdate || 1,
                                        pi.config.connLastModified || 1);
  var newestUpdateSynced = pi.config.networkUpdate || 1;
  for (var i in js.values) {
    var update = js.values[i];
    if (update.timestamp > newestUpdateSynced) {
      newestUpdateSynced = update.timestamp;
    }
    if (update &&
        (update.updateType === "PROF" || update.updateType === "NCON")) {

      if (update.timestamp > networkConnUpdate) {
        networkConnUpdate = update.timestamp;
      }
      // only hit the linkedin /people/id=abcdefg endpoint if have crawled
      // /connections at least once.
      if (update.timestamp > newestConnectionSynced) {
        var id = update.updateContent &&
                 update.updateContent.person &&
                 update.updateContent.person.id;
        // we want the latest timestamp
        if (id && (!updatedConnIDs[id] ||
                   updatedConnIDs[id] < update.timestamp)) {
          updatedConnIDs[id] = update.timestamp;
        }
      }
    }
  }

  // if we found a new update, pass it back
  if ((!pi.config.networkConnUpdate && networkConnUpdate > 1) ||
      networkConnUpdate > pi.config.networkConnUpdate) {
    configUpdate.networkConnUpdate = networkConnUpdate;
  }
  if ((!pi.config.networkUpdate && newestUpdateSynced > 1) ||
      newestUpdateSynced > pi.config.networkUpdate) {
    configUpdate.networkUpdate = newestUpdateSynced;
  }

  // pull in connection updates right here (via the /people endpoint) to
  // minimize hits to the connections API which has a 20k/app/day Throttle Limit
  // another optimization would be to pull the updated info out of the object
  // here and merge into the existing
  getConnections(updatedConnIDs, pi.auth, function(errs, conns) {
    if (errs) {
      // just log the errors here for now because we don't want to break
      // everything and stop
      console.error('errors pulling connections in linkedin network synclet',
        errs);
    } else if (Array.isArray(conns) && conns.length) {
      // add the connections to the returned data
      var base = 'profile:'+pi.auth.pid+'/connections';
      data[base] = conns;
    }
    return cb(null, {data:data, config:configUpdate});
  });
});

// grab the full profile objects for an array of profile IDs
function getConnections(ids, auth, cbDone) {
  var connections = [];
  var errs = {};
  // limit to 25 just to be robust, could probably go higher
  // could also use their bulk API
  async.forEachLimit(Object.keys(ids), 25, function(id, cbEach) {
    lib.getConnection(id, auth, ids[id], function(err, connection) {
      if (err) errs[id] = err;
      else connections.push(connection);
      return cbEach();
    });
  }, function() {
    if (Object.keys(errs).length === 0) errs = null;
    return cbDone(errs, connections);
  });
}
