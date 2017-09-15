const BuilderBase = require('./builderbase');
const Cache = require('./cache');
const ModuleParser = require('./moduleparser');


class ModuleBuilder extends BuilderBase {

  /**
   * @param {string} compilerPath
   * @param {Object|string} config JSON or path to file.
   * @param {Array<string>} jsFiles Files or directories.
   * @param {string=} opt_cacheFile
   */
  constructor(compilerPath, config, jsFiles, opt_cacheFile) {
    super(compilerPath);

    /** @private {Cache} */
    this._cache = opt_cacheFile ? new Cache(opt_cacheFile) : null;

    /** @type {Array<string>} */
    this.compilerArgs = null;

    /** @type {Array<Object>} */
    this._modulesInfo = null;

    /** @private {ModuleParser} */
    this._parser = new ModuleParser(config, jsFiles, this._cache);

    /** @type {string} */
    this.sourceMapPath = '';
  }

  /**
   * @param {string} compilerPath
   * @param {Object|string} config JSON or path to file.
   * @param {Array<string>} jsFiles Files or directories.
   * @param {Object=} opt_options Fields:
   *    cacheFile (string) — path to cache file.
   *    compilerFlags (Array<string>) — additional flags to pass to the Closure
   *      compiler.
   *    defines (Object<string,boolean|number|string>) — defines for Closure
   *      compiler.
   *    externs (Array<string>) — externs for Closure compiler.
   *    jvmFlags (Array<string>) — additional flags to pass to the JVM compiler.
   *    logLevel (BuilderBase.LogLevel) — print log in console.
   *      Defaults to BuilderBase.LogLevel.SHORT.
   *    maxBuffer (number) — in bytes. Defaults to 200 * 1024.
   *    sourceMapPath (string) — path to generated source map.
   *    compilerArgs (Array<string>) — additional compiler arguments.
   * @param {function(Error,string)=} opt_callback
   */
  static compile(compilerPath, config, jsFiles, opt_options, opt_callback) {
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

    ModuleBuilder.compilePromise(compilerPath, config, jsFiles, options).
        then(content => callback(null, content), err => callback(err, null));
  }

  /**
   * @param {string} compilerPath
   * @param {Object|string} config JSON or path to file.
   * @param {Array<string>} jsFiles Files or directories.
   * @param {Object=} opt_options Fields:
   *    cacheFile (string) — path to cache file.
   *    compilerFlags (Array<string>) — additional flags to pass to the Closure
   *      compiler.
   *    defines (Object<string,boolean|number|string>) — defines for Closure
   *      compiler.
   *    externs (Array<string>) — externs for Closure compiler.
   *    jvmFlags (Array<string>) — additional flags to pass to the JVM compiler.
   *    logLevel (BuilderBase.LogLevel) — print log in console.
   *      Defaults to BuilderBase.LogLevel.SHORT.
   *    maxBuffer (number) — in bytes. Defaults to 200 * 1024.
   *    sourceMapPath (string) — path to generated source map.
   *    compilerArgs (Array<string>) — additional compiler arguments.
   * @return {!Promise<string>}
   */
  static compilePromise(compilerPath, config, jsFiles, opt_options) {
    const cacheFile = opt_options && opt_options.cacheFile ?
        opt_options.cacheFile : '';
    const builder = new ModuleBuilder(compilerPath, config, jsFiles, cacheFile);

    if (opt_options) {
      builder.compilerFlags = opt_options.compilerFlags || null;
      builder.definesMap = opt_options.defines || null;
      builder.externs = opt_options.externs || null;
      builder.jvmFlags = opt_options.jvmFlags || null;

      if (undefined !== opt_options.logLevel) {
        builder.logLevel = opt_options.logLevel;
      }

      if (opt_options.maxBuffer) {
        builder.maxBuffer = opt_options.maxBuffer;
      }

      if (opt_options.sourceMapPath) {
        builder.sourceMapPath = opt_options.sourceMapPath;
      }

      if (opt_options.compilerArgs) {
        builder.compilerArgs = opt_options.compilerArgs;
      }
    }

    return builder.compilePromise();
  }

  /**
   * @param {ModuleBuilder} builder
   * @param {JsModule} module
   * @return {string}
   */
  static getModuleWrapperValue(builder, module) {
    const parent = module.getParent();

    if (builder.getParser().globalScopeName) {
      return parent ?
          ModuleBuilder.MODULE_WRAPPER_WITH_SCOPE :
          ModuleBuilder.ROOT_MODULE_WRAPPER_WITH_SCOPE;
    } else {
      return parent ?
          ModuleBuilder.MODULE_WRAPPER : ModuleBuilder.ROOT_MODULE_WRAPPER;
    }
  }

  /** @return {Cache} */
  getCache() {
    return this._cache;
  }

  /**
   * @param {JsModule} module
   * @return {string}
   * @private
   */
  _getModuleWrapperValue(module) {
    const jsonModuleInfo = JSON.stringify(this._parser.getJsonModuleInfo());
    const jsonModuleUris = JSON.stringify(this._parser.getJsonModuleUris());
    const wrapper = module.wrapper ?
        'string' == typeof module.wrapper ?
            module.wrapper : module.wrapper(this, module) :
        ModuleBuilder.getModuleWrapperValue(this, module);
    const value = wrapper.
        replace(/%globalScopeName%/g, this._parser.globalScopeName).
        replace(/%moduleInfo%/g, jsonModuleInfo.replace(/"/g, '\\"')).
        replace(/%moduleUris%/g, jsonModuleUris.replace(/"/g, '\\"')).
        replace(/%name%/g, module.name).
        replace(/%productionUri%/g, this._parser.productionUri).
        replace(/%renamePrefixNamespace%/g, this._parser.renamePrefixNamespace).
        replace(/%source%/g, '%s');

    return `${module.name}:"${value}"`;
  }

  /**
   * @param {JsModule} module
   * @return {!Array<Object>}
   * @private
   */
  _getModulesInfo(module) {
    let result = [{
      name: module.getModuleFlagValue(),
      wrapper: this._getModuleWrapperValue(module),
    }];

    module.getSubModules().forEach(subModule => {
      result = result.concat(this._getModulesInfo(subModule));
    });

    return result;
  }

  /** @return {ModuleParser} */
  getParser() {
    return this._parser;
  }

  /**
   * @param {function(Error,string)=} opt_callback First argument is error
   *    or null. Second argument is the compiled source, as a string, or empty
   *    string if compilation failed.
   */
  compile(opt_callback) {
    const callback = opt_callback || function() {};
    this.compilePromise().
        then(content => callback(null, content), err => callback(err, null));
  }

  /** @return {!Promise<string>} */
  compilePromise() {
    return this._parser.parse().then(rootModule => {
      if (this._cache) {
        this._cache.save().then(null, err => {});
      }

      return this.runCompiler(rootModule);
    });
  }

  /** @inheritDoc */
  getArgs(rootModule) {
    return super.getArgs(rootModule).
        then(data => {
          let {compilerArgs, javaArgs} = data;

          this._modulesInfo = this._getModulesInfo(rootModule);
          this._modulesInfo.forEach((jsModule, i) => {
            compilerArgs.push('--module ' + jsModule.name);
            compilerArgs.push('--module_wrapper ' + jsModule.wrapper);
          });

          if (this._parser.outputPathPrefix) {
            compilerArgs.push(`--module_output_path_prefix ` +
                `"${this._parser.outputPathPrefix}"`);
          }

          if (this.sourceMapPath) {
            compilerArgs.push('--create_source_map "%outname%.map"');
          }

          if (this.compilerArgs) {
            compilerArgs = compilerArgs.concat(this.compilerArgs);
          }

          return {
            compilerArgs,
            javaArgs,
          }
        });
  }
}
module.exports = ModuleBuilder;


/** @const {string} */
ModuleBuilder.MODULE_WRAPPER =
  '%source%\n' +
  '//# sourceURL=%productionUri%%name%.js';

/** @const {string} */
ModuleBuilder.MODULE_WRAPPER_WITH_SCOPE =
  '(function(%renamePrefixNamespace%){%source%})(%globalScopeName%);\n' +
  '//# sourceURL=%productionUri%%name%.js';

/** @const {string} */
ModuleBuilder.ROOT_MODULE_WRAPPER =
  'MODULE_INFO=%moduleInfo%;\n' +
  'MODULE_URIS=%moduleUris%;\n' +
  'MODULE_USE_DEBUG_MODE=false;\n' +
  '%source%';

/** @const {string} */
ModuleBuilder.ROOT_MODULE_WRAPPER_WITH_SCOPE =
  'MODULE_INFO=%moduleInfo%;\n' +
  'MODULE_URIS=%moduleUris%;\n' +
  'MODULE_USE_DEBUG_MODE=false;\n' +
  '%globalScopeName%={};\n'+
  '(function(%renamePrefixNamespace%){%source%})(%globalScopeName%);';
