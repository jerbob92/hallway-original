/*
*
* Copyright (C) 2011, Singly, Inc.
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var instagram = require('./lib.js');

exports.sync = function(pi, cb) {
  var self = {};
  instagram.getSelf(pi, function(me){
    self = me;
  }, function(err) {
    if (err) return cb(err);
    if (!(self && self.id)) return cb('invalid profile object', self);
    pi.auth.profile = self;
    pi.auth.pid = self.id + '@instagram'; // profile id
    var base = 'contact:' + pi.auth.pid + '/self';
    pi.data = {};
    pi.data[base] = [self];
    cb(err, pi);
  });
};
