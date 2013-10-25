var start = 0;
var prev = 0;
var tasks = {};
var printLabels = false;


/**
 * @return {number}
 */
var now = function() {
  return +(new Date());
};

/**
 * @param {number} time
 * @param {string=} opt_label
 */
var printLabel = function(time, opt_label) {
  var label = time + ' ms.';

  if (opt_label) {
    label += ' ' + opt_label;
  }

  if (printLabels) {
    console.log(label);
  }
};

/**
 * @param {number} time
 * @param {string} name
 * @param {string=} opt_label
 */
var printTaskLabel = function(time, name, opt_label) {
  var label = name;

  if (opt_label) {
    label += '. ' + opt_label;
  }

  printLabel(time, label);
};

/**
 * @param {boolean} print
 * @param {string=} opt_label
 */
exports.start = function(print, opt_label) {
  printLabels = print;
  start = now();
  prev = start;

  if (opt_label && printLabels) {
    console.log(opt_label);
  }
};

/**
 * @param {string=} opt_label
 */
exports.tick = function(opt_label) {
  nowTime = now();
  printLabel(nowTime - prev, opt_label);
  prev = nowTime;
};

/**
 * @param {string=} opt_label
 */
exports.total = function(opt_label) {
  printLabel(now() - start, opt_label);
};

/**
 * @param {string} name
 * @param {number} time
 */
exports.task = function(name, time) {
  if (!taks[name]) {
    tasks[name] = 0;
  }

  tasks[name] += time;
};

/**
 * @param {string} name
 * @param {string=} opt_label
 */
exports.taskTotal = function(name, opt_label) {
  if (tasks[name]) {
    printTaskLabel(now() - tasks[name], name, opt_label);
    delete tasks[name];
  }
};
