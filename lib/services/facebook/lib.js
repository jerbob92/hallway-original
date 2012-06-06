/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var fs = require('fs'),
    request = require('request'),
    async = require('async');
var util = require('util');
var querystring = require('querystring');

var timeout = 60000;

// enumeration of all fields on a user for open graph, cuz they're not all default
var allUserFields = "id,name,first_name,middle_name,last_name,gender,locale,languages," +
                    "link,username,third_party_id,timezone,updated_time,verified,bio," +
                    "birthday,education,email,hometown,interested_in,location,political," +
                    "favorite_athletes,favorite_teams,quotes,relationship_status," +
                    "religion,significant_other,video_upload_limits,website,work";

// walk a friends list getting/caching each one
exports.getFriends = function(arg, cbEach, cbDone) {
    var fb = this;
    var uri = 'https://graph.facebook.com/'+arg.id+'/friends?limit=500&access_token=' + arg.accessToken + '&date_format=U';
    getOne(uri,function(err,friends){
        if(err || !Array.isArray(friends.data)) return cbDone(err);
        // this is super intense, but is it ok?
        var ids = [];
        friends.data.forEach(function(friend){ ids.push(friend.id) });
        getOne('https://graph.facebook.com/?access_token='+arg.accessToken+'&date_format=U&fields='+allUserFields+'&ids='+ids.join(','), function(err, js){
          if(err || typeof js != 'object') return cbDone(err);
          Object.keys(js).forEach(function(key){ cbEach(js[key]) });
          cbDone();
        });
    });
}

// get as much as we can about any single person, including caching their thumbnail
exports.getPerson = function(arg, cbEach, cbDone) {
    // should check cache here of people/id.json and just use that if it's recent enough
    var uri = 'https://graph.facebook.com/'+arg.id+'?access_token=' + arg.accessToken + '&date_format=U&fields='+allUserFields;
    getOne(uri,function(err,js){
        if(err) return cbDone(err);
        cbEach(js);
        cbDone();
    });
}

// fetching all checkins
exports.getCheckins = function (arg, cbEach, cbDone) {
  var since = (arg.since)?"&since="+arg.since:"";
  arg.uri = (arg.page)?arg.page:'https://graph.facebook.com/'+arg.id+'/checkins?limit=500&access_token=' + arg.accessToken + '&date_format=U'+since;
  getDatas(arg, cbEach, cbDone);
}

// fetching all checkins
exports.getCheckinFeed = function (arg, cbEach, cbDone) {
  var since = (arg.since)?"&since="+arg.since:"";
  arg.uri = (arg.page)?arg.page:'https://graph.facebook.com/search?type=checkin&access_token=' + arg.accessToken + '&date_format=U'+since;
  getDatas(arg, cbEach, cbDone);
}

// recurse getting all the photos in an album
exports.getAlbum = function (arg, cbEach, cbDone) {
  var since = (arg.since)?"&since="+arg.since:"";
  arg.uri = (arg.page)?arg.page:'https://graph.facebook.com/'+arg.id+'/photos?limit=500&access_token=' + arg.accessToken + '&date_format=U'+since;
  getDatas(arg, cbEach, cbDone);
}

// recurse getting all the albums for a person
exports.getAlbums = function (arg, cbEach, cbDone) {
    arg.uri = (arg.page)?arg.page:'https://graph.facebook.com/'+arg.id+'/albums?limit=500&access_token=' + arg.accessToken + '&date_format=U';
    getDatas(arg, cbEach, cbDone);
}

// recurse getting all the photos tagged in
exports.getTagged = function (arg, cbEach, cbDone) {
    arg.uri = (arg.page)?arg.page:'https://graph.facebook.com/'+arg.id+'/photos?limit=500&access_token=' + arg.accessToken + '&date_format=U';
    getDatas(arg, cbEach, cbDone);
}

// get any object
exports.getObject = function(arg, cbDone) {
  var uri = 'https://graph.facebook.com/'+arg.id+'?access_token=' + arg.accessToken + '&date_format=U';
  getOne(uri,cbDone);
}

// get a list of objects
exports.getObjects = function(arg, cbDone) {
  if(!arg.ids || arg.ids.length == 0) return cbDone();
  var uri = 'https://graph.facebook.com/?access_token=' + arg.accessToken + '&date_format=U&ids='+arg.ids.join(',');
  getOne(uri,function(err, js){
    if(err || typeof js != 'object') return cbDone(err);
    var ret = []
    Object.keys(js).forEach(function(key){ ret.push(js[key]) });
    cbDone(null, ret);
  });
}

// recurse getting all the posts for a person and type (wall or newsfeed) {id:'me',type:'home',since:123456789}
exports.getPosts = function (arg, cbEach, cbDone) {
    var since = (arg.since)?"&since="+arg.since:"";
    arg.uri = (arg.page)?arg.page:'https://graph.facebook.com/'+arg.id+'/'+arg.type+'?access_token=' + arg.accessToken + '&date_format=U'+since + '&limit=500';
    // possible facebook bug here when using since, sometimes the paging.next doesn't contain the since and it'll end up re-walking the whole list
    getDatas(arg, cbEach, cbDone);
}

// pretty dumb wrapper to just pass back a single page
exports.getPostPage = function (arg, cbDone) {
    var since = (arg.since)?"&since="+arg.since:"";
    var limit = arg.limit || 100;
    var uri = (arg.page)?arg.page:'https://graph.facebook.com/'+arg.id+'/'+arg.type+'?access_token=' + arg.accessToken + '&date_format=U'+since + '&limit='+limit;
    // possible facebook bug here when using since, sometimes the paging.next doesn't contain the since and it'll end up re-walking the whole list
    getOne(uri, cbDone);
}


exports.getProfile = function(arg, cbDone) {
    getOne('https://graph.facebook.com/me?access_token=' + arg.accessToken + '&fields='+allUserFields, cbDone);
}

// simple fql wrapper
exports.getFQL = function (arg, cbDone) {
  var uri = 'https://graph.facebook.com/fql?'+querystring.stringify({q:arg.fql, access_token:arg.accessToken});
  getOne(uri, function(err, js){
    if(err) return cbDone(err);
    if(!Array.isArray(js.data)) return cbDone("missing data array");
    cbDone(null, js.data);
  });
}

function getOne(uri, cbDone) {
    if(!uri) return cbDone("no uri");
    request.get({uri:uri, json:true, timeout:timeout}, function(err, resp, js) {
        if(err) return cbDone(err);
        if(resp.statusCode != 200) return cbDone("status code "+resp.statusCode+": "+util.inspect(js));
        if(js === null || typeof js != "object") return cbDone("response wasn't a json object "+util.inspect(js));
        cbDone(null, js);
    });
}

function getDatas(arg, cbEach, cbDone) {
    if(!arg.uri) return cbDone("no uri");
    if(!arg.total) arg.total = 0;
    request.get({uri:arg.uri, json:true, timeout:timeout}, function(err, resp, js) {
        if(err) return cbDone(err);
        if(resp.statusCode != 200) return cbDone("status code "+resp.statusCode+": "+util.inspect(js));
        if(js === null || typeof js != "object" || !Array.isArray(js.data)) return cbDone("response didn't include a json array: "+util.inspect(js));
        // kick back each item
        for(var i = 0; js.data && i < js.data.length; i++) cbEach(js.data[i]);
        // bail out if limit'd or no more
        arg.total += js.data.length;
        if(arg.limit > 0 && arg.total >= arg.limit) return cbDone();
        if(!js.paging || !js.paging.next) return cbDone();
        // page ho!
        arg.uri = js.paging.next;
        if(arg.since && arg.uri.indexOf("since=") == -1) arg.uri += "&since="+arg.since;
        getDatas(arg,cbEach,cbDone);
    });
}

