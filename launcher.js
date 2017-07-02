var FlamebaseDatabaseCluster = require('./index.js');

var FDC = new FlamebaseDatabaseCluster("draco", 1507);
FDC.initCluster({
    start: function () {
        console.log("start!!")
    }
}, null);

