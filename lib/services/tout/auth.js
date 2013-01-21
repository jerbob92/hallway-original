var OAUTH_BASE = 'https://www.tout.com/oauth';

var DEFAULT_SCOPES = [
  'read',
  'write',
  'share',
  'update_auth'
];

module.exports =  {
  strict: true,
  endPoint: OAUTH_BASE + '/token',
  grantType: 'authorization_code',
  handler: { oauth2 : 'POST' },
  authUrl: OAUTH_BASE + '/authorize?response_type=code&scope=' +
    DEFAULT_SCOPES.join(' ')
};
