/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var fs          = require('fs');
var request     = require('request');
var async       = require('async');
var util        = require('util');
var lutil       = require('lutil');
var querystring = require('querystring');
var urllib      = require('url');

var API_HOST = 'graph.facebook.com';

var PAGE_SIZE       = exports.PAGE_SIZE       = 500;
var SMALL_PAGE_SIZE = exports.SMALL_PAGE_SIZE = 100;

var TIMEOUT = 60000;

// Enumerate of all fields on a user for open graph. They're not all default.
var ALL_USER_FIELDS = [
  "bio",
  "birthday",
  "cover",
  "currency",
  "devices",
  "education",
  "email",
  "favorite_athletes",
  "favorite_teams",
  "first_name",
  "gender",
  "hometown",
  "id",
  "installed",
  "interested_in",
  "languages",
  "last_name",
  "link",
  "locale",
  "location",
  "middle_name",
  "name",
  "picture",
  "political",
  "quotes",
  "relationship_status",
  "religion",
  "significant_other",
  "third_party_id",
  "timezone",
  "updated_time",
  "username",
  "verified",
  "video_upload_limits",
  "website",
  "work"
].join(',');

function getPage(uri, cbDone) {
  if(!uri) return cbDone("no uri");

  request.get({
    uri     : uri,
    json    : true,
    timeout : TIMEOUT
  }, function(err, resp, json) {
    if(err) return cbDone(err);

    // Request failed
    if(resp.statusCode !== 200) {
      var errorResponse = new Error("Service responded with status code '" + resp.statusCode + "'.");
      errorResponse.originalError = json;
      return cbDone(errorResponse);
    }

    // Didn't get back JSON
    if(json === null || typeof json !== "object") {
      return cbDone("Response wasn't a JSON object " + util.inspect(json));
    }

    // Success!
    return cbDone(null, json);
  });
}
exports.getPage = getPage;

function getPages(arg, cbEach, cbDone) {
  if (!arg.uri) return cbDone("URI is required");
  if (!arg.total) arg.total = 0;

  getPage(arg.uri, function(err, json) {
    if (err) return cbDone(err);

    if (!Array.isArray(json.data)) {
      return cbDone(
        "Response didn't include a JSON array: " + util.inspect(json)
      );
    }

    // Kick back each item
    for (var i = 0; i < json.data.length; i++) {
      cbEach(json.data[i]);
    }

    // Bail out if we've hit our limit
    arg.total += json.data.length;
    if (arg.limit && arg.limit > 0 && arg.total >= arg.limit) return cbDone();

    // Last page
    if (json.data.length === 0 || !json.paging || !json.paging.next) {
      return cbDone();
    }

    // Continue paging
    arg.uri = json.paging.next;
    if (arg.since && arg.uri.indexOf("since=") === -1) {
      arg.uri += "&since=" + arg.since;
    }

    return getPages(arg, cbEach, cbDone);
  });
}

exports.getDataPage = function(path, params, cbDone) {
  if (!params.limit) params.limit = SMALL_PAGE_SIZE;

  getPage(exports.apiUrl(null, path, params), function(err, json) {
    if (err) return cbDone(err);

    if (!Array.isArray(json.data)) {
      return cbDone(
        "Response didn't include a JSON array: " + util.inspect(json)
      );
    }

    var cursor;
    var next = json.paging && json.paging.next;
    if (next) {
      var uri   = urllib.parse(next);
      cursor = querystring.parse(uri.query).after;
    }

    return cbDone(null, json, cursor);
  });
};

function getData(arg, path, cbEach, cbDone) {
  var params = {
    limit: arg.limit || PAGE_SIZE
  };
  if (arg.since) params.since = arg.since;
  arg.uri = exports.apiUrl(arg, path, params);

  getPages(arg, cbEach, cbDone);
}

exports.apiUrl = function(arg, path, params) {
  if (arg) params.access_token = arg.accessToken;
  if (!params.date_format) params.date_format = 'U';

  return urllib.format({
    protocol : 'https',
    host     : API_HOST,
    pathname : path,
    query    : params
  });
};

exports.getPostPhotos = function(arg, posts, cbDone) {
  var photoIDs = [];

  posts.data.forEach(function(post) {
    if(post.type === "photo") photoIDs.push(post.object_id);
  });

  exports.getObjects({
    ids         : photoIDs,
    accessToken : arg.accessToken
  }, cbDone);
};

// Walk a friends list, getting/caching each one
exports.getFriends = function(arg, cbEach, cbDone) {
  if (!arg.uri) {
    arg.uri = exports.apiUrl(arg, '/' + arg.id + '/friends', {
      limit: SMALL_PAGE_SIZE
    });
  }

  getPage(arg.uri, function(err, friends) {
    if (err) return cbDone(err);

    if (friends.data.length === 0) return cbDone();

    // this is super intense, but is it ok?
    var ids = [];
    friends.data.forEach(function(friend) {
      ids.push(friend.id);
    });

    var friendsURI = exports.apiUrl(arg, '/', {
      ids: ids.join(','),
      fields: ALL_USER_FIELDS
    });

    getPage(friendsURI, function(err, friendData){
      if (!err) {
        Object.keys(friendData).forEach(function(key) {
          cbEach(friendData[key]);
        });
      }

      var nextUrl = friends.paging && friends.paging.next;
      return cbDone(err, nextUrl);
    });
  });
};

// Get as much as we can about any single person
exports.getPerson = function(arg, cbEach, cbDone) {
  // should check cache here of people/id.json and use that if it's recent
  var uri = exports.apiUrl(arg, '/' + arg.id, {fields: ALL_USER_FIELDS});
  getPage(uri,function(err, person){
    if(err) return cbDone(err);
    cbEach(person);
    cbDone();
  });
};

// Fetch all checkins
exports.getCheckins = function(arg, cbEach, cbDone) {
  var path = '/' + arg.id + '/checkins';
  getData(arg, path, cbEach, cbDone);
};

exports.getAlbums = function (arg, cbDone) {
  if (!arg.albumSince) arg.albumSince = 0;
  arg.fql = 'SELECT object_id, modified FROM album' +
            ' WHERE owner=me() AND modified > ' + arg.albumSince;
  exports.getFQL(arg, cbDone);
};

// Get all the posts for a person and type (home or feed)
exports.getPosts = function(arg, cbEach, cbDone) {
  var path = '/' + arg.id + '/' + arg.type;
  getData(arg, path, cbEach, cbDone);
};

// Dumb wrapper to just pass back a single page
exports.getPostPage = function(arg, cbDone) {
  var params = {
    limit: arg.limit || PAGE_SIZE
  };
  if (arg.since) params.since = arg.since;
  if (arg.until) params.until = arg.until;

  var uri = exports.apiUrl(arg, '/' + arg.id + '/' + arg.type, params);
  getPage(uri, cbDone);
};

// Get a list of objects
exports.getObjects = function(arg, cbDone) {
  if(!arg.ids || arg.ids.length === 0) return cbDone();

  var uri = exports.apiUrl(arg, '/', {ids: arg.ids.join(',')});
  getPage(uri,function(err, data){
    if(err || typeof data !== 'object') return cbDone(err);
    var ret = [];
    Object.keys(data).forEach(function(key){
      ret.push(data[key]);
    });
    cbDone(null, ret);
  });
};

exports.getProfile = function(arg, cbDone) {
  var uri = exports.apiUrl(arg, '/me', {fields: ALL_USER_FIELDS});
  getPage(uri, cbDone);
};

exports.getId = function(arg, cbDone) {
  var uri = exports.apiUrl(arg, '/'+arg.id, {});
  getPage(uri, cbDone);
};


// Simple FQL wrapper
exports.getFQL = function(arg, cbDone) {
  var uri = exports.apiUrl(arg, '/fql', {q: arg.fql});
  getPage(uri, function(err, json){
    if(err) return cbDone(err);
    if(!Array.isArray(json.data)) return cbDone("Missing data array");
    cbDone(null, json.data);
  });
};

