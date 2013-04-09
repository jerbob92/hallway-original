exports.sync = require('./lib').genericSync(function(pi){
    return "people/~:(id,first-name,last-name,email-address,headline,location:(name,country:(code)),industry,current-share,num-connections,summary,specialties,proposal-comments,associations,honors,interests,positions,publications,patents,languages,skills,certifications,educations,num-recommenders,recommendations-received,phone-numbers,im-accounts,twitter-accounts,date-of-birth,main-address,member-url-resources,picture-url,site-standard-profile-request:(url),api-standard-profile-request:(url),site-public-profile-request:(url),api-public-profile-request:(url),public-profile-url)?format=json";
},function(pi, js, cb){
    //make a copy because we are going to delete fields for the Profiles table
    pi.auth.profile = JSON.parse(JSON.stringify(js)); // stash

    // drop these as they are often very long can will overrun the mysql column
    delete pi.auth.profile.positions;
    delete pi.auth.profile.recommendationsReceived;

    pi.auth.pid = js.id+'@linkedin'; // profile id
    var base = 'profile:'+pi.auth.pid+'/self';
    var data = {};
    data[base] = [js];
    cb(null, {auth:pi.auth, data:data});
});
