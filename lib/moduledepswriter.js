var async = require('async');
var inherits = require('util').inherits;
var path = require('path');

var ModuleParser = require('./moduleparser').ModuleParser;
var utils = require('./utils');


/**
 * @param {Object|string} config JSON or path to file.
 * @param {Array.<string>} jsFiles Files or directories.
 * @constructor
 */
var ModuleDepsWriter = exports.ModuleDepsWriter = function(config, jsFiles) {
  /** @private {ModuleParser} */
  this._parser = new ModuleParser(config, jsFiles);
};


/**
 * @const {string}
 */
ModuleDepsWriter.DEP_TEMPLATE =
  '(function() {\n' +
  '  var files = %files%;\n' +
  '  var headElement = document.getElementsByTagName(\'head\')[0];\n' +
  '  if (headElement) {\n' +
  '    var load = function(index) {\n' +
  '      if (files[index]) {\n' +
  '        var scriptElement = document.createElement(\'script\');\n' +
  '        scriptElement.onload = function() {\n' +
  '          load(index + 1);\n' +
  '        };\n' +
  '        scriptElement.src = files[index];\n' +
  '        headElement.appendChild(scriptElement);\n' +
  '      }\n' +
  '    };\n' +
  '    load(0);\n' +
  '  }\n' +
  '})();\n';

/**
 * @const {string}
 */
ModuleDepsWriter.ROOT_DEP_TEMPLATE =
  'CLOSURE_NO_DEPS = true;\n' +
  'MODULE_USE_DEBUG_MODE=true;\n' +
  'MODULE_INFO=%moduleInfo%;\n' +
  'MODULE_URIS=%moduleUris%;\n' +
  '(function() {\n' +
  '  var files = %files%;\n' +
  '  var s = [\'<script type="text/javascript" src="\', \'"><\\x2fscript>\'];\n' +
  '  var html = files.join(s[1] + s[0]);\n' +
  '  if (html) {\n' +
  '    document.write(s[0] + html + s[1]);\n' +
  '  }\n' +
  '})();\n';


/**
 * @param {ModuleDepsWriter} writer
 * @param {JsModule} module
 * @return {string}
 */
ModuleDepsWriter.getDepFileTemplate = function(writer, module) {
  return module.getParent() ? ModuleDepsWriter.DEP_TEMPLATE :
    ModuleDepsWriter.ROOT_DEP_TEMPLATE;
};


/**
 * @private {boolean}
 */
ModuleDepsWriter.prototype._logPrint = true;


/**
 * @return {boolean}
 */
ModuleDepsWriter.prototype.isLogPrint = function() {
  return this._logPrint;
};

/**
 * @param {boolean} enable
 */
ModuleDepsWriter.prototype.setLogPrint = function(enable) {
  this._logPrint = enable;
};

/**
 * @param {JsModule} module
 * @param {function(Error)} callback
 * @private
 */
ModuleDepsWriter.prototype._createDepFiles = function(module, callback) {
  var writeFile = function(err) {
    if (err) {
      callback(err);
    } else {
      var iterateSubModules = function(subModule, callback) {
        this._createDepFiles(subModule);
      };
      async.eachSeries(
        module.getSubModules(), iterateSubModules.bind(this), callback);
    }
  };

  /** @type {string} */
  var content = this._getDepFileContent(module);
  var filename = this._parser.outputPathPrefix + module.name + '.js';
  utils.writeFile(content, filename, writeFile.bind(this));
};

/**
 * @param {JsModule} module
 * @return {string}
 * @private
 */
ModuleDepsWriter.prototype._getDepFileContent = function(module) {
  var jsonModuleInfo = JSON.stringify(this._parser.getJsonModuleInfo());
  var jsonModuleUris = JSON.stringify(this._parser.getJsonModuleUris());
  var webUriPrefix = path.dirname(
    this._parser.productionUri + module.name + '.js');
  var depFilename = path.dirname(path.resolve(
    this._parser.outputPathPrefix + module.name + '.js'));
  var files = JSON.stringify(module.getDeps().map(function(source) {
    return webUriPrefix + '/' + path.relative(depFilename, source.getPath());
  }));
  var wrapper = module.getWrapper();

  if (!wrapper) {
    wrapper = ModuleDepsWriter.getDepFileTemplate(this, module);
  } else if ('function' == typeof wrapper) {
    wrapper = wrapper(this, module);
  }

  var value = wrapper.
    replace(/%moduleInfo%/g, jsonModuleInfo).
    replace(/%moduleUris%/g, jsonModuleUris).
    replace(/%name%/g, module.name).
    replace(/%productionUri%/g, this._parser.productionUri).
    replace(/%files%/g, files);

  return value;
};

/**
 * @return {ModuleParser}
 */
ModuleDepsWriter.prototype.getParser = function() {
  return this._parser;
};

/**
 * @param {function(Error)=} opt_callback First argument is error or null.
 */
ModuleDepsWriter.prototype.build = function(opt_callback) {
  var build = function(err, rootModule) {
    if (!err) {
      this._build(rootModule, opt_callback);
    } else if (opt_callback) {
      opt_callback(err);
    }
  };
  this._parser.parse(build.bind(this));
};

/**
 * @param {JsModule} rootModule
 * @param {function(Error)} callback
 * @private
 */
ModuleDepsWriter.prototype._build = function(rootModule, callback) {
  this._createDepFiles(rootModule, callback);
};


/**
 * @param {Object|string} config JSON or path to file.
 * @param {Array.<string>} jsFiles Files or directories.
 * @param {Object=} opt_options Fields:
 *    logPrint (boolean) — print log in console. Defaults to true.
 * @param {function(Error)=} opt_callback First argument is error or null.
 */
exports.build = function(config, jsFiles, opt_options, opt_callback) {
  var options;
  var callback;

  if ('function' == typeof opt_options) {
    callback = opt_options;
  } else {
    if ('object' == typeof opt_options) {
      options = opt_options;
    }

    if ('function' == typeof opt_callback) {
      callback = opt_callback;
    }
  }

  var builder = new ModuleDepsWriter(config, jsFiles);

  if (options) {
    if (undefined !== options.logPrint) {
      builder.setLogPrint(!!options.logPrint);
    }
  }

  builder.build(callback);
};
