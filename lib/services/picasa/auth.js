module.exports = {
  endPoint: 'https://accounts.google.com/o/oauth2/token',
  grantType: 'authorization_code',
  handler: { oauth2: 'POST' },
  strict: true,
  authUrl: 'https://accounts.google.com/o/oauth2/auth' +
    '?response_type=code' +
    '&scope=' + encodeURIComponent('http://picasaweb.google.com/data/') +
    '&access_type=offline' +
    '&approval_prompt=force'
};
