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
//  NODE_PATH=lib:`pwd`/node_modules node ~/ijoder.js <idr>

var program = require('commander');
var zlib = require('compress-buffer');

var partition = require("partition");

program
  .usage('[-b <backend>] <idr>')
  .option('-b, --backend <backend>', 'the backend to use, fs or s3', 's3')
  .parse(process.argv);

function toUTC(epochms) {
  var d = new Date(0);
  d.setUTCSeconds(epochms / 1000);
  return d;
}

// Given a idr, construct a nice little query to pull the data from the
// appropriate table

var backend;

console.log('Using', program.backend, 'backend');

if (program.backend === 'fs') {
  backend = new require("ijod-fs").backend();
} else if (program.backend === 's3') {
  backend = new require("ijod-s3").backend();
} else {
  console.log('Invalid backend specified, please specify fs or s3.');

  process.exit(1);
}

var idr = program.args[0];
var table = partition.tableize(partition.getPart(idr));

var query = "SELECT path, offset, len, conv(hex(substr(base,17,6)),16,10) " +
  "as at FROM " + table + " WHERE idr = unhex(\"" + partition.getHash(idr) +
  "\")";

console.log("IDR: " + idr);
console.log("Table: " + table);
console.log("Query: " + query);

partition.readFrom(idr, function (parts) {
  console.log(parts);
  parts[0].dal.query(query, [], function (err, rows) {
    if (err || rows.length == 0) {
      console.log("IDR not found");
      return;
    }
    backend.get(rows[0].path, rows[0].offset, rows[0].len, function (err, buf) {
      var zbuf = zlib.uncompress(buf);

      if (zbuf) {
        var json = JSON.parse(zbuf.toString());

        console.log("\nSQL Row: " + JSON.stringify(rows[0]));
        console.log("\nJSON: " + JSON.stringify(json));

        console.log("SQL scheduled at: " + toUTC(rows[0].at));

        console.log("IJOD scheduled at: " + toUTC(json.at));
        console.log("IJOD created: " + toUTC(json.created));
        console.log("IJOD queued: " + toUTC(json.queued));
        console.log("IJOD saved: " + toUTC(json.saved));
      } else {
        console.log("\nFailed to decompress JSON from S3!");
        console.log("\nSQL Row: " + JSON.stringify(rows));
      }

      process.exit(0);
    });
  });
});
