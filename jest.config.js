module.exports = {
  // Use babel-jest to transform JavaScript files
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  // An array of regexp pattern strings that are matched against all source file paths, matched files will skip transformation
  transformIgnorePatterns: [
    "/node_modules/(?!@whiskeysockets/baileys).+\\.js$",
  ],
  // Indicates whether each individual test should be reported during the run
  verbose: true,
  // A list of paths to directories that Jest should use to search for files in
  roots: [
    "<rootDir>/tests"
  ],
  // The test environment that will be used for testing
  testEnvironment: "node",
  // Stop running tests after `n` failures
  bail: 1,
};
