'use strict';

var Promise = require('promise');

var config = require('./config.js');

var aws = require('aws-sdk');
var ses = new aws.SES();
var firebase = require('firebase');

firebase.initializeApp(config.firebase)


exports.handle = function (e, ctx, cb) {
    ctx.callbackWaitsForEmptyEventLoop = false;  //<---Important
    var ref = firebase.database().ref('/teams');
    ref.once('value').then(function (snapshot) {
        var teams = snapshot.val();
        processTeams(teams).finally(_ => ctx.succeed());
    });
}

function processTeams (teams) {
    console.log('Teams : ' + teams);
    console.log(teams.fuzbal);
    var promises = Object.keys(teams).map(function (key) {
        var team = teams[key];
        return processTeam(team);
    });

    return Promise.all(promises)
}

function processTeam (team) {
    var ref = firebase.database().ref('/events/'+team.event);
    return ref.once('value').then(function (snapshot) {
        var event = snapshot.val();
        return sendEventEmails(team, event)
    });
}

function sendEventEmails (team, event) {
    var now = new Date();
    var eventDate = new Date(event.date);

    var hoursDiff = Math.floor((eventDate - now) / 36e5);

    if (hoursDiff === 18) {
        return sendEventPaticipation(team, event);
    }

    if (hoursDiff === 6) {
        return sendEventReminder(team, event);
    }

    return Promise.resolve();
}

function sendEventReminder (team, event) {
    var subject = team.name + ' reminder';
    var body = `Ale, \n\ngremo se prijavit na http://fuzbal.xlab.si`;
    return sendEmail(team, subject, body);
}

function sendEventPaticipation (team, event) {
    var members = Object.keys(event.members).map (key => event.members[key].name);

    var subject = team.name;
    var body = `Prijavljeni (${members.length}): \n - ${members.join('\n - ')} \n\nhttp://fuzbal.xlab.si`;
    return sendEmail(team, subject, body);
}


function sendEmail(team, subject, body) {
    var params = {
        Destination: {
            ToAddresses: [
                team.email
            ]
        },
        Message: {
            Subject: {
                Data: subject,
                Charset: 'UTF-8'
            },
            Body: {
                Text: {
                    Data: body,
                    Charset: 'UTF-8'
                }
            }
        },
        Source: team.email,
        ReplyToAddresses: [
            team.email
        ]
    };

    console.log(params);
    console.log(params.Message.Body.Text.Data);

    return new Promise(function (fulfill, reject) {
        console.log('sending');
        ses.sendEmail(params, function (err, data) {
            if (err) {
                console.log(err, err.stack);
                reject();
            } else {
                console.log(data);
                fulfill();
            }
        });
    });
}