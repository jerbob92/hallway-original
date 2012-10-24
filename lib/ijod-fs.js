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

var lconfig = require("lconfig");
var logger = require("logger").logger("ijod-fs");
var path = require("path");
var fs = require("fs");
var mkdirp = require("mkdirp");

// ***********************************************
//
// File-based storage for ijod
//
// ***********************************************
exports.backend = function () {

  this.get = function (key, offset, length, cb) {

    // We need to do an unfortunate amount of work to only read part of the
    // file. *sigh*
    var buffer;
    var bufferPos = 0;
    var fd;
    var fdPos = offset;

    fs.open(path.join(this.base_path, key), "r", -1, function (err, fd_) {
      if (err) return cb(err, null);

      fd = fd_;
      buffer = new Buffer(length);
      read();
    });

    function read() {
      fs.read(fd, buffer, bufferPos, buffer.length - bufferPos, fdPos, afterRead);
    }

    function afterRead(err, bytesRead, buffer) {
      if (bytesRead > 0) {
        bufferPos += bytesRead;
        fdPos += bytesRead;
        if (bufferPos === buffer.length) {
          // Buffer is full -- all data has been read
          cleanup(null, buffer);
        } else {
          // Need to keep reading
          read();
        }
      } else {
        // Error occurred while reading
        cleanup(err, null);
      }
    }

    function cleanup(err, buffer) {
      fs.close(fd, function () {
        // Note that we don't worry about any errors while closing
        cb(err, buffer);
      });
    }
  }; // file_backend.get

  this.put = function (key, buffer, cb) {
    var keypath = path.join(this.base_path, key);

    // Ensure the base of the keypath exists
    mkdirp(path.dirname(keypath), function (err) {
      if (err) return cb(err);
      fs.writeFile(keypath, buffer, null, cb);
    });
  }; // file_backend.put

  // Get the target directory from our config file; use a default if necessary
  this.base_path = lconfig.ijod_path;
  if (!this.base_path) {
    this.base_path = "/tmp/ijod";
    logger.warn("No ijod_path specified for storing data on filesystem; " +
                "using /tmp/ijod");
  }

  // Verify the target directory actually exists; error out if not
  if (!fs.existsSync(this.base_path)) {
    throw Error("ijod path does not exist: " + this.base_path);
  }

  return this;
}; // file_backend

