var mocha   = require('mocha')
  , should  = require('should')
  , fakeweb = require('node-fakeweb')
  , path    = require('path')
  , helper  = require(path.join(__dirname, '..', '..', 'support', 'locker-helper.js'))
  , util    = require('util')
  ;

describe("Flickr connector", function () {
  var pinfo;
  var apiBase = "https://secure.flickr.com/services/";

  beforeEach(function (done) {
    fakeweb.allowNetConnect = false;
    pinfo = helper.loadFixture(path.join(__dirname, '..', '..', 'fixtures', 'synclets', 'flickr', 'flickr.json'));
    return done();
  });

  afterEach(function (done) {
    fakeweb.tearDown();
    return done();
  });


});
