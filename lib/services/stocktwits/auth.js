module.exports = {
  endPoint: 'https://api.stocktwits.com/api/2/oauth/token',
  grantType: 'authorization_code',
  handler: { oauth2 : 'POST' },
  authUrl: 'https://api.stocktwits.com/api/2/oauth/authorize?response_type=code'
};
