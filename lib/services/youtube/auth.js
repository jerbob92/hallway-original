module.exports = {
  endPoint: 'https://accounts.google.com/o/oauth2/token',
  grantType: 'authorization_code',
  handler: { oauth2: 'POST' },
  strict: true,
  authUrl: 'https://accounts.google.com/o/oauth2/auth' +
    '?response_type=code' +
    '&access_type=offline' +
    '&approval_prompt=force' +
    '&scope=' + encodeURIComponent('http://gdata.youtube.com')
};
