module.exports = {
  endPoint: 'https://api.moves-app.com/oauth/v1/access_token',
  handler: { oauth2 : 'POST' },
  grantType: 'authorization_code',
  authUrl: 'https://api.moves-app.com/oauth/v1/authorize' +
    '?scope=activity' +
    '&response_type=code'
};
