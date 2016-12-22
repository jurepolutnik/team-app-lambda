'use strict';

var Promise = require('promise');

var config = require('./config.js');
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');


var aws = require('aws-sdk');
var ses = new aws.SES();
var firebase = require('firebase');

var fs = require('fs')
var mark = require('markup-js');
var moment = require('moment');

var templates = {};

exports.handle = function (e, ctx, cb) {
    initialize(ctx).then(function () {
        var ref = firebase.database().ref('/teams');
        ref.once('value').then(function (snapshot) {
            var teams = snapshot.val();
            processTeams(teams).finally(_ => ctx.succeed());
        });
    });
}

function initialize(ctx) {
    initializeCustomPipes();
    ctx.callbackWaitsForEmptyEventLoop = false;  //<---Important
    firebase.initializeApp(config.firebase)

    return readTemplates();
}

function initializeCustomPipes() {
    mark.pipes.date = function (date) {
        // TODO: correctly handle GMT+0
        return moment(date).format('MMMM Do YYYY');
    };

    mark.pipes.time = function (date) {
        return moment(date).add(1, 'hour').format('h:mm a');
    };
}

function readTemplates() {
    return Promise.all(['base', 'participation', 'reminder', 'diff'].map(readTemplate))
}

function readTemplate(name) {
    return new Promise(function (fulfill, reject) {
        console.log('Reading template: ' + name);
        fs.readFile('./templates/' + name + '.html', 'utf8', function (err, data) {
            if (err) {
                console.log(err);
                reject();
            } else {
                templates[name] = data;
                fulfill();
            }
        });
    });
}

function processTeams(teams) {
    console.log('Teams : ' + teams);
    console.log(teams.fuzbal);
    var promises = Object.keys(teams).map(function ($key) {
        var team = teams[$key];;
        console.log('Team: ' + team.name);
        team.$key = $key;
        return processTeam(team);
    });

    return Promise.all(promises)
}

function processTeam(team) {
    console.log('Process team: ' + team.name);
    var ref = firebase.database().ref('/events/' + team.event);
    return ref.once('value').then(function (snapshot) {
        var event = snapshot.val();
        return sendEventEmails(team, event)
    });
}

function sendEventEmails(team, event) {
    var now = new Date();
    var eventDate = new Date(event.date);

    var hoursDiff = Math.ceil((eventDate - now) / 36e5);
    console.log('Event: ' + eventDate);
    console.log('Now: ' + now);
    console.log('Hours diff: ' + hoursDiff);

    if (hoursDiff === 36) {
        return sendEventReminder(team, event);
    }

    if (hoursDiff === 6) {
        return sendEventParticipation(team, event);
    }

    if (hoursDiff === 4) {
        var from = new Date(event.date - 6*36e5);
        return sendEventParticipationDiff(team, event, from);
    }

    if (hoursDiff === 1) {
        var from = new Date(event.date - 4*36e5);
        return sendEventParticipationDiff(team, event, from);
    }

    return Promise.resolve();
}

function sendEventReminder(team, event) {
    console.log('Send event reminter.');
    var subject = `[${team.name}] Reminder`;
    var preheader = moment(event.date).add(1, 'hour').format('MMMM Do YYYY [at] h:mm a | ');
    var main = mark.up(templates['reminder'], { team: team, event: event });
    var html = mark.up(templates['base'], { main: main, preheader: preheader });

    return sendEmail(team, subject, html);
}

function sendEventParticipation(team, event) {
    console.log('Send event paticipation.');
    console.log(event);
    event.participants = Object.keys(event.members || [])
        .map(key => event.members[key])
        .filter(member=>!member.deleted)
        .filter(member=>!member.removed)
        .map(member => member.name);

    var subject = `[${team.name}] Participants`;
    var preheader = `Participants (${event.participants.length}) | `;
    var main = mark.up(templates['participation'], { team: team, event: event });
    var html = mark.up(templates['base'], { main: main, preheader: preheader });

    return sendEmail(team, subject, html);
}

function sendEventParticipationDiff(team, event, from) {
    // TODO: refactor !!
    console.log('Send event paticipation diff.');
    console.log(event);

    event.added = 0;
    event.removed = 0;
    event.active = 0;
    event.participants = Object.keys(event.members || []).map(key => event.members[key]).map(member => {
        var created = new Date(member.created);
        var removed = new Date(member.removed);

        if (member.removed) {
            if (from > created && from < removed) {
                event.removed++;
                return '<span style="color:red;">-</span>' + member.name;
            }
            return null;
        } else {
            event.active++;
            if (from < created) {
                event.added++;
                return '<span style="color:green;">+</span>' + member.name;
            }
            return member.name; 
        }
     }).filter (name => !!name);

     if (!event.added && !event.removed) return Promise.resolve(); // no updates

    var subject = `[${team.name}] Participation update`;
    var preheader = `Diff (${event.active} +${event.added} -${event.removed}) | `;
    var main = mark.up(templates['diff'], { team: team, event: event });
    var html = mark.up(templates['base'], { main: main, preheader: preheader });

    return sendEmail(team, subject, html);
}


function sendEmail(team, subject, html) {
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
                Html: {
                    Data: html,
                    Charset: 'UTF-8'
                }
            }
        },
        Source: `${team.name} <${config.email.source}>`,
        ReplyToAddresses: [
            team.email
        ]
    };

    console.log(params.Source)

    // console.log(params);
    // console.log(params.Message.Body.Html.Data);

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