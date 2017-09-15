let prev = 0;
let printLabels = false;
let start = 0;
const tasks = {};


/**
 * @param {number} time
 * @param {string=} opt_label
 */
const printLabel = (time, opt_label) => {
  if (printLabels) {
    console.log(`${time} ms.` + (opt_label ? ` ${opt_label}` : ''));
  }
};

/**
 * @param {number} time
 * @param {string} name
 * @param {string=} opt_label
 */
const printTaskLabel = (time, name, opt_label) =>
    printLabel(time, name + (opt_label ? `. ${opt_label}` : ''));

/**
 * @param {boolean} print
 * @param {string=} opt_label
 */
exports.start = (print, opt_label) => {
  printLabels = print;
  start = Date.now();
  prev = start;

  if (opt_label && printLabels) {
    console.log(opt_label);
  }
};

/**
 * @param {string=} opt_label
 */
exports.tick = opt_label => {
  nowTime = Date.now();
  printLabel(nowTime - prev, opt_label);
  prev = nowTime;
};

/**
 * @param {string=} opt_label
 */
exports.total = opt_label => printLabel(Date.now() - start, opt_label);

/**
 * @param {string} name
 * @param {number} time
 */
exports.task = (name, time) => {
  if (!taks[name]) {
    tasks[name] = 0;
  }

  tasks[name] += time;
};

/**
 * @param {string} name
 * @param {string=} opt_label
 */
exports.taskTotal = (name, opt_label) => {
  if (tasks[name]) {
    printTaskLabel(Date.now() - tasks[name], name, opt_label);
    delete tasks[name];
  }
};
