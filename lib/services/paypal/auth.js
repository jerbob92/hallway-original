var DEFAULT_SCOPE = 'https://identity.x.com/xidentity/resources/profile/me';

module.exports = {
  endPoint : 'https://identity.x.com/xidentity/oauthtokenservice',
  grantType : "authorization_code",
  handler : {oauth2 : 'POST'},
  strict: true,
  authUrl : 'https://identity.x.com/xidentity/resources/authorize' +
            '?scope=' + encodeURIComponent(DEFAULT_SCOPE) +
            '&response_type=code'
};
