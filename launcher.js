var FlamebaseDatabaseCluster = require('./index.js');

var FSC = new FlamebaseDatabaseCluster("draco", 1507);
FSC.initCluster({
    start: function () {
        console.log("start!!")
    }
}, null);

