const Cache = require('./cache');
const path = require('path');
const time = require('./time');
const utils = require('./utils');


class DepsWriter {

  /**
   * @param {Array<string>=} opt_jsFiles Paths to files or directories.
   * @param {string=} opt_baseDir
   * @param {string=} opt_prefix
   */
  constructor(opt_jsFiles, opt_baseDir, opt_prefix) {

    /** @private {Cache} */
    this._cache = null;

    /** @type {boolean} */
    this.logPrint = true;

    /** @type {string} */
    this.outputFile = '';

    /** @private {!Object<string,Source>} */
    this._pathToSource = {};

    /** @type {Array<DepsWriter.PreData>} */
    this._preData = [];

    if (opt_jsFiles) {
      this.addFiles(opt_jsFiles, opt_baseDir, opt_prefix);
    }
  }

  /**
   * @param {Object} options Fields:
   *    cacheFile (string) — path to cache file.
   *    files (Array.<string>) — files or directories to scan for JS source
   *      files. Paths of JS files in generated deps file will be relative
   *      to this path.
   *    filesWithDepsPath (Array.<string>) — a path to a source file and
   *      an alternate path to the file in the generated deps file (if either
   *      contains a space, surround with whitespace). This flag may be
   *      specified multiple times.
   *    filesWithPrefix (Array.<string>) — a root directory to scan for JS
   *      source files, plus a prefix (if either contains a space, surround
   *      with quotes). Paths in generated deps file will be relative
   *      to the root, but preceded by the prefix. This flag may be specified
   *      multiple times.
   *    logPrint (boolean) — print log in console. Defaults to true.
   *    outputFile (string) — if specified, write output to this path instead of
   *      writing to standard output.
   * @param {function(Error,string)=} opt_callback First argument is error or
   *    null. Second argument is content.
   */
  static build(options, opt_callback) {
    const callback = opt_callback || function() {};
    DepsWriter.buildPromise(options).
        then(content => callback(null, content), err => content(err, null));
  }

  /**
   * @param {Object} options Fields:
   *    cacheFile (string) — path to cache file.
   *    files (Array.<string>) — files or directories to scan for JS source
   *      files. Paths of JS files in generated deps file will be relative
   *      to this path.
   *    filesWithDepsPath (Array.<string>) — a path to a source file and
   *      an alternate path to the file in the generated deps file (if either
   *      contains a space, surround with whitespace). This flag may be
   *      specified multiple times.
   *    filesWithPrefix (Array.<string>) — a root directory to scan for JS
   *      source files, plus a prefix (if either contains a space, surround
   *      with quotes). Paths in generated deps file will be relative
   *      to the root, but preceded by the prefix. This flag may be specified
   *      multiple times.
   *    logPrint (boolean) — print log in console. Defaults to true.
   *    outputFile (string) — if specified, write output to this path instead of
   *      writing to standard output.
   * @return {!Promise<string>} Returns promise with content.
   */
  static buildPromise(options) {
    const depsWriter = new DepsWriter();

    if (options.cacheFile) {
      depsWriter.setCacheFile(options.cacheFile);
    }

    if (options.files) {
      depsWriter.addFiles(files);
    }

    if (options.filesWithDepsPath) {
      options.filesWithDepsPath.forEach(fileWithDepPath => {
        const pair = getPair(fileWithDepPath);
        const jsFile = pair[0];
        const depPath = pair[1];
        depsWriter.addFileWithPath(jsFile, depPath);
      });
    }

    if (options.filesWithPrefix) {
      options.filesWithPrefix.forEach(fileWithPrefix => {
        const pair = getPair(fileWithPrefix);
        const jsFile = pair[0];
        const prefix = pair[1];
        depsWriter.addFiles([jsFile], '', prefix);
      });
    }

    depsWriter.outputFile = options.outputFile || '';

    if ('boolean' == typeof options.logPrint) {
      depsWriter.logPrint = options.logPrint;
    }

    return depsWriter.buildPromise();
  }

  /**
   * @param {function(Error,string)=} opt_callback First argument is error or
   *    null. Second argument is content.
   */
  build(opt_callback) {
    const callback = opt_callback || function() {};
    this.buildPromise().
        then(content => callback(null, content), err => callback(err, null));
  }

  /** @return {!Promise<string>} Returns promise with content. */
  buildPromise() {
    time.start(this.logPrint);

    return this._getSourcesMap(this._preData).
        then(pathToSource => this._write(pathToSource)).
        then(content => {
          time.total('Total time. Deps generated');

          return content;
        });
  }

  /**
   * @param {Object.<Source>} pathToSource
   * @return {!Promise<string>}
   * @private
   */
  _write(pathToSource) {
    time.tick('Generate deps');

    const content = '// This file was autogenerated by ' + __filename +
        '.\n// Please do not edit.\n' + makeDepsFile(pathToSource);

    return this.outputFile ?
        utils.writeFile(content, this.outputFile).then(() => content) :
        Promise.resolve(content);
  }

  /** @return {Cache} */
  getCache() {
    return this._cache;
  }

  /** @param {string} file */
  setCacheFile(file) {
    this._cache = new Cache(file);
  }

  /**
   * @param {string} jsFile Path to file.
   * @param {string} path
   */
  addFileWithPath(jsFile, path) {
    this._preData.push({
      baseDir: '',
      jsFiles: [jsFile],
      path: path,
      prefix: '',
    })
  }

  /**
   * @param {Array<string>} jsFiles Paths to files or directories.
   * @param {string=} opt_baseDir
   * @param {string=} opt_prefix
   */
  addFiles(jsFiles, opt_baseDir, opt_prefix) {
    this._preData.push({
      baseDir: opt_baseDir || '',
      jsFiles: jsFiles,
      path: '',
      prefix: opt_prefix || '',
    });
  }

  /**
   * @param {Array<DepsWriter.PreData>} preData
   * @return {!Promise<!Object<string,Source>>}
   * @private
   */
  _getSourcesMap(preData, callback) {
    time.tick('Search sources by JS files');

    /** @type {!Object<Source>} */
    const pathToSource = {};

    for (let i = 0; i < preData.length; i++) {
      const item = preData[i];
      const baseDir = item.baseDir ? path.resolve(item.baseDir) : __dirname;
      let jsSources;

      try {
        jsSources = utils.findSourcesByJsFiles(item.jsFiles, this._cache);
      } catch (e) {
        return Promise.reject(e);
      }

      jsSources.forEach(jsSource => {
        if (item.path) {
          pathToSource[item.path] = jsSource;
        } else {
          const depPath = item.prefix + path.relative(baseDir, jsSource.path);
          pathToSource[depPath] = jsSource;
        }
      });
    }

    if (this._cache) {
      this._cache.save().then(null, err => console.error(err));
    }

    return Promise.resolve(pathToSource);
  }
}
module.exports = DepsWriter;

/**
 * @typedef {{
 *  baseDir: string,
 *  jsFiles: Array.<string>,
 *  path: string,
 *  prefix: string,
 * }}
 */
DepsWriter.PreData;

/**
 * Return a string as a shell-parsed tuple. Two values expected.
 * @param {string} s
 * @return {!Array<string>}
 */
const getPair = s => s.replace('\\', '\\\\').split(' ');

/**
 * Make a generated deps file.
 * @param {Object<string,Source>} sourceMap A dict map of the source path
 *    to Source object.
 * @return {string} A generated deps file source.
 */
const makeDepsFile = sourceMap => {
  const paths = [];

  for (let path in sourceMap) {
    paths.push(path);
  }

  // Write in path alphabetical order
  paths.sort();

  const lines = [];

  paths.forEach(path => {
    // We don't need to add entries that don't provide anything.
    if (sourceMap[path].provides.length) {
      lines.push(getDepsLine(path, sourceMap[path]));
    }
  });

  return lines.join('');
};

/**
 * Get a deps.js file string for a source.
 * @param {string} path
 * @param {Source} jsSource
 * @return {string}
 */
const getDepsLine = (path, jsSource) => {
  const provides = [...jsSource.provides];
  const requires = [...jsSource.requires];
  provides.sort();
  requires.sort();

  const strPath = path.replace(/\\/g, '/');
  const strProvides = provides.map(provide => `'${provide}'`).join(', ');
  const strRequires = requires.map(jsRequire => `'${jsRequire}'`).join(', ');
  const strIsModule = jsSource.isModule ? 'true' : 'false';

  return `goog.addDependency('${strPath}', ` +
      `[${strProvides}], [${strRequires}], ${strIsModule});\n`;
};
