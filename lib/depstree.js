/**
 * Class to represent a full Closure Library dependency tree.
 *
 * Offers a queryable tree of dependencies of a given set of sources.  The tree
 * will also do logical validation to prevent duplicate provides and circular
 * dependencies.
 */


/**
 * Represents the set of dependencies between source files.
 *
 * @param {Array.<Source>} sources
 * @constructor
 */
var DepsTree = module.exports = function(sources) {
  /** @private {Array.<Source>} */
  this._sources = sources;
  /** @private {Object.<Source>} */
  this._providesMap = this._getProvidesMap(this._sources);

  // Check that all required namespaces are provided.
  /*this._sources.forEach(function(source) {
    source.requires.forEach(function(require) {
      if (!this._providesMap[require]) {
        throw new Error('Namespace "' + require + '" never provided. ' +
          'Required in ' + source);
      }
    }, this);
  }, this);*/
};


/**
 * Resolve dependencies for Closure source files.
 *
 * Follows the dependency tree down and builds a list of sources in dependency
 * order.  This function will recursively call itself to fill all dependencies
 * below the requested namespaces, and then append its sources at the end of
 * the list.
 *
 * @param {string} requiredNamespace
 * @param {!Array.<Source>} depsList List of sources in dependency order.
 *    This function will append the required source once all of its dependencies
 *    are satisfied.
 * @param {Object.<string>} providesMap Map from namespace to source that
 *    provides it.
 * @param {Array.<string>} traversalPath List of namespaces of our path from
 *    the root down the dependency/recursion tree.  Used to identify cyclical
 *    dependencies. This is a list used as a stack -- when the function is
 *    entered, the current namespace is pushed and popped right before
 *    returning. Each recursive call will check that the current namespace does
 *    not appear in the list, throwing a error if it does.
 * @return {!Array.<Source>} The given depsList object filled with sources
 *    in dependency order.
 * @private
 */
DepsTree._resolveDependencies = function(requiredNamespace, depsList,
    providesMap, traversalPath) {
  /** @type {Source} */
  var source = providesMap[requiredNamespace];

  if (!source) {
    var errMessage = 'Namespace "' + requiredNamespace + '" never provided.';
    var popPath = traversalPath.pop();

    if (popPath && providesMap[popPath]) {
      errMessage += ' Required in ' + providesMap[popPath].path;
    }

    throw new Error(errMessage);
  }

  if (-1 < traversalPath.indexOf(requiredNamespace)) {
    traversalPath.push(requiredNamespace); // do this *after* the test

    // This must be a cycle.
    throw new Error('Encountered circular dependency:\n\n' + traversalPath);
  }

  // If we don't have the source yet, we'll have to visit this namespace and
  // add the required dependencies to depsList.
  if (-1 == depsList.indexOf(source)) {
    traversalPath.push(requiredNamespace);

    source.requires.forEach(function(require) {
      // Append all other dependencies before we append our own.
      DepsTree._resolveDependencies(
        require, depsList, providesMap, traversalPath);
    }, this);

    depsList.push(source);
    traversalPath.pop();
  }

  return depsList;
};


/**
 * Get source dependencies, in order.
 *
 * @param {Array.<Source>} inputSources List of input source objects.
 * @return {!Array.<Source>} A list of source objects that provide those
 *    namespaces and all requirements, in dependency order.
 */
DepsTree.prototype.getDependencies = function(inputSources) {
  /** @type {!Array.<Source>} */
  var depsSources = [];
  var map = {};

  inputSources.forEach(function(jsSource) {
    jsSource.requires.forEach(function(namespace) {
      var deps = DepsTree._resolveDependencies(
        namespace, [], this._providesMap, []);

      deps.forEach(function(source) {
        if (!map[source.path]) {
          depsSources.push(source);
          map[source.path] = 1;
        }
      }, this);
    }, this);

    if (!map[jsSource.path]) {
      depsSources.push(jsSource);
      map[jsSource.path] = 1;
    }
  }, this);

  return depsSources;
};

/**
 * @param {Array.<Source>} sources
 * @return {!Object.<Source>}
 * @private
 */
DepsTree.prototype._getProvidesMap = function(sources) {
  var map = {};

  // Ensure nothing was provided twice.
  sources.forEach(function(source) {
    source.provides.forEach(function(provide) {
      if (map[provide] && map[provide].path != source.path) {
        throw new Error('Namespace "' + provide + '" provided more than once ' +
          'in sources:\n\n' + [map[provide], source]);
      }

      map[provide] = source;
    }, this);
  }, this);

  return map;
};
