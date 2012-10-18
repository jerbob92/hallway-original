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

var fakeweb = require("node-fakeweb");

var assert = require("assert");
var crypto = require("crypto");

describe("ijod-backend", function () {
  before(function (done) {
    fakeweb.tearDown();
    done();
  });

  var backends = ["ijod-fs", "ijod-s3"];
  backends.forEach(function (backendName) {
    it('should complete put/get successfully: ' + backendName, function (done) {
      var backendModule = require(backendName);
      var backend = new backendModule.backend();

      // Generate a 10k block of random data (sync)
      var block = crypto.randomBytes(10 * 1024);
      var path = "putget";

      // Generate a random offset/length of the data to retrieve
      var offset = Math.floor(Math.random() * (block.length - 1));
      var length = Math.floor(Math.random() * (block.length - offset - 1));

      // Ensure we're not generating a bad set of values
      assert.equal(true, offset >= 0);
      assert.equal(true, (offset + length) < block.length);

      // Do the put/get cycle and validate no errors
      backend.put(path, block, function (err) {
        assert.equal(null, err, err);
        backend.get(path, offset, length, function (err, storedData) {
          assert.equal(null, err, err);
          assert.deepEqual(block.slice(offset, offset + length), storedData);
          done();
        }); // backend.get
      }); // backend.put
    }); // it
  }); // forEach
});
