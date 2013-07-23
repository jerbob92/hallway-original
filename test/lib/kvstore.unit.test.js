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

var assert = require("assert");
var kvstore = require("kvstore");
var _ = require("underscore");

describe("kvstore", function () {

  var backends = {mem: {},
                  fs: {},
                  riak: {servers: ["127.0.0.1:8098"]}};

  _.keys(backends).forEach(function (name) {
    it("should complete JSON put/get in " + name + " successfully",
      function (cbDone) {
      var value = {a: 123, b: "abcdef"};
      var store = kvstore.instance(name, backends[name]);
      //console.log(JSON.stringify(store));
      store.put("testb1", "testk1", value, function (err) {
        assert.ifError(err);
        store.get("testb1", "testk1", {}, function (err, data) {
          assert.ifError(err);
          assert.deepEqual(value, data);
          cbDone();
        });
      });
    });

    it("should return null on not-found in " + name, function (cbDone) {
      var store = kvstore.instance(name, backends[name]);
      store.get("testb2", "testk2", {}, function (err, data) {
        assert.ifError(err);
        assert.equal(null, data);
        cbDone();
      });
    });
  });
});
