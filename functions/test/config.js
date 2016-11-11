"use strict";

var config = {};

config.firebase = {
    authDomain: 'fuzbal-d3001.firebaseapp.com',
    apiKey: 'AIzaSyDwvYrDYOD0DFRa_7pmWbkMQohglaAyIkw',
    databaseURL: 'https://fuzbal-d3001.firebaseio.com',
    storageBucket: 'fuzbal-d3001.appspot.com',
}

config.mail = {
    "templateBucket" : "my-bucket",
    "templateKey" : "templates/template.html",
    "fromAddress": "Fuzbal <jure.polutnik@gmail.com>",
    "defaultSubject" : "Email From {{name}}",
}

module.exports = config