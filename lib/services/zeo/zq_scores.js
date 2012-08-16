var lib = require('./lib.js');
var util = require('util');

exports.sync = function(pi, cb) {
  lib.apiCall({auth:pi.auth, query:'/getOverallAverageZQScore'}, function(err, body, resp){
    if (err) return cb(new Error('status code ' + err.statusCode));
    if (!body || !body.response || body.response.value) return cb(new Error('Missing response json'));
    var score = body.response.value;
    var now = new Date();
    var jsonDate = now.toJSON();
    var zqScore = {id: Date.now(), date:jsonDate, overallAverageZQScore: score};
    var data = {};
    data['zqscore:'+pi.auth.pid+'/zq_scores'] = zqScore; 
    cb(err, {data:data, config:pi.config});
  });
};
