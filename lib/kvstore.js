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

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var crypto = require('crypto');
var RiakClient = require("riak");

// Simple key/value storage system

var STORES = {};

// Instantiate a new KV store, based on type
exports.instance = function (type, options)
{
  return new STORES[type](options);
};

// allow passing in objects or strings, unify to a buffer
function serialize(val)
{
  if (Buffer.isBuffer(val)) {
    var buf = new Buffer(val.length);
    buf.copy(val);
    return buf;
  } else if (typeof val === 'object')
    return new Buffer(JSON.stringify(val));
  else
    return new Buffer(val);
}

// on the way back out, optional transform back, default to json
function deserialize(val, args, cb)
{
  args = args || {};
  if (args.buffer)
    return cb(null, val);
  else if (args.string)
    return cb(null, val.toString());
  else {
    var js;
    try {
      js = JSON.parse(val);
    } catch (E) {
      return cb(new Error("kvstore.deserialize: JSON parse error: " + E));
    }

    return cb(null, js);
  }
}

// Simple in-memory
STORES.mem = function () {
  this.store = {};

  this.get = function (bucket, key, args, cbDone) {
    if (this.store[bucket] && this.store[bucket][key]) {
      deserialize(this.store[bucket][key], args, cbDone);
    }
    else
      cbDone();
  };

  this.put = function (bucket, key, value, cbDone) {
    var b = this.store.bucket || {};
    b[key] = serialize(value);
    this.store[bucket] = b;
    cbDone();
  };

  this.del = function (bucket, key, cbDone) {
    delete this.store.bucket.key;
    cbDone();
  };

  return this;
};

// local filesystem
STORES.fs = function (options) {
  this.base_path = (options && options.base_path) || "/tmp/kvstore";

  // filesystems don't like special chars
  function safekey(key) {
    return crypto.createHash('md5').update(key).digest('hex');
  }

  this.get = function (bucket, key, args, cbDone) {
    fs.readFile(path.join(this.base_path, bucket, safekey(key)), 'utf8', function (err, data) {
      if (err) {
        if (err.code === "ENOENT") return cbDone(null, null);
        else return cbDone(err);
      } else {
        deserialize(data, args, cbDone);
      }
    });
  };

  this.put = function (bucket, key, value, cbDone) {
    var keypath = path.join(this.base_path, bucket, safekey(key));

    // Ensure the base of the keypath exists
    mkdirp(path.dirname(keypath), function (err) {
      if (err) return cbDone(err);
      fs.writeFile(keypath, serialize(value), null, cbDone);
    });
  };

  this.del = function (bucket, key, cbDone) {
    fs.unlink(path.join(this.base_path, bucket, safekey(key)), cbDone);
  };

  return this;
};

// riaksome
STORES.riak = function (options) {
  if (!options || !options.servers) return null;
  var instance = {};
  var client = new RiakClient(options.servers, Math.random().toString(),
                              null, {keepAlive: true});

  instance.get = function (bucket, key, args, cbDone) {
    client.get(bucket, key, args.options || {}, function (err, resp, obj) {
      if (err) return cbDone(err);
      // Treat not-found as just a null result
      if (resp.statusCode === 404) return cbDone(null, null);
      else if (resp.statusCode === 200) return cbDone(null, obj);
      else cbDone(new Error("Unexpected Riak response for " + bucket + " / " + key +
                            ": " + resp.statusCode));
    });
  };

  instance.put = function (bucket, key, value, cbDone) {
    client.put(bucket, key, value, {}, cbDone);
  };

  instance.del = function (bucket, key, cbDone) {
    client.del(bucket, key, cbDone);
  };

  return instance;
};

