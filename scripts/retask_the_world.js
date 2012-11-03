var async = require('async');

var lconfig = require('lconfig');
var profileManager = require('profileManager');
var taskman = require('taskman');
var dal = require('dal');
var ijod = require('ijod');

var LIMIT = 15;

function retaskTheWorld(limit, force, callback) {
  dal.query("select id from Profiles", [], function(err, ret) {
    if(err || !ret) return res.send(err, 500);
    console.log("doing "+ret.length+"\n");
    var i = 0;
    async.forEachLimit(ret, limit, function(row, cbLoop) {
      console.log(i++, row.id+"\n");
      profileManager.authGet(row.id, null, function(err, auth) {
        if(!auth) return cbLoop();
        taskman.taskUpdate(auth, function(err) {
          if(err) console.error([row.id,err,'\n'].join(' '));
          cbLoop();
        }, force);
      });
    }, function(err) {
      if(err) console.error(err.toString());
      callback();
    });
  });
}

function init(callback) {
  ijod.initDB(function(err) {
    if (err) return callback(err);
    taskman.init(null, null, null, callback);
  });
}

init(function(err) {
  if (err) return console.error('err', err);
  var limit = process.argv[2] || LIMIT;
  var force = process.argv[3] == "true";
  retaskTheWorld(limit, force, function(err) {
    if (err) console.error('err', err);
    console.log('done');
    process.exit();
  });
});
