var nodemailer = require("nodemailer");

module.exports = {
  messages_fields:["email_to", "html_body"],
  messages:function(data, cbDone) {
    if (!data.email_to || !data.body) {
      return cbDone(new Error("Sending a Gmail message requires a to and body"));
    }
    var emailAddress = decodeURIComponent(data.auth.pid.split("@")[0]);
    var smtp = nodemailer.createTransport("SMTP", {
      service:"Gmail",
      auth: {
        XOAuth2: {
          user: emailAddress,
          clientId: data.auth.clientID,
          clientSecret: data.auth.clientSecret,
          accessToken: data.auth.token.access_token,
          refreshToken: data.auth.token.refresh_token,
          timeout: 3600
        }
      }
    });
    var mail = {
      from:emailAddress,
      to:data.email_to,
      subject:data.title,
      text:data.body
    };
    if (data.html_body) mail.html = data.html_body;
    smtp.sendMail(mail, function(error, response) {
      cbDone(error, (response && response.message));
      smtp.close();
    });
  }
};
