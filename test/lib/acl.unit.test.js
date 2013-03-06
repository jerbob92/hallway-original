var acl = require('acl');
var assert = require('assert');

describe('acl', function () {
  describe('#init', function () {
    it('should initialize', function (done) {
      acl.init(done);
    });
  });

  describe('getAppClasses', function() {
    it('should return core only', function(done) {
      acl.getAppClasses({notes:{}}, function(err, classes){
        var trues = 0;
        Object.keys(classes).forEach(function(key){ if(classes[key]) trues++; });
        assert(trues === 1);
        assert(classes.core === true);
        done();
      });
    });
  });

  describe('getAppClasses', function() {
    it('should return nothing', function(done) {
      acl.getAppClasses({notes:{NoSync:true}}, function(err, classes){
        assert(Object.keys(classes).length === 0);
        done();
      });
    });
  });

  describe('getAppClasses', function() {
    it('should return custom of 2', function(done) {
      acl.getAppClasses({notes:{customOnly:true, customFreqs:{'facebook':{'self':1, 'photos':1}}}}, function(err, classes){
        var trues = 0;
        Object.keys(classes).forEach(function(key){ if(classes[key]) trues++; });
        assert(trues === 2);
        assert(classes.facebook_self === true);
        assert(classes.facebook_photos === true);
        done();
      });
    });
  });

  describe('getAppClasses', function() {
    it('personal', function(done) {
      acl.getAppClasses({notes:{PersonalCheckins:true}}, function(err, classes){
        assert(classes.personal);
        assert(!classes.social);
        done();
      });
    });
  });

  describe('getAppClasses', function() {
    it('social', function(done) {
      acl.getAppClasses({notes:{SocialSyncingAllowed:true}}, function(err, classes){
        assert(classes.social);
        done();
      });
    });
  });
  /*
  describe('#getGrant');
  describe('#addGrant');
  describe('#delGrant');
  describe('#getAppProfile');
  describe('#isAppAccount');
  describe('#addAppProfile');
  describe('#addDevice');
  describe('#getOrAdd');
  describe('#getAppsForAccount');
  describe('#setAppOwners');
  describe('#hasAppPerms');
  describe('#getAppAcountCount');
  describe('#getApp');
  describe('#getAppClasses');
  describe('#getAppsClasses');
  describe('#isFixFreq');
  describe('#areFixedFreq');
  describe('#customFreq');
  describe('#getAppFor');
  describe('#getApps');
  describe('#addApp');
  describe('#updateApp');
  describe('#deleteApp');
  describe('#getProfiles');
  describe('#getManyProfiles');
  describe('#getProfile');
  describe('#delProfile');
  describe('#delProfiles');
  */
});
