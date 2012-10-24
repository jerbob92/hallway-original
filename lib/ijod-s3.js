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

var instruments = require("instruments");
var lconfig = require("lconfig");
var logger = require("logger").logger("ijod-backend");
var knox = require("knox");

// ***********************************************
//
// S3-based storage for ijod
//
// ***********************************************
exports.backend = function () {

  this.client = knox.createClient({
    key: lconfig.s3.key,
    secret: lconfig.s3.secret,
    bucket: lconfig.s3.bucket
  });

  this.get = function (key, offset, length, cb) {
    var startTime = Date.now();
    var req = this.client.get(key, {
      "Range": "bytes=" + offset + "-" + (offset + length - 1),
      "Content-Type": "x-ijod/gz"
    });

    req.on("response", function (res) {

      // Dump debugging info about response
      //
      // TODO: Should logger.debug be efficient and let us avoid this additional
      // if statement?
      if (lconfig.debug) {
        logger.debug("S3 GET status:" + res.statusCode + " key:" + key);
        logger.debug(res.headers);
      }

      // Check specifically for 206 as we only ever do range requests
      // when using S3.
      if (res.statusCode === 206) {
        var buffer = new Buffer(length);
        var pos = 0;

        res.on("data", function (chunk) {
          chunk.copy(buffer, pos);
          pos += chunk.length;
        });

        res.on("end", function () {
          instruments.timing({"s3.getRange": (Date.now() - startTime)}).send();
          cb(null, buffer);
        });
      } else {
        var msg = "";
        res.on("data", function (data) { msg += data.toString(); });
        res.on("end", function () {
          cb(new Error("S3 GET error: " + res.statusCode + " key:" + key + " " +
                       msg.toString()), null);
        });
      }
    });

    // Execute the request
    return req.end();
  }; // s3_backend.get

  this.put = function (key, buffer, cb) {
    var startTime = Date.now();
    var req = this.client.put(key, {
      "Content-Length": buffer.length,
      "Content-Type": "x-ijod/gz",
      "x-amz-acl": "private"
    });

    req.on("response", function (res) {
      // Dump debugging info about response
      if (lconfig.debug) {
        logger.debug("S3 PUT status:" + res.statusCode + " key:" + key);
        logger.debug(res.headers);
      }

      if (res.statusCode === 200) {
        instruments.timing({"s3.getOne": (Date.now() - startTime)}).send();
        cb(null);
      } else {
        var msg = "";
        res.on("data", function (data) { msg += data.toString(); });
        res.on("end", function () {
          if (lconfig.debug) {
            logger.debug("S3 PUT error: " + msg.toString());
          }
          cb(new Error("S3 PUT error: " + res.statusCode + " key: " +
                       key + " " + msg.toString()));
        });
      }
    });

    req.end(buffer);
  }; // s3_backend.put

  return this;
}; // s3_backend
