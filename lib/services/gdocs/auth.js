module.exports = {
    endPoint : "https://accounts.google.com/o/oauth2/token",
    grantType : "authorization_code",
    handler : {oauth2 : 'POST'},
    strict: true,
    authUrl : "https://accounts.google.com/o/oauth2/auth?scope="+encodeURIComponent("https://docs.google.com/feeds/ https://docs.googleusercontent.com/")+"&response_type=code&access_type=offline&approval_prompt=force"
}