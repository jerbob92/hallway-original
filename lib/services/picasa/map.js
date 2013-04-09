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
*    * Neither the name of the Locker Project nor the
*      names of its contributors may be used to endorse or promote products
*      derived from this software without specific prior written permission.
*
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
* ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
* WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
* DISCLAIMED. IN NO EVENT SHALL THE LOCKER PROJECT BE LIABLE FOR ANY
* DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
* (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
* LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
* ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
* (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
* SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

var _ = require('underscore');

// must be unique per service, see dMap.js
exports.ptype = 118;

function tee(val) {
  return val && val.$t;
}

function id(data) {
  return tee(data.gphoto$id);
}

function timestamp(data) {
  // Should we prefer the photo's taken time (gphoto$timestamp) here?
  var date = tee(data.updated) || tee(data.published);

  return date ? new Date(date).valueOf() : false;
}

exports.profile = {
  id: function (data) {
    return tee(data.gphoto$user);
  },
  oembed: function (data) {
    return {
      id: tee(data.gphoto$user),
      title: tee(data.gphoto$nickname),
      url: data.author && data.author[0] && tee(data.author[0].uri),
      thumbnail_url: tee(data.gphoto$thumbnail),
      provider_name: 'picasa'
    };
  }
};

exports.album = {
  id: id,
  at: timestamp,
  text: function (data) {
    return tee(data.title);
  }
};

exports.photo = {
  id: id,
  at: timestamp,
  earliest: function (data) {
    return parseInt(tee(data.gphoto$timestamp), 10);
  },
  oembed: function (data) {
    var thumbnailUrl = data.content.src;

    // Use the largest thumbnail
    if (data.media$group && data.media$group.media$thumbnail) {
      data.media$group.media$thumbnail.sort(function (a, b) {
        return b.width - a.width;
      });

      thumbnailUrl = data.media$group.media$thumbnail[0];
    }

    var providerUrl = _.find(data.link, function (link) {
      return link.rel === 'http://schemas.google.com/photos/2007#canonical';
    });

    return {
      type: 'photo',
      title: tee(data.title),
      height: tee(data.gphoto$height),
      width: tee(data.gphoto$width),
      url: data.content.src,
      thumbnail_url: thumbnailUrl,
      provider_name: 'picasa',
      provider_url: providerUrl
    };
  },
  media: function (data) {
    return data.content.src;
  },
  ll: function (data) {
    if (data.georss$where &&
      data.georss$where.gml$Point &&
      data.georss$where.gml$Point.gml$pos) {
      return tee(data.georss$where.gml$Point.gml$pos).split(' ');
    }
  }
};

exports.defaults = {
  albums: 'album',
  photos: 'photo',
  self: 'profile'
};

exports.types = {
  photos: ['photo:picasa/photos']
};
