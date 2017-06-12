var FlamebaseDatabase =     require("flamebase-database-node");
var log4js =                require('log4js');

var TAG =                   "PATH CLUSTER";
var logger =                log4js.getLogger(TAG);

function Path(databasePath, database, path) {

    // object reference
    var object = this;

    this.path = path;
    this.database = database;
    this.databasePath = databasePath;
    this.FD = new FlamebaseDatabase(this.database, this.path);

    this.FD.syncFromDatabase();

    logger.debug("created reference listener for " + this.database + " - " + this.path + ": " + JSON.stringify(this.FD.ref));


    var config = {};

    /**
     * server API key for firebase cloud messaging
     */
    config.APIKey = function() {
        return "AIzaSyDhzzf2kkKuknAdiB_ak-KJ0a3XgaBDO4A";
    };

    /**
     * all device objects must have token and os info in order
     * to slice big JSON changes for android or ios push notifications
     */
    config.devices = function() {
        var devices = [];
        var keys = Object.keys(object.databasePath.tokens);
        for (var i = 0; i < keys.length; i++) {
            var devic = object.databasePath.tokens[keys[i]];

            var device = {};
            device.token = keys[i];
            device.os = devic.os;

            devices.push(device);
        }
        return devices;
    };

    /**
     * tag that informs android/ios client which action is being called
     */
    config.tag = function() {
        return path + "_sync"; // groupA_sync
    };

    /**
     * custom id for client database (used as primary key)
     */
    config.referenceId = function() {
        return object.path;
    };

    /**
     * custom notification to send when database reference changes.
     * return null if not needed
     */
    config.notification = function() {
        return null;
    };

    this.FD.setSyncConfig(config);

    this.start = function () {

    }

}

module.exports = Path;