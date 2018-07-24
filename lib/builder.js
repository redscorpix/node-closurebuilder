const BuilderBase = require('./builderbase');
const Cache = require('./cache');
const JsModule = require('./jsmodule');
const fs = require('fs');
const path = require('path');
const time = require('./time');
const utils = require('./utils');


class Builder extends BuilderBase {

  /**
   * @param {string} compilerPath
   * @param {string} inputs Files or directories.
   * @param {Array<string>} jsFiles Files or directories.
   * @param {string=} opt_cacheFile
   */
  constructor(compilerPath, inputs, jsFiles, opt_cacheFile) {
    super(compilerPath);

    /** @private {Cache} */
    this._cache = opt_cacheFile ? new Cache(opt_cacheFile) : null;

    /** @type {Array<string>} */
    this.compilerArgs = null;

    /** @type {Array.<string>} */
    this.inputs = inputs;

    /** @type {Array.<string>} */
    this.jsFiles = jsFiles;

    /** @type {string} */
    this.outputPath = '';

    /** @type {string} */
    this.sourceMapPath = '';
  }

  /**
   * @param {string} compilerPath
   * @param {Array<string>} inputs Files or directories.
   * @param {Array<string>} jsFiles Files or directories.
   * @param {Object=} opt_options Fields:
   *    cacheFile (string) — path to cache file.
   *    compilerFlags (Array.<string>) — additional flags to pass to the Closure
   *      compiler.
   *    defines (Object.<boolean|number|string>) — defines for Closure compiler.
   *    externs (Array.<string>) — externs for Closure compiler.
   *    jvmFlags (Array.<string>) — additional flags to pass to the JVM
   *      compiler.
   *    logLevel (BuilderBase.LogLevel) — print log in console.
   *      Defaults to BuilderBase.LogLevel.SHORT.
   *    maxBuffer (number) — in bytes. Defaults to 200 * 1024.
   *    outputFile (string) — if specified, write output to this path instead of
   *      writing to standard output.
   *    sourceMapPath (string) — path to generated source map.
   *    compilerArgs (Array<string>) — additional compiler arguments.
   * @param {function(Error,string)=} opt_callback First argument is error or
   *    null. Second argument is data.
   */
  static compile(compilerPath, inputs, jsFiles, opt_options, opt_callback) {
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

    Builder.compilePromise(compilerPath, inputs, jsFiles, options).
        then(content => callback(null, content), err => callback(err, null));
  }

  /**
   * @param {string} compilerPath
   * @param {Array<string>} inputs Files or directories.
   * @param {Array<string>} jsFiles Files or directories.
   * @param {Object=} opt_options Fields:
   *    cacheFile (string) — path to cache file.
   *    compilerFlags (Array.<string>) — additional flags to pass to the Closure
   *      compiler.
   *    defines (Object.<boolean|number|string>) — defines for Closure compiler.
   *    externs (Array.<string>) — externs for Closure compiler.
   *    jvmFlags (Array.<string>) — additional flags to pass to the JVM
   *      compiler.
   *    logLevel (BuilderBase.LogLevel) — print log in console.
   *      Defaults to BuilderBase.LogLevel.SHORT.
   *    maxBuffer (number) — in bytes. Defaults to 200 * 1024.
   *    outputFile (string) — if specified, write output to this path instead of
   *      writing to standard output.
   *    sourceMapPath (string) — path to generated source map.
   *    compilerArgs (Array<string>) — additional compiler arguments.
   * @return {!Promise<string>} Returns promise with data.
   */
  static compilePromise(compilerPath, inputs, jsFiles, opt_options) {
    /** @type {string} */
    const cacheFile = opt_options && opt_options.cacheFile ?
        opt_options.cacheFile : '';
    const builder = new Builder(compilerPath, inputs, jsFiles, cacheFile);

    if (opt_options) {
      builder.compilerFlags = opt_options.compilerFlags || null;
      builder.definesMap = opt_options.defines || null;
      builder.externs = opt_options.externs || null;
      builder.jvmFlags = opt_options.jvmFlags || null;
      builder.outputPath = opt_options.outputFile || '';

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

  /** @return {Cache} */
  getCache() {
    return this._cache;
  }

  /**
   * @param {function(Error,string)=} opt_callback First argument is error or
   *    null. Second argument is data.
   */
  compile(opt_callback) {
    const callback = opt_callback || function() {};
    this.compilePromise().
        then(content => callback(null, content), err => callback(err, null));
  }

  /** @return {!Promise<string>} Returns promise with data. */
  compilePromise() {
    time.start(!!this.logLevel);

    let inputSources;
    let jsSources;

    time.tick('Scanning paths...');

    const findSourcesByJsFiles = jsFiles => new Promise((resolve, reject) => {
      let sources;

      try {
        sources = utils.findSourcesByJsFiles(jsFiles, this._cache);
      } catch (e) {
        return reject(e);
      }

      resolve(sources);
    });

    return findSourcesByJsFiles(this.jsFiles).
        then(sources => (jsSources = sources)).
        then(() => findSourcesByJsFiles(this.inputs)).
        then(sources => {
          if (this._cache) {
            this._cache.save().then(null, err => console.error(err));
          }

          inputSources = sources;

          /** @type {number} */
          const scannedCount = jsSources.length + inputSources.length;
          time.tick(`${scannedCount} sources scanned.`);

          // Though deps output doesn't need to query the tree, we still build
          // it to validate dependencies.
          time.tick('Building dependency tree...');
        }).
        then(() => {
          const rootModule = new JsModule('main', null, jsSources,
              inputSources);

          return rootModule.build().then(() => rootModule);
        }).
        then(rootModule => this._compile(rootModule));
  }

  /**
   * @param {JsModule} rootModule
   * @return {!Promise<string>}
   * @private
   */
  _compile(rootModule) {
    return this.runCompiler(rootModule).
        then(compiledSource => {
          time.total('Total time. JavaScript compilation succeeded.');

          return this._finish(compiledSource);
        });
  }

  /**
   * @param {string} content
   * @return {!Promise<string>}
   * @private
   */
  _finish(content) {
    return this.outputPath ?
        utils.writeFile(content, this.outputPath).then(() => content) :
        Promise.resolve(content);
  }

  /** @inheritDoc */
  getArgs(rootModule) {
    return super.getArgs(rootModule).then(args => {
      if (this.sourceMapPath) {
        args.push(`--create_source_map "${this.sourceMapPath}"`);
      }

      if (this.compilerArgs) {
        args = args.concat(this.compilerArgs);
      }

      return args;
    });
  }
}
module.exports = Builder;
