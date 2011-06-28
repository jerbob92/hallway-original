/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var fs = require('fs'),
    sync = require('./sync'),
    locker = require('../../Common/node/locker.js');
    
var app, auth;

module.exports = function(theApp) {
    app = theApp;
    app.get('/', index);
    this.authComplete = authComplete;
    return this;
};

function authComplete(theAuth, mongo) {
    auth = theAuth;
    sync.init(auth, mongo);

    app.get('/friends', friends);
    app.get('/messages', messages);
    sync.eventEmitter.on('message/imap', function(eventObj) {
        locker.event('message/imap', eventObj);
    });
}

function index(req, res) {
    if(!(auth && auth.username && auth.password && auth.host && auth.port)) {
        res.redirect(app.externalBase + 'go');
    } else {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end("<html>Found valid authentication, sync up your <a href='messages'>mail messages</a></html>");
    }
}

function friends(req, res) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    sync.syncFriends(function(err, repeatAfter, diaryEntry) {
        locker.diary(diaryEntry);
        locker.at('/friends', repeatAfter);
        res.end(JSON.stringify({success: "done fetching friends"}));
    });
}

function messages(req, res) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    sync.syncMessages(function(err, repeatAfter, diaryEntry) {
        locker.diary(diaryEntry);
        locker.at('/messages', repeatAfter);
        res.end(JSON.stringify({success: "done fetching messages"}));
    });
}