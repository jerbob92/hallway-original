var assert = require('assert');

var servezas = require('servezas');

describe('servezas', function() {
  describe('load()', function() {
    it('should not crash', function(){
      servezas.load();
    });
  });

  describe('syncletList()', function() {
    it('should return some synclets', function(done) {
      var fb = servezas.syncletList('facebook');
      assert(fb.length > 2);
      done();
    });
  });

  describe('syncletList()', function() {
    it('should return no synclets', function(done) {
      var fb = servezas.syncletList('facebook', {});
      assert(fb.length === 0);
      done();
    });
  });

  describe('syncletList()', function() {
    it('should return some synclets', function(done) {
      var fb = servezas.syncletList('facebook', {'facebook_self':true, 'facebook_photos':true});
      assert(fb.length === 2);
      done();
    });
  });

  describe('syncletData()', function() {
    it('should return some data', function(done) {
      var fb = servezas.syncletData('facebook', 'photos');
      assert.equal(fb.name, 'photos');
      done();
    });
  });

  describe('synclet()', function() {
    it('should return some data', function(done) {
      var fb = servezas.synclet('facebook', 'photos');
      assert.equal(typeof fb.sync, 'function');
      done();
    });
  });

  describe('synclets()', function() {
    it('should return some data', function(done) {
      var fb = servezas.synclets('facebook');
      assert.equal(fb.photos.data.name, 'photos');
      done();
    });
  });

  describe('services()', function() {
    it('should return some data', function(done) {
      var services = servezas.services();
      assert(Object.keys(services).length > 10);
      assert(services.facebook.synclets.length > 2);
      done();
    });
  });

  describe('serviceList()', function() {
    it('should return some data', function(done) {
      var services = servezas.serviceList();
      assert(services.length > 10);
      assert.notEqual(services.indexOf('facebook'), -1);
      done();
    });
  });
});

