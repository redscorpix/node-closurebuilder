const Source = require('./source');
const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');


/**
 * @param {Array<string>} files
 * @param {Cache} cache
 * @param {boolean=} opt_saveSyntaxTree
 * @return {Array<Source>}
 */
const jsFilesToSources = (files, cache, opt_saveSyntaxTree) =>
    files.map(jsPath => {
      let source = cache ? cache.getSource(jsPath) : null;

      if (!source) {
        source = Source.createFromFile(jsPath, opt_saveSyntaxTree);

        if (cache) {
          cache.setSource(jsPath, source);
        }
      }

      return source;
    });

/**
 * @param {Array<string>} jsFiles
 * @param {Cache} cache
 * @param {boolean=} opt_saveSyntaxTree
 * @return {Array<Source>}
 */
exports.findSourcesByJsFiles = (jsFiles, cache, opt_saveSyntaxTree) => {
  const allSources = [];

  if (jsFiles) {
    const pathsMap = {};

    jsFiles.forEach(jsPath => {
      jsPath = path.resolve(jsPath);

      const files = scanTreeForJsFiles(jsPath);
      const sources = jsFilesToSources(files, cache, opt_saveSyntaxTree);

      sources.forEach(jsSource => {
        if (!pathsMap[jsSource.path]) {
          pathsMap[jsSource.path] = 1;
          allSources.push(jsSource);
        }
      });
    });
  }

  return allSources;
};

/**
 * @param {string} jsPath
 * @return {Array<string>}
 */
const scanTreeForJsFiles = jsPath => getFiles(jsPath).filter(jsPath =>
    /^.+\.js$/.test(jsPath));


/**
 * @param {string} content
 * @param {string=} filename
 * @return {!Promise}
 */
exports.writeFile = (content, filename) => new Promise((resolve, reject) =>
    mkdirp(path.dirname(filename), 0755, err => {
      if (!err) {
        try {
          fs.writeFileSync(filename, content);
        } catch (e) {
          err = e;
        }
      }

      if (err) {
        reject(err);
      } else {
        resolve();
      }
    }));

/**
 * @param {string} file
 * @return {!Array<string>}
 */
const getFiles = file => {
  let result = [];
  const stat = fs.statSync(file);

  if (stat && stat.isDirectory()) {
    const subFiles = fs.readdirSync(file);

    subFiles.forEach(subFile => {
      result = result.concat(getFiles(file + '/' + subFile));
    });
  } else {
    result.push(file);
  }

  return result;
};
