const JsModule = require('./jsmodule');
const fs = require('fs');
const path = require('path');
const utils = require('./utils');


class ModuleParser {

  /**
   * @param {string} compilerPath
   * @param {Object|string} config JSON or path to file.
   * @param {Array<string>} jsFiles Files or directories.
   * @param {Cache=} opt_cache
   */
  constructor(config, jsFiles, opt_cache) {
    let configFile = '';
    let configJson = null;

    if ('string' == typeof config) {
      configFile = config;
    } else if (config) {
      configJson = config;
    }

    /** @private {Cache} */
    this._cache = opt_cache || null;

    /** @private {Object} */
    this._config = configJson;

    /** @private {string} */
    this._configFile = configFile;

    /** @type {string} */
    this.globalScopeName = '';

    /** @type {Array<string>} */
    this.jsFiles = jsFiles;

    /** @type {string} */
    this.outputPathPrefix = '';

    /** @type {string} */
    this.productionUri = '';

    /** @type {string} */
    this.renamePrefixNamespace = 'z';

    /** @type {JsModule} */
    this.rootModule = null;
  }

  /**
   * @param {string|!Object} config
   * @return {!Promise<{info:!Object<string,!Array<string>>,
   *            uris:!Object<string,string>}>}
   */
  static getModuleInfoByConfig(config) {
    const promise = 'string' === typeof config ?
          readConfigFile(config) :
          Promise.resolve(config);

    return promise.then(config => {
      if (!config.modules) {
        throw Error('Wrong config file: empty list of modules');
      }

      if (!config.productionUri) {
        throw Error('Wrong config file: empty production URI');
      }

      /** @type {!Object<string,!Array<string>>} */
      const info = {};
      /** @type {!Object<string,string>} */
      const uris = {};

      for (const name in config.modules) {
        info[name] = config.modules[name].deps || [];
        uris[name] = config.productionUri + name + '.js';
      }

      return {info, uris};
    });
  }

  /**
   * @param {JsModule} module
   * @return {!Object<string,!Array<string>>}
   */
  static getJsonModuleInfo(module) {
    /** @type {JsModule} */
    const parent = module.getParent();
    const result = {
      [module.name]: parent ? [parent.name] : [],
    };

    module.getSubModules().forEach(subModule => {
      const subInfo = ModuleParser.getJsonModuleInfo(subModule);

      for (let key in subInfo) {
        result[key] = subInfo[key];
      }
    });

    return result;
  }

  /**
   * @param {JsModule} module
   * @param {string} webUriPrefix
   * @return {!Object<string,string>}
   */
  static getJsonModuleUris(module, webUriPrefix) {
    const result = {
      [module.name]: webUriPrefix + module.name + '.js',
    };

    module.getSubModules().forEach(subModule => {
      const subInfo = ModuleParser.getJsonModuleUris(subModule, webUriPrefix);

      for (let key in subInfo) {
        result[key] = subInfo[key];
      }
    });

    return result;
  }

  /**
   * @param {Object} configJson
   * @return {!Promise<!Object>}
   * @private
   */
  _getGlobalOptions(configJson) {
    const name = configJson.globalScopeName;
    const outputPathPrefix = configJson.outputPath;
    const productionUri = configJson.productionUri;
    const renamePrefixNamespace = configJson.renamePrefixNamespace;
    let errorMessage = '';

    if (name && 'string' != typeof name) {
      errorMessage = 'Wrong scope name.';
    } else if (!(outputPathPrefix && 'string' == typeof outputPathPrefix)) {
      errorMessage = 'Empty output path.';
    } else if (!(productionUri && 'string' == typeof productionUri)) {
      errorMessage = 'Empty production uri.';
    } else if (renamePrefixNamespace &&
        'string' != typeof renamePrefixNamespace) {
      errorMessage = "Wrong field 'renamePrefixNamespace'.";
    }

    if (errorMessage) {
      return Promise.reject(new Error(errorMessage));
    }

    this.outputPathPrefix = path.resolve(
        path.dirname(this._configFile), outputPathPrefix);
    this.productionUri = productionUri;

    if (name) {
      this.globalScopeName = name;
    }

    if (renamePrefixNamespace) {
      this.renamePrefixNamespace = renamePrefixNamespace;
    }

    return Promise.resolve(configJson);
  }

  /**
   * @param {Object<string,!ModuleParser.RawModule>} rawModules
   * @return {!Promise<!JsModule>}
   * @private
   */
  _getJsModules(rawModules) {
    let rootName = '';
    const childsMap = {};

    for (let name in rawModules) {
      if (rawModules[name].deps.length) {
        rawModules[name].deps.forEach(depName => {
          if (!childsMap[depName]) {
            childsMap[depName] = [];
          }

          childsMap[depName].push(name);
        });
      } else {
        if (rootName) {
          return Promise.reject(new Error('Only one root module should be.'));
        } else {
          rootName = name;
        }
      }
    }

    if (rootName) {
      let jsModule;

      try {
        const jsSources = utils.findSourcesByJsFiles(this.jsFiles, this._cache);
        jsModule = getJsModule(rootName, null, rawModules, childsMap,
            jsSources);
      } catch (e) {
        return Promise.reject(e);
      }

      return Promise.resolve(jsModule);
    }


    return Promise.reject(new Error('Root module not found.'));
  }

  /** @return {Object} */
  getJsonModuleInfo() {
    return this.rootModule ?
        ModuleParser.getJsonModuleInfo(this.rootModule) : null;
  }

  /** @return {Object} */
  getJsonModuleUris() {
    return this.rootModule ?
        ModuleParser.getJsonModuleUris(this.rootModule, this.productionUri) :
        null;
  }

  /**
   * @param {Object} json
   * @return {!Promise<!Object<string,!ModuleParser.RawModule>>}
   * @private
   */
  _getRawModules(json) {
    const jsonModules = json['modules'];

    if (!jsonModules) {
      return Promise.reject(new Error('Modules not found.'));
    }

    const rawModulesMap = {};

    for (let name in jsonModules) {
      if ('object' != typeof jsonModules[name]) {
        return Promise.reject(new Error("Module '" + name + "' has not info."));
      }

      const deps = jsonModules[name].deps ?
          'string' == typeof jsonModules[name].deps ?
              [jsonModules[name].deps] :
              [...jsonModules[name].deps] :
          [];
      const inputs = jsonModules[name].inputs ?
          'string' == typeof jsonModules[name].inputs ?
              [jsonModules[name].inputs] :
              [...jsonModules[name].inputs] :
          [];

      if (!inputs.length) {
        return Promise.reject(new Error(
            `Module '${name}' has not 'inputs' field.`));
      }

      const configDir = path.dirname(this._configFile);

      for (let i = 0; i < inputs; i++) {
        inputs[i] = path.resolve(configDir, inputs[i]);
      }

      rawModulesMap[name] = {
        deps: deps,
        inputs: inputs,
        wrapper: 'string' == typeof jsonModules[name].wrapper ?
            jsonModules[name].wrapper : '',
      };
    }

    return Promise.resolve(rawModulesMap);
  }

  /**
   * @param {JsModule} rootModule
   * @return {!Promise<!JsModule>}
   * @private
   */
  _buildRootModule(rootModule) {
    return rootModule.build().then(() => rootModule);
  }

  /** @return {!Promise<!JsModule>} */
  parse() {
    if (this.rootModule) {
      return Promise.resolve(this.rootModule);
    }

    if (this._config || this._configFile) {
      const promise = this._config ?
          Promise.resolve(this._config) :
          readConfigFile(this._configFile);

      return promise.
          then(configJson => this._getGlobalOptions(configJson)).
          then(json => this._getRawModules(json)).
          then(rawModules => this._getJsModules(rawModules)).
          then(rootModule => this._buildRootModule(rootModule)).
          then(rootModule => {
            this.rootModule = rootModule;

            return rootModule;
          });
    }

    return Promise.reject(new Error('Empty config.'));
  }
}
module.exports = ModuleParser;

/**
 * @typedef {{
 *  deps: !Array<string>,
 *  inputs: !Array<string>,
 *  wrapper: string,
 * }}
 */
ModuleParser.RawModule;


/**
 * @param {string} configFile
 * @return {!Promise<!Object>}
 */
const readConfigFile = configFile => {
  let configJson;

  try {
    const fileContent = fs.readFileSync(configFile, 'utf8');
    configJson = JSON.parse(fileContent);
  } catch (e) {
    return Promise.reject(e);
  }

  return 'object' == typeof configJson ?
      Promise.resolve(configJson) :
      Promise.reject(new Error('Wrong config file.'));
};

/**
 * @param {string} name Module id.
 * @param {JsModule?} parent
 * @param {Object<string,RawModule>} rawModules
 * @param {Object<string,Array<string>>} childsMap
 * @param {Array<!Source>} jsSources
 * @return {!JsModule}
 * @throw Error
 */
const getJsModule = (name, parent, rawModules, childsMap, jsSources) => {
  /** @type {RawModule} */
  const rawModule = rawModules[name];
  const inputSources = utils.findSourcesByJsFiles(
      rawModule.inputs, this._cache);

  const jsModule = new JsModule(name, parent, jsSources, inputSources);
  jsModule.wrapper = rawModule.wrapper || null;

  if (childsMap[name]) {
    jsModule.addSubModules(childsMap[name].map(subName =>
        getJsModule(subName, jsModule, rawModules, childsMap, jsSources)));
  }

  return jsModule;
};
