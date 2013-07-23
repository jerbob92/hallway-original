/*
* Copyright (C) 2012-2013 Singly, Inc. All Rights Reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are permitted provided that the following conditions are met:
*    * Redistributions of source code must retain the above copyright
*      notice, this list of conditions and the following disclaimer.
*    * Redistributions in binary form must reproduce the above copyright
*      notice, this list of conditions and the following disclaimer in the
*      documentation and/or other materials provided with the distribution.
*    * Neither the name of Singly nor the
*      names of its contributors may be used to endorse or promote products
*      derived from this software without specific prior written permission.
*
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
* ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
* WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
* DISCLAIMED. IN NO EVENT SHALL SINGLY, INC. BE LIABLE FOR ANY
* DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
* (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
* LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
* ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
* (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
* SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

// Running this script:
//
//  NODE_PATH=lib:`pwd`/node_modules node backlog.js

var argv = require('optimist')
  .argv;


var async = require('async');
var lconfig = require('lconfig');
var logger = require('logger').logger('retasker');
var ijod = require('ijod');
var acl = require('acl');
var servezas = require('servezas');


function stop(reason) {
  logger.error("Error: " + reason);
  process.exit(1);
}

function taskCount(since, until) {
  var total = 0;
  var oldest = Date.now();

  async.forEachSeries(servezas.serviceList(), function (service, cbSvcLoop) {
    async.forEachLimit(servezas.syncletList(service), 10,
      function (synclet, cbSyncLoop) {
      var base = 'task:' + service + '/' + synclet;

      ijod.getTardis(base, { until: until, since: since }, function (err, rows) {
        if (err) {
          logger.warn(err, base);
          return cbSyncLoop(err);
        }

        var old;
        rows.forEach(function (row) {
          var at = parseInt(row.at, 10);
          if (!old || at < old) old = at;
        });

        if (old < oldest) oldest = old;
        total += rows.length;
        if (rows.length > 0)
          console.log(rows.length + " " + base);

        cbSyncLoop();
      });
    }, cbSvcLoop);
  }, function () {
    console.log("Total: " + total + " Oldest: " + oldest);
    process.exit(0);
  });
}

function taskDump(since, until, base) {
  ijod.getRange(base, {until: until, since: since}, function(item) {
    console.log(item.idr + " " + item.at);
  }, function(err, done) {
    console.log(JSON.stringify(done));
    process.exit(0);
  });
}

//   ijod.getTardis(base, { until: until, since: since }, function (err, rows) {
//     if (err) stop(err);

//     rows.forEach(function (row) {
//       var at = parseInt(row.at, 10);
//       console.log(row.idr + " " + at);
//     });

//     process.exit(0);
//   });
// }



ijod.initDB(function (err) {
  if (err) return stop("IJOD init failed: " + err);
  servezas.load();
  acl.init(function (err) {
    if (err) return stop("ACL init failed: " + err);
    if (argv.base) taskDump(0, Date.now(), argv.base);
    else taskCount(0, Date.now());
  });
});
