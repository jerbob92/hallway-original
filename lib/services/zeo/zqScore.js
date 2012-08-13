var lib = require('./lib.js');



exports.sync = function(pi, cb) {
  lib.apiCall({auth:auth, query:'getOverallAverageZQScore'}, function(err, score){
    var now = new Date();
    var jsonDate = now.toJSON();
    var zqScore = {data:jsonData, overallAverageZQScore: score.value};
    var data = {};
    data['zqScore:'+pi.auth.pid+'/zqScore'] = groups; 
    cb(err, {data:data, config:pi.config});
  });
};
