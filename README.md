# Singly Hallway - Empowering Personal Data Applications

This is an open source project to help developers build amazing applications
combining data from many sources easily, through one API. This codebase is
currently live and powering [api.singly.com](https://api.singly.com/) so sign in
and start building!

[Background Video](http://www.youtube.com/watch?v=pTNO5npNq28)

Follow [@singly](http://twitter.com/singly) and come hang out with us in
[HipChat](http://chat.singly.com/).

We also have a [mailing list](https://groups.google.com/group/singlyapi), join
and say hello!

Let's get started.

## Install NodeJS, NPM, and Dependencies

### Linux
If you are using Ubuntu/Mint use the following commands

    sudo apt-get install python-software-properties
    sudo add-apt-repository ppa:chris-lea/node.js
    sudo apt-get update
    sudo apt-get install nodejs nodejs-dev npm libv8-dev libmysqlclient libxml2-dev libxml2-doc mysql-server redis-doc, redis-server

This will install the latest version of nodejs, the node package manager, the mysql 
server, the redis server, and necessary utility libraries.  Hallway requires a mysql 
server and a Redis server to run.  In this setup we will run through how to setup 
these services to run locally

### Mac
If you are using Mac use the following commands:


## Get and Build Hallway

Once NodeJS and NPM are installed, clone the hallway source code from github using the 
following command:

    git clone https://github.com/Singly/hallway.git

Now move into the hallway directory and install the Express webapp framework.

    cd hallway
    npm install

Hallway is a nodejs/express application.  Using the install command, npm will install 
all node package dependencies for the hallway application as defined in the 
package.json file in the root directory of the webapp.

You can now run the following command to ensure node has installed all packages 
correctly:

    make test

This should return without errors.

## Database Setup

You should have setup mysql server in the initial install or you should already have a 
mysql server running.  Use the following command to create the Hallway database and tables.

    mysqladmin create hallway_development
    mysql -u <admin_username> -p <admin_password> hallway_development < create_tables.sql

The create_tables.sql script is in the Hallway root directory.  The database name, 
hallway_development, must match with the configuration we will do later.  You can change 
the name if desired as long as it matches.  Once the tables and database are created you 
can verify they exist by logging in and doing a show tables.

    mysql -u <admin_username> -p <admin_password> hallway_development
    show tables

You should see all the hallway tables.

## Redis Setup

Redis should have been setup during the initial install.  You can verify that it is 
everything is setup and working by running the following commands:

    redis-cl
    info

If everything is up and running you should see an info output.

## Hallway Configuration

Now we need to configure hallway.  Change to the Config directory in hallway and copy 
over the apikeys and config files from their examples.

    cd Config
    cp apikeys.json.example apikeys.json
    cp config.json.example config.json

### The config.json File

The first section is the mysql server setup.  Notice the database name here needs to 
match the database you setup previously.  Also as strange as it may seem it does need 
both user and username for migrations.

    {
     "database": {
        "driver": "mysql",
        "hostname":"localhost",
        "username":"<your database user>",
        "user":"<your database user>",
        "password":"<your database password>",
        "database":"hallway_development"
      },
    }

If running dawg you will need the following sections:

    "dawg": {
        "password": "PASSWORD",
        "port": 8050
    },
    "ec2" : {
        "accessKeyId":"VALUE",
        "secretKey":"VALUE"
    },

If running taskman you will need to setup a taskman section and your S3 key and bucket 
for storage.  This will be changing in the near future where Hallway data can be stored 
locally.  Notice taskman also uses the local redis server.  If using a remote server 
those settings can be changed here.

    "taskman": {
        "numWorkers": 10,
        "redis": {
            "host": "localhost",
            "port": 6379
        }
    },
    "s3" : {
        "key":"VALUE",
        "secret":"VALUE",
        "bucket":"VALUE"
    },

You can change the ip address, port, and context path that Hallway runs on using the 
lockerHost, lockerPort, externalHost, and externalPort settings.

    "lockerListenIP": "0.0.0.0",
    "lockerHost": "<your local ip address>",
    "lockerPort": 8042,
    "externalHost": "<your local ip address>",
    "externalPath": "<your context path>",
    "externalPort": 8042

You can find other options to set in the defaults.json file.

### The apikeys.json File

For each service you want to use with Hallway you will need to register an app with 
that service, get your client id and client secret, and paste them into the apikeys.json 
file.  A full example of how to get keys per service can be
[found here](https://github.com/LockerProject/Locker/wiki/GettingAPIKeys).

{
    "twitter":{
        "appKey":"PASTE_HERE",
        "appSecret":"PASTE_HERE"
    },
    "foursquare" : {
        "appKey" : "PASTE_HERE",
        "appSecret" : "PASTE_HERE"
    },
    "github" : {
        "appKey" : "PASTE_HERE",
        "appSecret" : "PASTE_HERE"
    },
    "facebook" : {
        "appKey" : "PASTE_HERE",
        "appSecret" : "PASTE_HERE"
    },
    ...
}

One peculiarity to note.  When setting up services the callback urls must point back to 
your local hallway. For example, when running hallway locally the callback url would be 
something like http://localhost:8042/auth/<service name>/auth.

## Hallway Startup

When everything is configured you can run the following command to startup Hallway.

./hallway

If everything works fine you should see logging output and then:

    [10/24/2012 11:44:34][][hallwayd] - Starting an API host
    [10/24/2012 11:44:34][][hallwayd] - Hallway is now listening at http://192.168.1.154:8042
    [10/24/2012 11:44:34][][hallwayd] - Hallway is up and running.

You should now be able to use Hallway.

## Using Hallway

To use hallway you will need to setup a test app in the database and then clone down 
and use an example app.  To setup a test app in the database run the following commands 
and sql.

    mysql -u <admin_username> -p <admin_password> hallway_development
    insert into Apps (app, secret) values ('a_new_app_id', 'a_new_app_secret');

You can give whatever values you like for the app and secret fields.  They become your 
client id and client secret for your example app.

You can then follow the instructions for one of the example apps on the 
http://singly.com/docs site "Getting Started" section.  Here is the 
[NodeJS Example](https://singly.com/docs/getting_started_node).