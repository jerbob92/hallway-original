var should = require('chai').should();

var fakeweb = require('node-fakeweb');
var path = require('path');
var helper = require(path.join(__dirname, '..', '..', 'support',
  'locker-helper.js'));

var feed = require(path.join('services', 'facebook', 'feed.js'));
//var friends = require(path.join('services', 'facebook', 'friends.js'));
var home = require(path.join('services', 'facebook', 'home.js'));
var homeup = require(path.join('services', 'facebook', 'home_update.js'));
var photos = require(path.join('services', 'facebook', 'photos.js'));

describe('Facebook connector', function () {
  var apiBase = 'https://graph.facebook.com:443/me/';
  var pinfo;

  before(function () {
    fakeweb.allowNetConnect = false;
  });

  beforeEach(function () {
    fakeweb.allowNetConnect = false;
    pinfo = helper.loadFixture(path.join(__dirname, '..', '..', 'fixtures',
      'connectors', 'facebook.json'));
    pinfo.config = {};
  });

  afterEach(function () {
    fakeweb.tearDown();
  });

  describe('the feed synclet', function () {
    beforeEach(function () {
      fakeweb.registerUri({
        uri: apiBase + 'feed?limit=200&access_token=foo&date_format=U',
        file: __dirname + '/../../fixtures/synclets/facebook/feed.json'
      });

      fakeweb.registerUri({
        uri: 'https://graph.facebook.com:443/?ids=3362356749178' +
          '&access_token=foo&date_format=U',
        file: __dirname + '/../../fixtures/synclets/facebook/photo.json'
      });
    });

    it('fetches your profile feed', function (done) {
      feed.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['post:42@facebook/feed'][0].id
          .should.equal('100002438955325_224550747571079');
        done();
      });
    });

    it('collects photos included in posts', function (done) {
      feed.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['photo:42@facebook/home_photos'][0].id
          .should.equal('3488997579924');
        done();
      });
    });

    describe('separating self-posts vs. other people', function () {
      beforeEach(function () {
        pinfo.auth.pid = '100002438955325@facebook';
      });

      it('collects posts made by the profile owner', function (done) {
        feed.sync(pinfo, function (err, response) {
          if (err) return done(err);
          var posts = response.data['post:100002438955325@facebook/feed_self'];
          posts.forEach(function (post) {
            post.from.id.should.equal('100002438955325');
          });
          done();
        });
      });

      it('collects posts made everyone else', function (done) {
        feed.sync(pinfo, function (err, response) {
          if (err) return done(err);
          var posts = response.data['post:100002438955325@facebook/feed_others'];
          posts.forEach(function (post) {
            post.from.id.should.not.equal('100002438955325');
          });
          done();
        });
      });
    });

    describe('when there is more to fetch', function () {
      it('remembers the next page to fetch', function (done) {
        feed.sync(pinfo, function (err, response) {
          response.config.next.should.equal('https://graph.facebook.com/me/' +
            'home?access_token=abc&date_format=U&limit=25&until=1306193396');
          done();
        });
      });

      it('schedules itself immediately', function (done) {
        feed.sync(pinfo, function (err, response) {
          response.config.nextRun.should.equal(-1);
          done();
        });
      });
    });

    describe('when there is nothing left to fetch', function () {
      beforeEach(function () {
        fakeweb.registerUri({
          uri: apiBase + 'feed?limit=200&access_token=foo&date_format=U',
          body: '{"data":[]}'
        });
      });

      it('does not schedule another run', function (done) {
        feed.sync(pinfo, function (err, response) {
          response.config.next.should.equal(false);
          done();
        });
      });
    });
  });

  describe('home synclet', function () {
    beforeEach(function () {
      fakeweb.registerUri({
        uri: 'https://graph.facebook.com:443/?ids=3488997579924' +
          '&access_token=foo&date_format=U',
        file: __dirname + '/../../fixtures/synclets/facebook/photo.json'
      });

      fakeweb.registerUri({
        uri: apiBase + 'home?limit=200&access_token=foo&date_format=U',
        file: __dirname + '/../../fixtures/synclets/facebook/home.json'
      });

      fakeweb.registerUri({
        uri: apiBase + 'feed?date_format=U&access_token=abc&limit=25' +
          '&until=1305843879',
        body: '{"data":[]}'
      });
    });

    it('can fetch news feed', function (done) {
      home.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['post:42@facebook/home'][0].id
          .should.equal('100002438955325_224550747571079');
        response.data['photo:42@facebook/home_photos'][0].id
          .should.equal('3488997579924');
        done();
      });
    });

    it('collects photos included in posts', function (done) {
      home.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['photo:42@facebook/home_photos'][0].id
          .should.equal('3488997579924');
        done();
      });
    });
  });

  describe('home update synclet', function () {
    beforeEach(function () {
      fakeweb.registerUri({
        uri: apiBase + 'home?limit=500&since=yesterday&access_token=foo' +
          '&date_format=U',
        file: __dirname + '/../../fixtures/synclets/facebook/home.json'
      });

      fakeweb.registerUri({
        uri: 'https://graph.facebook.com:443/me/feed?limit=500' +
          '&since=yesterday&access_token=foo&date_format=U',
        file: __dirname + '/../../fixtures/synclets/facebook/home.json'
      });

      fakeweb.registerUri({
        uri: apiBase + 'feed?date_format=U&access_token=abc&limit=25' +
          '&until=1305843879&since=yesterday',
        body: '{"data":[]}'
      });
    });

    it('can update news feed', function (done) {
      homeup.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['post:42@facebook/home'][0].id
          .should.equal('100002438955325_105511996206765');
        done();
      });
    });
  });

  describe('the photos synclet', function () {
    beforeEach(function () {
      fakeweb.registerUri({
        uri: 'https://graph.facebook.com:443/fql?q=SELECT%20object_id' +
          '%2C%20modified%20FROM%20album%20WHERE%20owner%3Dme()%20AND%20' +
          'modified%20%3E%200&access_token=foo&date_format=U',
        file: __dirname + '/../../fixtures/synclets/facebook/albums.json'
      });

      fakeweb.registerUri({
        uri: 'https://graph.facebook.com:443/?ids=59354442594%2C' +
          '10150465363772595&access_token=foo&date_format=U',
        file: __dirname + '/../../fixtures/synclets/facebook/album.json'
      });

      fakeweb.registerUri({
        uri : 'https://graph.facebook.com:443/10150465363772595/photos' +
          '?access_token=foo&limit=100&date_format=U',
        file : __dirname + '/../../fixtures/synclets/facebook/photos.json'
      });

      fakeweb.registerUri({
        uri : 'https://graph.facebook.com:443/59354442594/photos' +
          '?access_token=foo&limit=100&date_format=U',
        file : __dirname + '/../../fixtures/synclets/facebook/photos.json'
      });
    });

    describe('when we have no albums to fetch', function () {
      it('fetches new albums', function (done) {
        photos.sync(pinfo, function (err, response) {
          if (err) return done(err);
          response.config.albums[0].object_id.should.equal(59354442594);
          response.config.albums[1].object_id.should.equal('10150465363772595');
          done();
        });
      });
    });

    describe('when there are albums to fetch', function () {
      beforeEach(function () {
        pinfo.config.albums = helper.loadFixture(__dirname +
          '/../../fixtures/synclets/facebook/albums.json').data;
      });

      it('fetches new photos', function (done) {
        photos.sync(pinfo, function (err, response) {
          if (err) return done(err);
          response.data['photo:42@facebook/photos'][0].id
            .should.equal('214713967594');
          done();
        });
      });

      it('consumes an album', function (done) {
        photos.sync(pinfo, function (err, response) {
          if (err) return done(err);
          response.config.albums.length.should.equal(1);
          done();
        });
      });

      it('schedules itself immediately', function (done) {
        photos.sync(pinfo, function (err, response) {
          if (err) return done(err);
          response.config.nextRun.should.equal(-1);
          done();
        });
      });

      describe('when we fetch the last album', function () {
        beforeEach(function () {
          pinfo.config.albums.pop();
        });

        it('does not run again', function (done) {
          photos.sync(pinfo, function (err, response) {
            if (err) return done(err);
            should.not.exist(response.config.nextRun);
            done();
          });
        });
      });
    });
  });
});
