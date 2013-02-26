// imports
var lconfig = require('lconfig');
var redis = require('redis');

var redisClient = redis.createClient(lconfig.worker.redis.port,
                                 lconfig.worker.redis.host);

// require certain parameters on the command line
var argv = require('optimist')
  .demand('service')
  .alias('s', 'service')
  .describe('s', 'The service to process')
  .argv;

var redisClient = redis.createClient(lconfig.worker.redis.port,
                                 lconfig.worker.redis.host);
var scheduleDb = 3;
var now = Date.now();

// select the backlog database
redisClient.select(scheduleDb, function (err) {
  if (err) return stop("rclient.select failed: " + err);

  // get a listing of all items with their scores (timestamps) for a service
  var zargs = [argv.service + "_schedule", '-inf', '+inf', 'WITHSCORES'];
  redisClient.zrangebyscore(zargs,
    function (err, results) {

      var otherCount = 0;
      var immediateCount = 0;
      var grt1Day = 0;
      var grt2Days = 0;
      var grt3Days = 0;
      var avgMinutes = 0;
      var avgHours = 0;
      var avgDays = 0;

      // loop through all items counting time the item should have been
      // run in the past, get averages
      for (var i = 0; i < results.length; i++) {
        var key = results[i];
        i++;
        var score = results[i];
        if (score <= 60) {
          immediateCount++;
        }
        else {
          otherCount++;
          var seconds = (score - now) / 1000;
          var minutes = seconds / 60;
          var hours = minutes / 60;
          var days = hours / 24;
          avgMinutes += minutes;
          avgHours += hours;
          avgDays += days;

          if (-hours > 72) {
            grt3Days++;
          }
          else if (-hours > 48) {
            grt2Days++;
          }
          else if (-hours > 24) {
            grt1Day++;
          }
        }
      }

      // write out the service backlog averages
      console.log("total: " + (results.length / 2));
      console.log("immediate: " + immediateCount);
      console.log("average minutes: " + (avgMinutes / otherCount));
      console.log("average hours: " + (avgHours / otherCount));
      console.log("average days: " + (avgDays / otherCount));
      console.log("> 1 day old: " + grt1Day);
      console.log("> 2 days old: " + grt2Days);
      console.log("> 3 days old: " + grt3Days);
      process.exit(0);
    }
  );
});
