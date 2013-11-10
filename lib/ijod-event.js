/*
* Copyright (C) 2012 Singly, Inc. All Rights Reserved.
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

var async = require('async');
var lconfig = require("lconfig");
var dMap = require('dMap');
var friends = require('friends');
var ijod = require('ijod');
var mmh = require("murmurhash3");
var os = require("os");
var instruments = require('instruments');

var redis = require('redis').createClient(lconfig.taskman.redis.port,
                                          lconfig.taskman.redis.host);

// ***********************************************
//
// IJOD event harness publisher
//
// ***********************************************

// cbDone is optional
exports.publish = function (event, details, cbDone) {
  instruments.increment("ijod.events." + event).sample(0.05).send();

  details.event = event;
  redis.publish("ijod", JSON.stringify(details), cbDone);
};

// hooked in after ijod's pump runs as a waterfall entry
exports.pump = function (entries, cbDone) {
  // immediately let the waterfall continue, all our work happens in the background
  cbDone(null, entries);

  // Construct a batch ID (use hostname + high-resolution timer for best shot at uniqueness)
  var id = mmh.murmur128HexSync(os.hostname() + process.hrtime().toString());

  // signal that a batch is starting
  exports.publish("batchAddStart", {id: id, len: entries.length}, function () {
    async.forEach(entries, function (entry, cbEntries) {
      if (!entry.store) return; // wasn't actually stored
      var meta = {idr: entry.idr, at: entry.at, store: entry.store, batch: id};
      // get normalized geo
      meta.ll = dMap.get('ll', entry.data, entry.idr) || [null, null];
      // friends parallels or entry participants (can't have both at the same time)
      meta.parallels = friends.parallels(entry);
      if (!meta.parallels) meta.participants = ijod.participants(entry);
      // any text to index
      meta.q = ijod.qtext(entry);
      // broadcast it out!
      exports.publish("addData", meta, cbEntries);
    }, function () {
      exports.publish("batchAddDone", {id: id});
    });
  });
};
