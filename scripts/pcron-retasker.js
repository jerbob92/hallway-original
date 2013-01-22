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
*    * Neither the name of the Locker Project nor the
*      names of its contributors may be used to endorse or promote products
*      derived from this software without specific prior written permission.
*
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
* ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
* WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
* DISCLAIMED. IN NO EVENT SHALL THE LOCKER PROJECT BE LIABLE FOR ANY
* DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
* (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
* LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
* ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
* (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
* SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

// Running this script:
//
//  NODE_PATH=lib:`pwd`/node_modules node ~/pcron-retasker.js

var argv = require('optimist')
  .boolean('force', false)
  .demand('service')
  .default('limit', 100)
  .default('offset', 0)
  .argv;


var async = require('async');
var lconfig = require('lconfig');
var logger = require('logger').logger('retasker');
var profileManager = require('profileManager');
var pcron = require('pcron');
var dal = require('dal');
var ijod = require('ijod');
var acl = require('acl');
var taskmanNG = require('taskman-ng');
var servezas = require('servezas');
var redis = require("redis");
var rclient = redis.createClient(lconfig.worker.redis.port || 6379,
                                 lconfig.worker.redis.host || "127.0.0.1");
var pcron = require("pcron");
var pcronInst = pcron.init(rclient);

function stop(reason) {
  logger.error("Error: " + reason);
  process.exit(1);
}


function retask(pids, cbDone) {
  async.forEachLimit(pids, 100, function (row, cbLoop) {
    profileManager.authGet(row.id, null, function (err, auth) {
      if (!auth) return cbLoop();
      taskmanNG.taskUpdate(auth, function (err) {
        if (err) stop(row.id + " failed to update task: " + err);
        var parts = row.id.split("@");
        pcronInst.schedule(parts[1], parts[0], Date.now(), false, cbLoop);
        logger.info(row.id);
      });
    });
  }, function (err) {
    if (err) return stop("Retask error: " + err);
    cbDone();
  });
}

function getPids(offset, limit, service, cbDone) {
  var sql = 'SELECT id FROM Profiles WHERE service=? LIMIT ? OFFSET ?';
  var binds = [service, limit, offset];
  dal.query(sql, binds, cbDone);
}

rclient.select(lconfig.worker.redis.database || 0, function (err) {
  if (err) return stop("Redis SELECT failed: " + err);
  ijod.initDB(function (err) {
    if (err) return stop("IJOD init failed: " + err);
    servezas.load();
    acl.init(function (err) {
      if (err) return stop("ACL init failed: " + err);
      getPids(argv.offset, argv.limit, argv.service, function (err, rows) {
        if (err) return stop("getPids failed: " + err);
        retask(rows, process.exit);
      });
    });
  });
});
