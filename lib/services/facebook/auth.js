var OAUTH_BASE = 'https://graph.facebook.com/oauth';

var DEFAULT_SCOPE = [
  'create_event',
  'create_note',
  'email',
  'friends_about_me',
  'friends_activities',
  'friends_birthday',
  'friends_checkins',
  'friends_education_history',
  'friends_events',
  'friends_groups',
  'friends_hometown',
  'friends_interests',
  'friends_likes',
  'friends_location',
  'friends_notes',
  'friends_photos',
  'friends_relationship_details',
  'friends_relationships',
  'friends_religion_politics',
  'friends_status',
  'friends_subscriptions',
  'friends_videos',
  'friends_website',
  'friends_work_history',
  'offline_access',
  'photo_upload',
  'publish_actions',
  'publish_checkins',
  'publish_stream',
  'read_stream',
  'share_item',
  'status_update',
  'user_about_me',
  'user_activities',
  'user_birthday',
  'user_checkins',
  'user_education_history',
  'user_events',
  'user_groups',
  'user_hometown',
  'user_interests',
  'user_likes',
  'user_location',
  'user_notes',
  'user_photos',
  'user_relationship_details',
  'user_relationships',
  'user_religion_politics',
  'user_status',
  'user_subscriptions',
  'user_videos',
  'user_website',
  'user_work_history',
  'video_upload'
];

var AUTH_URL = 'https://graph.facebook.com/oauth/authorize' +
  '?response_type=code' +
  '&scope=' + DEFAULT_SCOPE.join(',');

// http://stackoverflow.com/questions/6163350/server-side-browser-detection-node-js
function isMobile(agent) {
  var $ = {};

  if (/mobile/i.test(agent))
    $.Mobile = true;

  if (/like Mac OS X/.test(agent)) {
    $.iOS = /CPU( iPhone)? OS ([0-9\._]+) like Mac OS X/.exec(agent)[2]
      .replace(/_/g, '.');
    $.iPhone = /iPhone/.test(agent);
    $.iPad = /iPad/.test(agent);
  }

  if (/Android/.test(agent)) {
    // XXX: Mozilla on android does not have a parenthetical version
    $.Android = true; ///Android ([0-9\.]+)[\);]/.exec(agent)[1];
  }

  if (/webOS\//.test(agent)) {
    // XXX: Forcing this to true for now
    $.webOS = true; ///webOS\/([0-9\.]+)[\);]/.exec(agent)[1];
  }

  return ($.Mobile || $.iPhone || $.Android || $.webOS);
}

module.exports =  {
  endPoint: OAUTH_BASE,
  grantType: '',
  handler: { oauth2 : 'GET' },
  authUrl: function (req) {
    var url = AUTH_URL;

    // ability to ask to login again to be true
    if (req.query.force_login === 'true' || req.query.auth_type) {
      url += '&auth_type=' + (req.query.auth_type || 'reauthenticate');
    }

    var agent = req && req.headers && req.headers['user-agent'];

    if (agent && isMobile(agent)) {
      url += '&display=touch';
    }

    return url;
  }
};
