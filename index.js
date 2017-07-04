var forever = require('forever-monitor');
var log4js  = require('log4js');

const TAG   = "Flamebase Database";
var logger  = log4js.getLogger(TAG);

function FlamebaseDatabaseCluster(database, port) {

    this.initCluster = function (callback) {
        var child = forever.start("/" + __dirname + '/server.js', {
            silent: false,
            uid: "flamebase-database",
            pidFile: "./flamebase-database.pid",
            max: 10,
            killTree: true,

            minUptime: 2000,
            spinSleepTime: 1000,

            sourceDir: "./",

            args:    ['DATABASE_NAME=' + database, 'DATABASE_PORT=' + port],

            watch: false,
            watchIgnoreDotFiles: null,
            watchIgnorePatterns: null,
            watchDirectory: null,


            logFile: "./logs/logFile.log",
            outFile: "./logs/outFile.log",
            errFile: "./logs/errFile.log"
        });

        child.on('start', function(code) {
            callback.start();
        });
    }

}

module.exports = FlamebaseDatabaseCluster;