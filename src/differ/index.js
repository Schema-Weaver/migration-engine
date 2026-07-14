export {
  SchemaDiffer,
  ObjectMatcher,
  PropertyDiffer,
  DependencyResolver,
  ChangeClassifier,
  RiskTagger,
} from './schema-differ.js';

export { levenshtein, similarity } from './utils/levenshtein.js';
export { buildPath } from './utils/path-builder.js';
export { getCastInfo } from './utils/type-compatibility.js';
