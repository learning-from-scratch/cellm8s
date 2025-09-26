module.exports = {
   testEnvironment: "node",
   reporters: [
      "default",
      ["jest-junit", {
         outputDirectory: ".",
         outputName: "junit.xml",
         addFileAttribute: "true"
      }]
   ],
   collectCoverage: true,
   coverageReporters: ["lcov", "text-summary"],
   coverageDirectory: "coverage"
};
