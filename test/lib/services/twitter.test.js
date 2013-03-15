require('chai').should();

var fakeweb = require('node-fakeweb');
var path = require('path');
var helper = require(path.join(__dirname, '..', '..', 'support',
  'locker-helper.js'));

var friends = require(path.join('services', 'twitter', 'friends.js'));
var timeline = require(path.join('services', 'twitter', 'timeline.js'));
var mentions = require(path.join('services', 'twitter', 'mentions.js'));
var tweets = require(path.join('services', 'twitter', 'tweets.js'));

describe('Twitter connector', function () {
  var apiBase = 'https://api.twitter.com:443/1.1/';
  var pinfo;

  beforeEach(function () {
    fakeweb.allowNetConnect = false;
    pinfo = helper.loadFixture(path.join(__dirname, '..', '..', 'fixtures',
      'connectors', 'twitter.json'));
    pinfo.config = {};
  });

  afterEach(function () {
    fakeweb.tearDown();
  });

  describe('friends synclet', function () {
    beforeEach(function () {
      fakeweb.registerUri({
        uri: apiBase + 'friends/ids.json?path=%2Ffriends%2Fids.json' +
          '&stringify_ids=true&count=100',
        file: __dirname + '/../../fixtures/synclets/twitter/friends.js'
      });

      fakeweb.registerUri({
        uri: apiBase + 'users/lookup.json?' +
          'user_id=1054551&include_entities=false',
        file: __dirname + '/../../fixtures/synclets/twitter/1054551.js'
      });
    });

    it('can get contacts', function (done) {
      friends.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['contact:ctide@twitter/friends'][0].id.should
          .equal(1054551, 'response IDs should match');
        done();
      });
    });
  });

  describe('timeline synclet', function () {
    beforeEach(function () {
      fakeweb.registerUri({
        uri: apiBase + 'account/verify_credentials.json' +
          '?path=%2Faccount%2Fverify_credentials.json',
        file: __dirname + '/../../fixtures/synclets/twitter/verify_credentials.js'
      });

      fakeweb.registerUri({
        uri: apiBase + 'statuses/home_timeline.json?screen_name=ctide' +
          '&since_id=1&path=%2Fstatuses%2Fhome_timeline.json&count=200',
        file: __dirname + '/../../fixtures/synclets/twitter/home_timeline.js'
      });
    });

    it('can fetch tweets', function (done) {
      timeline.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['tweet:ctide@twitter/timeline'][0].id_str.should
          .equal('71348168469643264');
        done();
      });
    });
  });

  describe('mentions synclet', function () {
    beforeEach(function () {
      fakeweb.registerUri({
        uri: apiBase + 'account/verify_credentials.json' +
          '?path=%2Faccount%2Fverify_credentials.json',
        file : __dirname + '/../../fixtures/synclets/twitter/verify_credentials.js'
      });

      fakeweb.registerUri({
        uri: apiBase + 'statuses/mentions_timeline.json?screen_name=ctide&since_id=1' +
          '&path=%2Fstatuses%2Fmentions_timeline.json&count=200',
        file: __dirname + '/../../fixtures/synclets/twitter/home_timeline.js'
      });
    });

    it('can fetch mentions', function (done) {
      mentions.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['tweet:ctide@twitter/mentions'][0].id_str.should
          .equal('71348168469643264');
        done();
      });
    });
  });

  describe('tweets synclet', function () {
    beforeEach(function () {
      fakeweb.registerUri({
        uri: apiBase + 'account/verify_credentials.json' +
          '?path=%2Faccount%2Fverify_credentials.json',
        file: __dirname + '/../../fixtures/synclets/twitter/verify_credentials.js'
      });

      fakeweb.registerUri({
        uri: apiBase + 'statuses/user_timeline.json?screen_name=ctide' +
          '&since_id=1&path=%2Fstatuses%2Fuser_timeline.json&include_rts=true' +
          '&count=200',
        file: __dirname + '/../../fixtures/synclets/twitter/home_timeline.js'
      });
    });

    it('can fetch tweets', function (done) {
      tweets.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['tweet:ctide@twitter/tweets'][0].id_str.should
          .equal('71348168469643264');
        done();
      });
    });
  });
});
