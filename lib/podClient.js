// ok, let's emulate where we read (mostly) and write (rarely) any entries


// things from ijod.* as used by entries.js
exports.getRange // use the base, get the pid, lookup the pod, pass the base+options, get the results back and return them
exports.getTardis // same same

exports.getOne // this needs to be passed in the list of possible pids when it's a "bare" id, and match the _partition bytes against them to find the pod to ask

// in ijod.* used by webservices.js in a few places to write raw data
exports.batchSmartAdd // similar, pull out pid->pod, POST raw entries back to it to write

// from pipeline.js, used by entries.js, orig by webservice.js
exports.pipeAccount // this saves custom data for an "account" (just maps to acctid@appid like any other profile), should prob just wrap batchSmartAdd?

// from pipeline.js, used by authManager.js
exports.pipeInject // this should POST the data to the pod and have it run it through the normal pipeline there (just self profiles?)