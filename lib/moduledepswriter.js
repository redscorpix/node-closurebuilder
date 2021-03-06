const Cache = require('./cache');
const ModuleParser = require('./moduleparser');
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const utils = require('./utils');


class ModuleDepsWriter {

  /**
   * @param {Object|string} config JSON or path to file.
   * @param {Array<string>} jsFiles Files or directories.
   * @param {string=} opt_cacheFile
   */
  constructor(config, jsFiles, opt_cacheFile) {

    /** @private {Cache} */
    this._cache = opt_cacheFile ? new Cache(opt_cacheFile) : null;

    /** @private {string|!Object} */
    this._config = config;

    /** @type {Object<string,boolean|number|string>} */
    this.definesMap = null;

    /** @type {boolean} */
    this.loadAsync = false;

    /** @type {boolean} */
    this.logPrint = true;

    /** @type {?string} */
    this.moduleInfoFilePath = null;

    /** @private {ModuleParser} */
    this._parser = new ModuleParser(config, jsFiles, this._cache);
  }

  /**
   * @param {Object|string} config JSON or path to file.
   * @param {Array<string>} jsFiles Files or directories.
   * @param {Object=} opt_options Fields:
   *    cacheFile (string) — path to cache file.
   *    defines (Object<string,boolean|number|string>) — defines.
   *    logPrint (boolean) — print log in console. Defaults to true.
   *    loadAsync (boolean) — load sources asynchronously.
   *    moduleInfoFilePath (string) — path to module info file.
   * @param {function(Error)=} opt_callback First argument is error or null.
   */
  static build(config, jsFiles, opt_options, opt_callback) {
    let options;
    let callback;

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

    ModuleDepsWriter.buildPromise(config, jsFiles, options).
        then(() => callback(null), callback);
  }

  /**
   * @param {Object|string} config JSON or path to file.
   * @param {Array<string>} jsFiles Files or directories.
   * @param {Object=} opt_options Fields:
   *    cacheFile (string) — path to cache file.
   *    defines (Object<string,boolean|number|string>) — defines.
   *    logPrint (boolean) — print log in console. Defaults to true.
   *    loadAsync (boolean) — load sources asynchronously.
   *    moduleInfoFilePath (string) — path to module info file.
   * @return {!Promise}
   */
  static buildPromise(config, jsFiles, opt_options) {
    const cacheFile = opt_options && opt_options.cacheFile ?
        opt_options.cacheFile : '';
    const builder = new ModuleDepsWriter(config, jsFiles, cacheFile);

    if (opt_options) {
      if (undefined !== opt_options.logPrint) {
        builder.logPrint = !!opt_options.logPrint;
      }

      builder.loadAsync = !!opt_options.loadAsync;
      builder.definesMap = opt_options.defines || null;

      if (opt_options.moduleInfoFilePath) {
        builder.moduleInfoFilePath = opt_options.moduleInfoFilePath;
      }
    }

    return builder.buildPromise();
  }

  /** @return {Cache} */
  getCache() {
    return this._cache;
  }

  /**
   * @param {JsModule} module
   * @return {!Promise}
   * @private
   */
  _createDepFiles(module) {
    let content;

    try {
      content = this._getDepFileContent(module);
    } catch (e) {
      return Promise.reject(e);
    }

    const filename = this._parser.outputPathPrefix + module.name + '.js';

    return utils.writeFile(content, filename).
        then(() => Promise.all(module.getSubModules().map(subModule =>
            this._createDepFiles(subModule))));
  }

  /**
   * @param {JsModule} module
   * @return {string}
   * @private
   */
  _getDepFileContent(module) {
    const jsonDefines = JSON.stringify(this.definesMap || {});
    const jsonModuleInfo = JSON.stringify(this._parser.getJsonModuleInfo());
    const jsonModuleUris = JSON.stringify(this._parser.getJsonModuleUris());
    const webUriPrefix = path.dirname(
        this._parser.productionUri + module.name + '.js');
    const depFilename = path.dirname(path.resolve(
        this._parser.outputPathPrefix + module.name + '.js'));
    const files = JSON.stringify(module.getDeps().map(source =>
        webUriPrefix + '/' + path.relative(depFilename, source.path)));
    const wrapper = module.wrapper ?
        'string' == typeof module.wrapper ?
            module.wrapper : module.wrapper(this, module) :
        this._getDepFileContentInternal(module);

    return wrapper.
        replace(/%defines%/g, jsonDefines).
        replace(/%moduleInfo%/g, jsonModuleInfo).
        replace(/%moduleUris%/g, jsonModuleUris).
        replace(/%name%/g, module.name).
        replace(/%productionUri%/g, this._parser.productionUri).
        replace(/%files%/g, files);
  }

  /**
   * @param {!JsModule} module
   * @return {string}
   * @private
   */
  _getDepFileContentInternal(module) {
    const webUriPrefix = path.dirname(
        this._parser.productionUri + module.name + '.js');
    const depFilename = path.dirname(path.resolve(
        this._parser.outputPathPrefix + module.name + '.js'));
    const depsArr = JSON.stringify(module.getDeps().map(source => [
      webUriPrefix + '/' + path.relative(depFilename, source.path),
      source.isModule,
    ]));
    const templateFile = __dirname + (this.moduleInfoFilePath ?
        '/templates/module.ejs' : '/templates/module_with_info.ejs');
    const template = fs.readFileSync(templateFile, {
      encoding: 'utf8',
    })

    return ejs.render(template, {
      depsArr,
      hasParent: !!module.getParent(),
      loadAsync: this.loadAsync,
    }, null);
  }

  /** @return {ModuleParser} */
  getParser() {
    return this._parser;
  }

  /**
   * @param {function(Error)=} opt_callback First argument is error or null.
   */
  build(opt_callback) {
    const callback = opt_callback || function() {};
    this.buildPromise().then(() => callback(null), callback);
  }

  /** @return {!Promise} */
  buildPromise() {
    return this._generateModuleInfoFile().
        then(() => this._parser.parse()).
        then(rootModule => {
          if (this._cache) {
            this._cache.save().then(null, err => console.error(err));
          }

          return this._createDepFiles(rootModule);
        });
  }

  /**
   * @return {!Promise}
   * @private
   */
  _generateModuleInfoFile() {
    return this.moduleInfoFilePath ?
        generateModuleInfoFile(this.moduleInfoFilePath, this._config) :
        Promise.resolve();
  }
}
module.exports = ModuleDepsWriter;


/**
 * @param {string} filePath
 * @param {string|!Object} config
 * @return {!Promise}
 */
const generateModuleInfoFile = (filePath, config) => {
  return ModuleParser.getModuleInfoByConfig(config).then(({info, uris}) => {
    let trustedUrisContent = '{\n';

    for (const key in uris) {
      trustedUrisContent +=
          "    '" + key + "': TrustedResourceUrl.fromConstant(Const.from('" +
          uris[key] + "')),\n";
    }

    trustedUrisContent += '  }';

    let infoContent = '{\n';

    for (const key in uris) {
      infoContent +=
          "    '" + key + "': [" +
          info[key].map(name => `'${name}'`).join(', ') + "],\n";
    }

    infoContent += '  }';

    const content = `goog.module('moduleInfo');

const Const = goog.require('goog.string.Const');
const TrustedResourceUrl = goog.require('goog.html.TrustedResourceUrl');

exports = {
  moduleInfo: ${infoContent},
  trustedUris: ${trustedUrisContent},
};`;

    return utils.writeFile(content, filePath);
  });
};
