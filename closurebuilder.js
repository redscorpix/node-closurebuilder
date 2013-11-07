var builder = require('./lib/builder');
var depsWriter = require('./lib/depswriter');
var moduleBuilder = require('./lib/modulebuilder');
var moduleDepsWriter = require('./lib/moduledepswriter');
var requireChecker = require('./lib/requirechecker');

module.exports = {
  builder: builder,
  depsWriter: depsWriter,
  moduleBuilder: moduleBuilder,
  moduleDepsWriter: moduleDepsWriter,
  requireChecker: requireChecker
};
