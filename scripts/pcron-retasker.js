#!/usr/bin/env node

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
//  NODE_PATH=lib:`pwd`/node_modules node ~/pcron-retasker.js

var argv = require('optimist')
  .boolean('force', false)
  .options('limit', { 'default': 100 })
  .options('offset', { 'default': 0 })
  .argv;

var _ = require("underscore");
var async = require('async');
var lconfig = require('lconfig');
var logger = require('logger').logger('retasker');
var profileManager = require('profileManager');
var pcron = require('pcron');
var dal = require('dal');
var ijod = require('ijod');
var acl = require('acl');
var servezas = require('servezas');
var redis = require("redis");
var rclient = redis.createClient(lconfig.worker.redis.port || 6379,
                                 lconfig.worker.redis.host || "127.0.0.1");
rclient.debug = true;
var pcron = require("pcron");
var pcronInst = pcron.init(rclient);

function stop(reason) {
  logger.error("Error: " + reason);
  process.exit(1);
}

function retask(pids, cbDone) {
  var i = 0;
  async.forEachLimit(pids, 100, function (row, cbLoop) {
    profileManager.authGet(row.id, null, function (err, auth) {
      if (!auth || !auth.apps) return cbLoop();

      var parts = row.id.split("@");
      var service = parts[1];
      var user = parts[0];

      pcronInst.schedule(service, user, 0, false, cbLoop);
    });
  }, function (err) {
    if (err) return stop("Retask error: " + err);
    cbDone();
  });
}

function getPids(offset, limit, service, cbDone) {
  var sql = 'SELECT id FROM Profiles WHERE service=?';
  var binds = [service];
  if (limit > 0) {
    sql += " LIMIT ? ";
    binds.push(limit);

    sql += " OFFSET ?";
    binds.push(offset);
  }

  console.log(sql + " " + JSON.stringify(binds));
  dal.query(sql, binds, cbDone);
}

rclient.select(lconfig.worker.redis.database || 0, function (err) {
  if (err) return stop("Redis SELECT failed: " + err);
  ijod.initDB(function (err) {
    if (err) return stop("IJOD init failed: " + err);
    servezas.load();
    profileManager.init(function() {
      acl.init(function (err) {
        if (err) return stop("ACL init failed: " + err);
        if (argv.id) {
          console.log("Retasking id!");
          retask([{id: argv.id}], process.exit);
        } else {
          console.log("Retasking pids");
          getPids(argv.offset, argv.limit, argv.service, function (err, rows) {
            if (err) return stop("getPids failed: " + err);
            retask(rows, process.exit);
          });
        }
      });
    });
  });
});
